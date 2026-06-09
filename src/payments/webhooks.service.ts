import { Injectable, BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { DatabaseService } from '../database/database.service.js';
import { InflowWebhookDto, PayoutWebhookDto } from './dto/webhook.dto.js';
import {
  TransactionType,
  TransactionDirection,
  TransactionStatus,
  PayoutStatus,
} from '../../generated/prisma/enums.js';
import { Decimal } from '@prisma/client/runtime/library';
import { Prisma } from '@prisma/client';
import { config } from 'dotenv';
import { normalizeToKobo } from '../common/utils/money.util.js';
import { OrganizationWalletService } from '../common/services/organization-wallet.service.js';
import { WalletRiskService } from '../common/services/wallet-risk.service.js';
import { EmailService } from '../users/email.service.js';
import { ProviderService } from '../provider/provider.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '../config/config.service.js';
import { InflowCreditService } from '../common/inflow-credit/inflow-credit.service.js';
import { buildStableProviderRef } from '../common/utils/provider-transaction-reference.util.js';
import {
  buildWithdrawalPushNotification,
  resolveWithdrawalDisplayAmount,
} from '../common/utils/withdrawal-notification.util.js';
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
    private readonly inflowCreditService: InflowCreditService,
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

    const grossAmount = normalizeToKobo(data.amount);
    const providerFee = normalizeToKobo(data.fee || 0);

    const result = await this.inflowCreditService.processBankInflow({
      accountNumber: data.accountNumber,
      grossAmount,
      providerFee,
      providerReference: data.reference,
      narration: data.description || 'Inflow payment',
      senderName: data.senderName,
      senderBank: data.senderBank,
      providerPayload: webhookDto,
      webhookEvent: { event: 'nip', paymentReference: data.reference },
    });

    const walletId = result.walletId;
    if (!walletId) {
      return result;
    }

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

        this.emailService
          .sendWalletFundingAlert(
            walletWithUser.customer.user.email,
            amountFormatted,
            walletWithUser.virtualAccountNumber,
            data.reference,
            firstName,
            paymentMethod,
            fundingDate,
          )
          .catch((error) => {
            this.logger.error(`Failed to send wallet funding email: ${error.message}`);
          });

        // Send push notification for inflow received
        const walletOwnerUserId = walletWithUser.customer.userId;
        if (walletOwnerUserId) {
          try {
            await this.notificationsService.sendNotificationIfEnabled(walletOwnerUserId, {
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
            });
          } catch (notificationError: any) {
            // Log error but don't fail the webhook - notification is optional
            this.logger.warn(`Failed to send inflow push notification: ${notificationError.message}`);
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

    const refundHolder: {
      v: {
        refundRef: string;
        grossAmount: Decimal;
        userVirtual: string;
        userBankCode: string;
        userBankName: string;
        orgSourceVirtual: string;
        narration: string;
      } | null;
    } = { v: null };

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

        // If failed, return funds via provider org wallet → user VA (DB balances update on SUCCESS callback only).
        if (payoutStatus === PayoutStatus.FAILED || payoutStatus === PayoutStatus.REJECTED) {
          const existingLegacyRefund = await tx.transaction.findFirst({
            where: {
              walletId: payoutTransaction.wallet.id,
              externalReference: data.paymentReference,
              type: TransactionType.PAYOUT,
              direction: TransactionDirection.CREDIT,
              narration: { contains: 'Payout refund' },
            },
          });

          const refundRef = buildStableProviderRef('REFUND', data.paymentReference);
          const existingProviderRefund = await tx.transaction.findUnique({
            where: { reference: refundRef },
          });

          if (existingLegacyRefund || existingProviderRefund) {
            this.logger.log(
              `Refund already recorded for payout ${data.paymentReference}. Skipping new provider refund initiation.`,
            );
          } else {
            const orgWallet = await this.organizationWalletService.getAdminWalletRecord();
            if (!orgWallet?.virtualAccountNumber) {
              throw new BadRequestException(
                'Organization wallet or virtual account missing; cannot initiate provider refund.',
              );
            }

            const userWallet = await tx.wallet.findUnique({
              where: { id: payoutTransaction.wallet.id },
              select: {
                id: true,
                currencyId: true,
                virtualAccountNumber: true,
                virtualBankCode: true,
                virtualBankName: true,
              },
            });

            if (!userWallet?.virtualAccountNumber || !userWallet.virtualBankCode) {
              throw new BadRequestException(
                'User wallet is missing virtual account or bank code; cannot refund via provider.',
              );
            }

            await tx.transaction.create({
              data: {
                walletId: orgWallet.id,
                type: TransactionType.REFUND,
                direction: TransactionDirection.DEBIT,
                status: TransactionStatus.PENDING,
                amount: grossAmount,
                currencyId: orgWallet.currencyId,
                reference: refundRef,
                externalReference: data.paymentReference,
                destinationAccountNumber: userWallet.virtualAccountNumber,
                destinationAccountName:
                  `${payoutTransaction.wallet.customer?.firstName ?? ''} ${payoutTransaction.wallet.customer?.lastName ?? ''}`.trim() ||
                  'Customer',
                narration: `Payout refund to user VA (${data.paymentReference})`,
                groupReference: `REFUND-GRP-${data.paymentReference}`,
                metadata: {
                  payoutRefundCredit: true,
                  originalPayoutTransactionId: payoutTransaction.id,
                  originalUserWalletId: userWallet.id,
                  refundReason: data.status,
                  deliveryStatusMessage: data.deliveryStatusMessage,
                  deliveryStatusCode: data.deliveryStatusCode,
                },
              },
            });

            refundHolder.v = {
              refundRef,
              grossAmount,
              userVirtual: userWallet.virtualAccountNumber,
              userBankCode: userWallet.virtualBankCode,
              userBankName: userWallet.virtualBankName?.trim() || 'Wallet',
              orgSourceVirtual: orgWallet.virtualAccountNumber,
              narration: `Payout refund ${data.paymentReference}`,
            };

            this.logger.log(
              `Payout failed: initiated provider refund org→user. RefundRef=${refundRef}, PaymentRef=${data.paymentReference}, Amount=${grossAmount.toString()}`,
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

    const refundJob = refundHolder.v;
    if (refundJob) {
      const adminOrgSecurity = process.env.ADMIN_DEBIT_WALLET_SECURITY_INFO?.trim();
      if (!adminOrgSecurity) {
        this.logger.error(
          'ADMIN_DEBIT_WALLET_SECURITY_INFO is not set; cannot call provider for payout refund. Marking refund transaction FAILED.',
        );
        await this.databaseService.transaction
          .update({
            where: { reference: refundJob.refundRef },
            data: {
              status: TransactionStatus.FAILED,
              providerStatus: 'CONFIG_ERROR',
              providerCallbackReceivedAt: new Date(),
            },
          })
          .catch((e) => this.logger.error(`Failed to mark refund txn failed: ${e.message}`));
      } else {
        try {
          await this.providerService.processClientTransfer({
            securityInfo: adminOrgSecurity,
            amount: refundJob.grossAmount.toNumber(),
            destinationBankCode: refundJob.userBankCode,
            destinationBankName: refundJob.userBankName,
            destinationAccountNumber: refundJob.userVirtual,
            destinationAccountName: 'Customer',
            sourceAccountNumber: refundJob.orgSourceVirtual,
            narration: refundJob.narration,
            transactionReference: refundJob.refundRef,
            useCustomNarration: true,
          });
        } catch (err: any) {
          this.logger.error(`Provider payout refund failed: ${err?.message ?? err}`);
          await this.databaseService.transaction
            .update({
              where: { reference: refundJob.refundRef },
              data: {
                status: TransactionStatus.FAILED,
                providerStatus: 'FAILED',
                providerCallbackReceivedAt: new Date(),
              },
            })
            .catch((e) => this.logger.error(`Failed to mark refund txn failed: ${e.message}`));
        }
      }
    }

    // Recalculate risk score after payout webhook (outside transaction to avoid blocking)
    this.walletRiskService.updateWalletRiskScore(walletId).catch((error) => {
      this.logger.error(`Failed to update risk score after payout webhook: ${error.message}`);
    });

    // Send email notification for withdrawal status (outside transaction to avoid blocking)
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
        transaction: {
          select: {
            amount: true,
            metadata: true,
          },
        },
      },
    });

    if (payoutWithUser?.wallet?.customer?.user) {
      const amountFormatted = resolveWithdrawalDisplayAmount(
        payoutWithUser.transaction?.amount ?? payoutWithUser.amount,
        payoutWithUser.transaction?.metadata,
      );
      const accountNumber = payoutWithUser.bankAccount?.accountNumber || 'N/A';
      const status = data.status;
      const message = data.deliveryStatusMessage || undefined;
      const firstName =
        payoutWithUser.wallet.customer.user.firstName || payoutWithUser.wallet.customer.firstName || undefined;
      const requestDate = payoutWithUser.createdAt;
      const userId = payoutWithUser.wallet.customer.userId;
      const pushKind =
        status.toLowerCase() === 'success' ||
        status.toLowerCase() === 'approved' ||
        status.toLowerCase() === 'completed'
          ? ('WITHDRAWAL_SUCCESS' as const)
          : status.toLowerCase() === 'failed' || status.toLowerCase() === 'rejected'
            ? ('WITHDRAWAL_FAILED' as const)
            : null;

      if (payoutWithUser.wallet.customer.user.email) {
        this.emailService
          .sendWithdrawalStatusAlert(
            payoutWithUser.wallet.customer.user.email,
            amountFormatted,
            status,
            accountNumber,
            data.paymentReference,
            message,
            firstName,
            undefined,
            requestDate,
          )
          .catch((error) => {
            this.logger.error(`Failed to send withdrawal status email: ${error.message}`);
          });
      }

      if (userId && pushKind) {
        try {
          const payload = buildWithdrawalPushNotification({
            kind: pushKind,
            amountFormatted,
            transactionReference: data.paymentReference,
            destinationAccountNumber: accountNumber,
          });
          await this.notificationsService.sendNotificationIfEnabled(userId, payload);
        } catch (error: unknown) {
          const errMessage = error instanceof Error ? error.message : String(error);
          this.logger.warn(`Failed to send withdrawal webhook push: ${errMessage}`);
        }
      }
    }

    return result;
  }
}
