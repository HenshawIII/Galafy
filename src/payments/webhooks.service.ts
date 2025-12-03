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
import { randomUUID } from 'crypto';
import { config } from 'dotenv';
config();

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);
  private readonly apiKey: string;

  constructor(private readonly databaseService: DatabaseService) {
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
   */
  async handleInflowWebhook(webhookDto: InflowWebhookDto) {
    const { data } = webhookDto;

    // Find wallet by account number
    const wallet = await this.databaseService.wallet.findFirst({
      where: { virtualAccountNumber: data.accountNumber },
      include: { customer: true },
    });

    if (!wallet) {
      this.logger.warn(`Wallet not found for account number: ${data.accountNumber}`);
      throw new NotFoundException(`Wallet not found for account number: ${data.accountNumber}`);
    }

    // Generate internal reference
    const internalReference = `INFLOW-${randomUUID()}`;

    // Create Transaction record
    const transaction = await this.databaseService.transaction.create({
      data: {
        walletId: wallet.id,
        type: TransactionType.INFLOW,
        direction: TransactionDirection.CREDIT,
        status: TransactionStatus.SUCCESS,
        amount: data.amount,
        currencyId: wallet.currencyId,
        reference: internalReference,
        externalReference: data.reference, // Provider reference
        narration: data.description || 'Inflow payment',
        metadata: {
          senderName: data.senderName,
          senderBank: data.senderBank,
          fee: data.fee,
        },
      },
    });

    // Create FundingTransaction record
    const fundingTransaction = await this.databaseService.fundingTransaction.create({
      data: {
        walletId: wallet.id,
        amount: data.amount,
        fee: data.fee,
        channel: FundingChannel.BANK_TRANSFER,
        status: FundingStatus.SUCCESS,
        transactionId: transaction.id,
        providerReference: data.reference,
        providerPayload: webhookDto as any,
      },
    });

    // Update wallet balance
    const newAvailableBalance = Number(wallet.availableBalance) + data.amount;
    const newLedgerBalance = Number(wallet.ledgerBalance) + data.amount;

    await this.databaseService.wallet.update({
      where: { id: wallet.id },
      data: {
        availableBalance: new Decimal(newAvailableBalance),
        ledgerBalance: new Decimal(newLedgerBalance),
      },
    });

    // Store webhook event
    await this.databaseService.providerWebhookEvent.create({
      data: {
        event: 'nip',
        paymentReference: data.reference,
        payload: webhookDto as any,
        processingStatus: 'PROCESSED',
      },
    });

    this.logger.log(`INFLOW webhook processed: ${data.reference} - ${data.amount} to wallet ${wallet.id}`);

    return {
      status: 'success',
      message: 'Webhook processed successfully',
      transactionId: transaction.id,
      fundingTransactionId: fundingTransaction.id,
    };
  }

  /**
   * Handle PAYOUT webhook (payout status update)
   */
  async handlePayoutWebhook(webhookDto: PayoutWebhookDto) {
    const { data } = webhookDto;

    // Find payout transaction by provider reference
    const payoutTransaction = await this.databaseService.payoutTransaction.findUnique({
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

    // Update payout transaction
    await this.databaseService.payoutTransaction.update({
      where: { id: payoutTransaction.id },
      data: {
        status: payoutStatus,
        providerPayload: webhookDto as any,
      },
    });

    // Update main transaction
    await this.databaseService.transaction.update({
      where: { id: payoutTransaction.transactionId },
      data: {
        status: transactionStatus,
        metadata: {
          deliveryStatusMessage: data.deliveryStatusMessage,
          deliveryStatusCode: data.deliveryStatusCode,
          dateOfTransaction: data.dateOfTransaction,
        },
      },
    });

    // If failed, reverse the wallet balance (refund)
    if (payoutStatus === PayoutStatus.FAILED || payoutStatus === PayoutStatus.REJECTED) {
      const wallet = payoutTransaction.wallet;
      const newAvailableBalance = Number(wallet.availableBalance) + Number(payoutTransaction.amount);
      const newLedgerBalance = Number(wallet.ledgerBalance) + Number(payoutTransaction.amount);

      await this.databaseService.wallet.update({
        where: { id: wallet.id },
        data: {
          availableBalance: new Decimal(newAvailableBalance),
          ledgerBalance: new Decimal(newLedgerBalance),
        },
      });
    }

    // Store webhook event
    await this.databaseService.providerWebhookEvent.create({
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
  }
}

