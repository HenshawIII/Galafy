import {
  Injectable,
  BadRequestException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHmac } from 'crypto';
import { DatabaseService } from '../database/database.service.js';
import { InflowWebhookDto, PayoutWebhookDto } from './dto/webhook.dto.js';
import { TransactionType, TransactionDirection, TransactionStatus, FundingStatus, PayoutStatus, FundingChannel } from '../../generated/prisma/enums.js';
import { Decimal } from '@prisma/client/runtime/library';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { config } from 'dotenv';
import { normalizeToKobo } from '../common/utils/money.util.js';
import { calculateFundingFee } from '../common/utils/fee.util.js';
import { OrganizationWalletService } from '../common/services/organization-wallet.service.js';
config();

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);
  private readonly apiKey: string;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly organizationWalletService: OrganizationWalletService,
  ) {
    this.apiKey = process.env.PROVIDER_API_KEY || '';
    if (!this.apiKey) {
      this.logger.warn('PROVIDER_API_KEY not found. Webhook signature verification will fail.');
    }
  }

  /**
   * Verify webhook signature
   */
  verifySignature(signature: string, rawBody: string): boolean {
    if (!signature || !rawBody) {
      return false;
    }

    const hmac = createHmac('sha512', this.apiKey);
    hmac.update(rawBody, 'utf8');
    const computedSignature = hmac.digest('hex');

    return computedSignature === signature;
  }

  /**
   * Handle INFLOW webhook (NIP - payment received)
   * Implements idempotency and fee calculation with concurrency handling
   */
  async handleInflowWebhook(webhookDto: InflowWebhookDto) {
    const { data } = webhookDto;

    // Normalize gross amount to kobo precision
    const grossAmount = normalizeToKobo(data.amount);
    const providerFee = normalizeToKobo(data.fee || 0);

    // Use database transaction with row locks for concurrency and idempotency
    const result = await this.databaseService.$transaction(
      async (tx: Prisma.TransactionClient) => {
        // Find wallet by account number
        const wallet = await tx.wallet.findFirst({
          where: { virtualAccountNumber: data.accountNumber },
          include: { customer: true },
        });

        if (!wallet) {
          this.logger.warn(`Wallet not found for account number: ${data.accountNumber}`);
          throw new NotFoundException(`Wallet not found for account number: ${data.accountNumber}`);
        }

        // Lock wallet row to prevent concurrent processing
        await tx.$queryRaw`
          SELECT id FROM "Wallet" WHERE id = ${wallet.id} FOR UPDATE
        `;

        // Check idempotency: if this provider reference was already processed, return existing
        const existingFunding = await tx.fundingTransaction.findUnique({
          where: { providerReference: data.reference },
          include: {
            transaction: true,
          },
        });

        if (existingFunding) {
          this.logger.log(
            `INFLOW webhook already processed (idempotency): ${data.reference} - returning existing transaction`,
          );
          return {
            status: 'success',
            message: 'Webhook already processed (idempotent)',
            transactionId: existingFunding.transactionId,
            fundingTransactionId: existingFunding.id,
            isDuplicate: true,
          };
        }

        // Calculate admin fee based on amount threshold
        const { fee: adminFee, netAmount, feePercentage } = calculateFundingFee(grossAmount);

        // Get admin wallet account number (for tracking purposes)
        const adminWalletAccountNumber = this.organizationWalletService.getAdminWalletAccountNumber();

        // Re-fetch user wallet with lock to get latest balances
        const lockedUserWallet = await tx.wallet.findUnique({
          where: { id: wallet.id },
          select: { id: true, availableBalance: true, ledgerBalance: true, currencyId: true, customerId: true },
        });

        if (!lockedUserWallet) {
          throw new NotFoundException('User wallet not found after lock');
        }

        // Generate internal references
        const userTransactionRef = `INFLOW-${randomUUID()}`;
        const groupReference = `GRP-${randomUUID()}`;

        // Create Transaction record for user wallet (net amount)
        // Transaction table only tracks user-facing transactions
        const userTransaction = await tx.transaction.create({
          data: {
            walletId: wallet.id,
            type: TransactionType.INFLOW,
            direction: TransactionDirection.CREDIT,
            status: TransactionStatus.SUCCESS,
            amount: netAmount, // User receives net amount (after admin fee)
            currencyId: wallet.currencyId,
            reference: userTransactionRef,
            externalReference: data.reference, // Provider reference
            groupReference,
            narration: data.description || 'Inflow payment',
            metadata: {
              senderName: data.senderName,
              senderBank: data.senderBank,
              providerFee: providerFee.toString(),
              adminFee: adminFee.toString(),
              grossAmount: grossAmount.toString(),
              feePercentage: feePercentage.toString(),
              feeType: 'funding',
            },
          },
        });

        // Create FundingTransaction record (stores gross amount and admin fee)
        const fundingTransaction = await tx.fundingTransaction.create({
          data: {
            walletId: wallet.id,
            amount: grossAmount, // Store gross amount
            fee: adminFee, // Store admin fee (not provider fee)
            channel: FundingChannel.BANK_TRANSFER,
            status: FundingStatus.SUCCESS,
            transactionId: userTransaction.id,
            providerReference: data.reference, // Used for idempotency
            providerPayload: webhookDto as any,
          },
        });

        // Create AdminFee record (separate table for fee tracking)
        await tx.adminFee.create({
          data: {
            walletId: wallet.id,
            customerId: lockedUserWallet.customerId,
            amount: adminFee, // The fee amount
            feeType: 'funding',
            feePercentage: feePercentage,
            relatedTransactionId: userTransaction.id, // Link to user's inflow transaction
            fundingTransactionId: fundingTransaction.id, // Link to funding transaction
            status: 'COLLECTED',
            grossAmount: grossAmount,
            netAmount: netAmount,
            adminWalletAccountNumber: adminWalletAccountNumber,
            metadata: {
              providerReference: data.reference,
              providerFee: providerFee.toString(),
              threshold: grossAmount.lte(new Decimal('100000.00')) ? 'below_100k' : 'above_100k',
              senderName: data.senderName,
              senderBank: data.senderBank,
            },
          },
        });

        // Update user wallet balance (net amount)
        const newUserAvailableBalance = normalizeToKobo(lockedUserWallet.availableBalance.plus(netAmount));
        const newUserLedgerBalance = normalizeToKobo(lockedUserWallet.ledgerBalance.plus(netAmount));

        // Update user wallet
        await tx.wallet.update({
          where: { id: wallet.id },
          data: {
            availableBalance: newUserAvailableBalance,
            ledgerBalance: newUserLedgerBalance,
          },
        });

        // Store webhook event
        await tx.providerWebhookEvent.create({
          data: {
            event: 'nip',
            paymentReference: data.reference,
            payload: webhookDto as any,
            processingStatus: 'PROCESSED',
          },
        });

        this.logger.log(
          `INFLOW webhook processed: ${data.reference} - Gross: ${grossAmount.toString()}, Fee: ${adminFee.toString()}, Net: ${netAmount.toString()} to wallet ${wallet.id}`,
        );

        return {
          status: 'success',
          message: 'Webhook processed successfully',
          transactionId: userTransaction.id,
          fundingTransactionId: fundingTransaction.id,
          isDuplicate: false,
        };
      },
      {
        timeout: 10000, // 10 second timeout
      },
    );

    return result;
  }

  /**
   * Handle PAYOUT webhook (payout status update)
   * Handles fee-based payout flow with organization wallet
   */
  async handlePayoutWebhook(webhookDto: PayoutWebhookDto) {
    const { data } = webhookDto;

    // Use database transaction for atomicity
    const result = await this.databaseService.$transaction(
      async (tx: Prisma.TransactionClient) => {
        // Find payout transaction by provider reference
        const payoutTransaction = await tx.payoutTransaction.findUnique({
          where: { providerTransactionRef: data.paymentReference },
          include: {
            transaction: true,
            wallet: true,
          },
        });

        if (!payoutTransaction) {
          this.logger.warn(`Payout transaction not found for reference: ${data.paymentReference}`);
          throw new NotFoundException(`Payout transaction not found for reference: ${data.paymentReference}`);
        }

        // Map provider status to our status
        let payoutStatus: PayoutStatus;
        let transactionStatus: TransactionStatus;

        switch (data.status.toLowerCase()) {
          case 'success':
            payoutStatus = PayoutStatus.SUCCESS;
            transactionStatus = TransactionStatus.SUCCESS;
            break;
          case 'failed':
            payoutStatus = PayoutStatus.FAILED;
            transactionStatus = TransactionStatus.FAILED;
            break;
          case 'rejected':
            payoutStatus = PayoutStatus.REJECTED;
            transactionStatus = TransactionStatus.FAILED;
            break;
          default:
            payoutStatus = PayoutStatus.PROCESSING;
            transactionStatus = TransactionStatus.PROCESSING;
        }

        // Calculate net amount (97% of gross amount)
        const grossAmount = payoutTransaction.amount;
        const fee = payoutTransaction.fee;
        const netAmount = normalizeToKobo(grossAmount.minus(fee));

        // Update payout transaction
        await tx.payoutTransaction.update({
          where: { id: payoutTransaction.id },
          data: {
            status: payoutStatus,
            providerPayload: {
              ...(payoutTransaction.providerPayload as any),
              webhook: webhookDto as any,
            },
          },
        });

        // Update main transaction (user debit transaction)
        await tx.transaction.update({
          where: { id: payoutTransaction.transactionId },
          data: {
            status: transactionStatus,
            metadata: {
              ...(payoutTransaction.transaction.metadata as any),
              deliveryStatusMessage: data.deliveryStatusMessage,
              deliveryStatusCode: data.deliveryStatusCode,
              dateOfTransaction: data.dateOfTransaction,
              webhookStatus: data.status,
            },
          },
        });

        // Update AdminFee status based on payout result
        const adminFee = await tx.adminFee.findUnique({
          where: { payoutTransactionId: payoutTransaction.id },
        });

        if (adminFee) {
          let feeStatus = 'COLLECTED';
          if (payoutStatus === PayoutStatus.FAILED || payoutStatus === PayoutStatus.REJECTED) {
            feeStatus = 'REVERSED'; // Fee is reversed when payout fails
          }

          await tx.adminFee.update({
            where: { id: adminFee.id },
            data: {
              status: feeStatus,
              metadata: {
                ...(adminFee.metadata as any),
                webhookStatus: data.status,
                deliveryStatusMessage: data.deliveryStatusMessage,
                deliveryStatusCode: data.deliveryStatusCode,
                dateOfTransaction: data.dateOfTransaction,
              },
          },
          });
        }

        // If failed, refund full amount to user wallet
        if (payoutStatus === PayoutStatus.FAILED || payoutStatus === PayoutStatus.REJECTED) {
          // Lock user wallet
          await tx.$queryRaw`
            SELECT id FROM "Wallet" WHERE id = ${payoutTransaction.wallet.id} FOR UPDATE
          `;

          // Re-fetch user wallet with lock
          const lockedUserWallet = await tx.wallet.findUnique({
            where: { id: payoutTransaction.wallet.id },
            select: { id: true, availableBalance: true, ledgerBalance: true },
          });

          if (lockedUserWallet) {
            // Refund full gross amount to user wallet
            const newAvailableBalance = normalizeToKobo(lockedUserWallet.availableBalance.plus(grossAmount));
            const newLedgerBalance = normalizeToKobo(lockedUserWallet.ledgerBalance.plus(grossAmount));

            await tx.wallet.update({
              where: { id: payoutTransaction.wallet.id },
              data: {
                availableBalance: newAvailableBalance,
                ledgerBalance: newLedgerBalance,
              },
            });

            this.logger.log(
              `Payout failed: Refunded ${grossAmount.toString()} to user wallet ${payoutTransaction.wallet.id}`,
            );
          }
        }

        // Store webhook event
        await tx.providerWebhookEvent.create({
          data: {
            event: 'payout',
            paymentReference: data.paymentReference,
            payload: webhookDto as any,
            processingStatus: 'PROCESSED',
          },
        });

        this.logger.log(`PAYOUT webhook processed: ${data.paymentReference} - Status: ${data.status}`);

        return {
          status: 'success',
          message: 'Webhook processed successfully',
          payoutTransactionId: payoutTransaction.id,
          transactionId: payoutTransaction.transactionId,
        };
      },
      {
        timeout: 10000,
      },
    );

    return result;
  }
}

