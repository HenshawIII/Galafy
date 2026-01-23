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
import { WalletRiskService } from '../common/services/wallet-risk.service.js';
import { ProviderService } from '../provider/provider.service.js';
import { EmailService } from '../users/email.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '../config/config.service.js';
config();

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);
  private readonly apiKey: string;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly organizationWalletService: OrganizationWalletService,
    private readonly providerService: ProviderService,
    private readonly walletRiskService: WalletRiskService,
    private readonly emailService: EmailService,
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService,
    private readonly configService: ConfigService,
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

    // Find wallet first to get wallet ID for risk score update
    const wallet = await this.databaseService.wallet.findFirst({
      where: { virtualAccountNumber: data.accountNumber },
    });

    if (!wallet) {
      throw new NotFoundException(`Wallet not found for account number: ${data.accountNumber}`);
    }

    const walletId = wallet.id;

    // Use database transaction with row locks for concurrency and idempotency
    const result = await this.databaseService.$transaction(
      async (tx: Prisma.TransactionClient) => {
        // Re-fetch wallet within transaction for locking
        const wallet = await tx.wallet.findFirst({
          where: { virtualAccountNumber: data.accountNumber },
          include: { 
            customer: {
              include: {
                user: true,
              },
            },
          },
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
        const { fee: adminFee, netAmount, feePercentage } = await calculateFundingFee(grossAmount, this.configService);

        // Get admin wallet account number (for tracking purposes)
        const adminWalletAccountNumber = this.organizationWalletService.getAdminWalletAccountNumber();

        // Re-fetch user wallet with lock to get latest balances
        // Need virtualAccountNumber for wallet-to-wallet transfer
        const lockedUserWallet = await tx.wallet.findUnique({
          where: { id: wallet.id },
          select: { 
            id: true, 
            availableBalance: true, 
            ledgerBalance: true, 
            currencyId: true, 
            customerId: true,
            virtualAccountNumber: true,
          },
        });

        if (!lockedUserWallet) {
          throw new NotFoundException('User wallet not found after lock');
        }

        if (!lockedUserWallet.virtualAccountNumber) {
          throw new BadRequestException('User wallet does not have a virtual account number');
        }

        // Generate internal references
        const userTransactionRef = `INFLOW-${randomUUID()}`;
        const feeTransferRef = `FEE-TRANSFER-${randomUUID()}`;
        const groupReference = `GRP-${randomUUID()}`;

        // Step 1: Credit user wallet with grossAmount (to match provider state)
        // Provider has already credited the user wallet with grossAmount via the webhook
        const newUserAvailableBalanceAfterCredit = normalizeToKobo(lockedUserWallet.availableBalance.plus(grossAmount));
        const newUserLedgerBalanceAfterCredit = normalizeToKobo(lockedUserWallet.ledgerBalance.plus(grossAmount));

        // Step 2: Execute wallet-to-wallet transfer: user wallet → org wallet for adminFee
        // This syncs our provider records with our database
        const feeTransferResponse = await this.providerService.walletToWalletTransfer({
          fromWalletId: lockedUserWallet.virtualAccountNumber,
          toWalletId: adminWalletAccountNumber,
          amount: adminFee.toNumber(),
          currencyId: wallet.currencyId || "fd5e474d-bb42-4db1-ab74-e8d2a01047e9",
          description: `Admin fee from funding: ${data.reference}`,
          reference: feeTransferRef,
        });

        if (!feeTransferResponse.success) {
          this.logger.error(
            `Failed to transfer admin fee to organization wallet: ${feeTransferResponse.message}. ` +
            `User wallet has been credited with grossAmount but fee transfer failed.`,
          );
          throw new BadRequestException(
            `Failed to transfer admin fee to organization wallet: ${feeTransferResponse.message}`,
          );
        }

        // Step 3: Update user wallet balance: grossAmount - adminFee = netAmount
        // After the transfer, user wallet should have netAmount
        const finalUserAvailableBalance = normalizeToKobo(newUserAvailableBalanceAfterCredit.minus(adminFee));
        const finalUserLedgerBalance = normalizeToKobo(newUserLedgerBalanceAfterCredit.minus(adminFee));

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
              feeTransferReference: feeTransferRef,
              feeTransferResponse: feeTransferResponse.data,
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

        // Log funding transaction
        this.logger.log(
          `💰 FUNDING TRANSACTION: GrossAmount=${grossAmount.toString()}, ` +
          `NetAmount=${netAmount.toString()}, AdminFee=${adminFee.toString()}, ` +
          `ProviderFee=${providerFee.toString()}, ` +
          `WalletId=${wallet.id}, AccountNumber=${data.accountNumber}, ` +
          `TxId=${userTransaction.id}, FundingTxId=${fundingTransaction.id}, ` +
          `ProviderRef=${data.reference}, InternalRef=${userTransactionRef}, ` +
          `SenderName="${data.senderName}", SenderBank="${data.senderBank}", ` +
          `Description="${data.description || 'Inflow payment'}"`,
        );

        // Create AdminFee record (separate table for fee tracking)
        // Normalize feePercentage to ensure it fits in DECIMAL(5,4) - max value is 9.9999
        // feePercentage should be between 0 and 1 (e.g., 0.10 for 10%), so we ensure it's properly formatted
        const normalizedFeePercentage = feePercentage.toDecimalPlaces(4, Decimal.ROUND_HALF_EVEN);
        
        // Validate that feePercentage is within bounds (should be < 10 for DECIMAL(5,4))
        if (normalizedFeePercentage.gte(new Decimal('10'))) {
          this.logger.error(
            `Fee percentage ${normalizedFeePercentage.toString()} exceeds maximum allowed value (9.9999). ` +
            `This might indicate an incorrectly configured env variable. Expected decimal (e.g., 0.10 for 10%), not percentage (e.g., 10).`,
          );
          throw new BadRequestException(
            `Invalid fee percentage: ${normalizedFeePercentage.toString()}. ` +
            `Fee percentage must be less than 10. Please check ADMIN_FUNDING_FEE environment variable.`,
          );
        }

        await tx.adminFee.create({
          data: {
            walletId: wallet.id,
            customerId: lockedUserWallet.customerId,
            amount: adminFee, // The fee amount
            feeType: 'funding',
            feePercentage: normalizedFeePercentage,
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
              feeTransferReference: feeTransferRef,
              feeTransferResponse: feeTransferResponse.data,
            },
          },
        });

        // Update user wallet balance (net amount after fee transfer)
        await tx.wallet.update({
          where: { id: wallet.id },
          data: {
            availableBalance: finalUserAvailableBalance,
            ledgerBalance: finalUserLedgerBalance,
          },
        });

        // Try to update org wallet balance if it exists in our database
        const orgWallet = await this.organizationWalletService.getAdminWalletRecord();
        if (orgWallet) {
          // Lock org wallet
          await tx.$queryRaw`
            SELECT id FROM "Wallet" WHERE id = ${orgWallet.id} FOR UPDATE
          `;

          const lockedOrgWallet = await tx.wallet.findUnique({
            where: { id: orgWallet.id },
            select: { id: true, availableBalance: true, ledgerBalance: true },
          });

          if (lockedOrgWallet) {
            const newOrgAvailableBalance = normalizeToKobo(lockedOrgWallet.availableBalance.plus(adminFee));
            const newOrgLedgerBalance = normalizeToKobo(lockedOrgWallet.ledgerBalance.plus(adminFee));

            await tx.wallet.update({
              where: { id: orgWallet.id },
              data: {
                availableBalance: newOrgAvailableBalance,
                ledgerBalance: newOrgLedgerBalance,
              },
            });
          }
        }

        // Store webhook event
        await tx.providerWebhookEvent.create({
          data: {
            event: 'nip',
            paymentReference: data.reference,
            payload: webhookDto as any,
            processingStatus: 'PROCESSED',
          },
        });

        // Additional summary log (keeping existing log for backward compatibility)
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

    // Recalculate risk score after transaction (outside transaction to avoid blocking)
    // This runs asynchronously so it doesn't slow down the webhook response
    this.walletRiskService.updateWalletRiskScore(walletId).catch((error) => {
      this.logger.error(`Failed to update risk score after inflow: ${error.message}`);
    });

    // Send email notification for wallet funding (outside transaction to avoid blocking)
    if (result.status === 'success' && !result.isDuplicate) {
      // Fetch user email and funding transaction from database
      const walletWithUser = await this.databaseService.wallet.findUnique({
        where: { id: walletId },
        include: {
          customer: {
            include: {
              user: true,
            },
          },
          fundings: {
            where: {
              providerReference: data.reference,
            },
            orderBy: {
              createdAt: 'desc',
            },
            take: 1,
          },
        },
      });

      if (walletWithUser?.customer?.user?.email && walletWithUser.virtualAccountNumber) {
        const amountFormatted = grossAmount.toFixed(2);
        const fundingTransaction = walletWithUser.fundings?.[0];
        const firstName = walletWithUser.customer.user.firstName || walletWithUser.customer.firstName || undefined;
        const paymentMethod = fundingTransaction?.channel || 'BANK_TRANSFER';
        const fundingDate = fundingTransaction?.createdAt || new Date();

        this.emailService.sendWalletFundingAlert(
          walletWithUser.customer.user.email,
          amountFormatted,
          walletWithUser.virtualAccountNumber,
          data.reference,
          firstName,
          paymentMethod,
          fundingDate,
        ).catch((error) => {
          this.logger.error(`Failed to send wallet funding email: ${error.message}`);
        });

        // Send push notification for inflow received
        const walletOwnerUserId = walletWithUser.customer.userId;
        if (walletOwnerUserId) {
          try {
            await this.notificationsService.sendNotificationIfEnabled(
              walletOwnerUserId,
              {
                notification: {
                  title: 'Wallet Funded',
                  body: `You received ₦${amountFormatted} in your wallet`,
                },
                data: {
                  type: 'INFLOW_RECEIVED',
                  amount: amountFormatted,
                  reference: data.reference,
                  walletId: walletId,
                  virtualAccountNumber: walletWithUser.virtualAccountNumber || '',
                  paymentMethod: paymentMethod,
                },
              },
            );
          } catch (notificationError: any) {
            // Log error but don't fail the webhook - notification is optional
            this.logger.warn(
              `Failed to send inflow push notification: ${notificationError.message}`,
            );
          }
        }
      }
    }

    return result;
  }

  /**
   * Handle PAYOUT webhook (payout status update)
   * Handles fee-based payout flow with organization wallet
   */
  async handlePayoutWebhook(webhookDto: PayoutWebhookDto) {
    const { data } = webhookDto;

    // Find payout transaction first to get wallet ID for risk score update
    const payoutTransaction = await this.databaseService.payoutTransaction.findUnique({
      where: { providerTransactionRef: data.paymentReference },
      select: { walletId: true },
    });

    if (!payoutTransaction) {
      this.logger.warn(`Payout transaction not found for reference: ${data.paymentReference}`);
      throw new NotFoundException(`Payout transaction not found for reference: ${data.paymentReference}`);
    }

    const walletId = payoutTransaction.walletId;

    // Use database transaction for atomicity
    const result = await this.databaseService.$transaction(
      async (tx: Prisma.TransactionClient) => {
        // Re-fetch payout transaction within transaction
        const payoutTransaction = await tx.payoutTransaction.findUnique({
          where: { providerTransactionRef: data.paymentReference },
          include: {
            transaction: true,
            wallet: {
              include: {
                customer: {
                  include: {
                    user: true,
                  },
                },
              },
            },
            bankAccount: true,
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
          // Check if refund has already been processed (idempotency check)
          // Look for existing refund transaction with this payment reference
          const existingRefund = await tx.transaction.findFirst({
            where: {
              walletId: payoutTransaction.wallet.id,
              externalReference: data.paymentReference,
              type: TransactionType.PAYOUT,
              direction: TransactionDirection.CREDIT,
              narration: {
                contains: 'Payout refund',
              },
            },
          });

          if (existingRefund) {
            this.logger.log(
              `Refund already processed for payout ${data.paymentReference}. ` +
              `Skipping refund transfer. Existing refund transaction: ${existingRefund.id}`
            );
          } else {
            // Get organization wallet account number
            const adminWalletAccountNumber = this.organizationWalletService.getAdminWalletAccountNumber();
            
            // Get user wallet details including virtualAccountNumber
            const userWallet = await tx.wallet.findUnique({
              where: { id: payoutTransaction.wallet.id },
              select: { 
                id: true, 
                virtualAccountNumber: true, 
                currencyId: true,
                availableBalance: true,
                ledgerBalance: true,
              },
            });

            if (!userWallet) {
              this.logger.error(`User wallet not found for refund: ${payoutTransaction.wallet.id}`);
              throw new NotFoundException(`User wallet not found for refund`);
            }

            if (!userWallet.virtualAccountNumber) {
              this.logger.error(`User wallet ${payoutTransaction.wallet.id} does not have a virtual account number for refund`);
              throw new BadRequestException(`User wallet does not have a virtual account number. Cannot process refund.`);
            }

            // Transfer grossAmount from organization wallet back to user wallet via provider
            const refundReference = `REFUND-${data.paymentReference}-${randomUUID()}`;
            
            try {
              const refundResponse = await this.providerService.walletToWalletTransfer({
                fromWalletId: adminWalletAccountNumber,
                toWalletId: userWallet.virtualAccountNumber,
                amount: grossAmount.toNumber(),
                currencyId: userWallet.currencyId || "fd5e474d-bb42-4db1-ab74-e8d2a01047e9",
                description: `Payout refund: ${data.paymentReference}`,
                reference: refundReference,
              });

              if (!refundResponse.success) {
                this.logger.error(
                  `Failed to refund payout via provider: ${refundResponse.message}. ` +
                  `Organization wallet has ${grossAmount.toString()} that needs to be refunded to user wallet ${payoutTransaction.wallet.id}. ` +
                  `Payment Reference: ${data.paymentReference}`
                );
                throw new BadRequestException(
                  `Failed to process refund: ${refundResponse.message}. Please contact support.`
                );
              }

              // Lock user wallet for balance update
              await tx.$queryRaw`
                SELECT id FROM "Wallet" WHERE id = ${payoutTransaction.wallet.id} FOR UPDATE
              `;

              // Re-fetch user wallet with lock to get latest balance
              const lockedUserWallet = await tx.wallet.findUnique({
                where: { id: payoutTransaction.wallet.id },
                select: { id: true, availableBalance: true, ledgerBalance: true },
              });

              if (lockedUserWallet) {
                // Update balance to match provider (provider has already transferred the money)
                const newAvailableBalance = normalizeToKobo(lockedUserWallet.availableBalance.plus(grossAmount));
                const newLedgerBalance = normalizeToKobo(lockedUserWallet.ledgerBalance.plus(grossAmount));

                await tx.wallet.update({
                  where: { id: payoutTransaction.wallet.id },
                  data: {
                    availableBalance: newAvailableBalance,
                    ledgerBalance: newLedgerBalance,
                  },
                });

                // Create refund transaction record for audit trail
                await tx.transaction.create({
                  data: {
                    walletId: payoutTransaction.wallet.id,
                    type: TransactionType.PAYOUT,
                    direction: TransactionDirection.CREDIT, // Credit because it's a refund
                    status: TransactionStatus.SUCCESS,
                    amount: grossAmount,
                    currencyId: userWallet.currencyId || "fd5e474d-bb42-4db1-ab74-e8d2a01047e9",
                    reference: refundReference,
                    externalReference: data.paymentReference,
                    narration: `Payout refund: ${data.deliveryStatusMessage || 'Payout failed'}`,
                    metadata: {
                      originalPayoutTransactionId: payoutTransaction.id,
                      originalTransactionId: payoutTransaction.transactionId,
                      refundReason: data.status,
                      deliveryStatusMessage: data.deliveryStatusMessage,
                      deliveryStatusCode: data.deliveryStatusCode,
                      refundProviderResponse: refundResponse.data,
                    },
                  },
                });

                this.logger.log(
                  `Payout failed: Refunded ${grossAmount.toString()} from organization wallet to user wallet ${payoutTransaction.wallet.id} via provider. ` +
                  `Refund Reference: ${refundReference}, Original Payment Reference: ${data.paymentReference}`
                );
              }
            } catch (error) {
              // If refund transfer fails, log error and re-throw to ensure webhook processing fails and can be retried
              this.logger.error(
                `CRITICAL: Failed to refund payout via provider. ` +
                `Organization wallet has ${grossAmount.toString()} that needs to be manually refunded to user wallet ${payoutTransaction.wallet.id}. ` +
                `Payment Reference: ${data.paymentReference}. Error: ${error.message}`
              );
              // Re-throw to ensure webhook processing fails and can be retried
              throw error;
            }
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

    // Recalculate risk score after payout webhook (outside transaction to avoid blocking)
    this.walletRiskService.updateWalletRiskScore(walletId).catch((error) => {
      this.logger.error(`Failed to update risk score after payout webhook: ${error.message}`);
    });

    // Send email notification for withdrawal status (outside transaction to avoid blocking)
    if (result.status === 'success') {
      // Fetch payout transaction with user info for email
      const payoutWithUser = await this.databaseService.payoutTransaction.findUnique({
        where: { providerTransactionRef: data.paymentReference },
        include: {
          wallet: {
            include: {
              customer: {
                include: {
                  user: true,
                },
              },
            },
          },
          bankAccount: true,
        },
      });

      if (payoutWithUser?.wallet?.customer?.user?.email) {
        const amountFormatted = payoutWithUser.amount.toFixed(2);
        const accountNumber = payoutWithUser.bankAccount?.accountNumber || 'N/A';
        const status = data.status;
        const message = data.deliveryStatusMessage || undefined;
        const firstName = payoutWithUser.wallet.customer.user.firstName || payoutWithUser.wallet.customer.firstName || undefined;
        const requestDate = payoutWithUser.createdAt;

        this.emailService.sendWithdrawalStatusAlert(
          payoutWithUser.wallet.customer.user.email,
          amountFormatted,
          status,
          accountNumber,
          data.paymentReference,
          message,
          firstName,
          undefined, // bankName - can be looked up from bankCode if needed
          requestDate,
        ).catch((error) => {
          this.logger.error(`Failed to send withdrawal status email: ${error.message}`);
        });
      }
    }

    return result;
  }
}

