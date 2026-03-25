import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { DatabaseService } from '../database/database.service.js';
import { TransactionCallbackDto } from './dto/transaction-callback.dto.js';
import { TransactionDirection, TransactionStatus, TransactionType } from '../../generated/prisma/enums.js';
import { Prisma } from '@prisma/client';

@Injectable()
export class ProviderTxnCallbackService {
  private readonly logger = new Logger(ProviderTxnCallbackService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  private computeSecurityInfoHash(securityInfo: string): string {
    // Must match what we store at initiation time (sha256 -> hex).
    return createHash('sha256').update(securityInfo).digest('hex');
  }

  private mapProviderStatusToTransactionStatus(providerStatus: string | undefined): TransactionStatus {
    const normalized = (providerStatus ?? '').toString().trim().toUpperCase();
    if (normalized === 'PENDING') return TransactionStatus.PENDING;
    if (normalized === 'SUCCESSFUL') return TransactionStatus.SUCCESS;
    if (normalized === 'FAILED') return TransactionStatus.FAILED;
    // Unknown provider status -> keep transaction in PENDING to avoid false success.
    return TransactionStatus.PENDING;
  }

  /**
   * Bank calls this to authorize the transaction (client side).
   * We validate `securityInfo` against `Transaction.securityInfoHash`.
   */
  async handleTransactionAuthCallback(raw: any): Promise<{ transactionReference: string; authorized: boolean }> {
    const transactionReference: string = raw?.transactionReference ?? '';
    const securityInfo: unknown = raw?.securityInfo;

    // Basic guard: must exist.
    if (!transactionReference || typeof securityInfo !== 'string') {
      return { transactionReference: transactionReference || '', authorized: false };
    }

    const txn = await this.databaseService.transaction.findUnique({
      where: { reference: transactionReference },
    });

    if (!txn || !txn.securityInfoHash) {
      return { transactionReference, authorized: false };
    }

    const computed = this.computeSecurityInfoHash(securityInfo);
    return { transactionReference, authorized: computed === txn.securityInfoHash };
  }

  /**
   * Bank calls this with transaction status updates.
   * This is idempotent using provider `platformTransactionReference`.
   */
  async handleTransactionCallback(raw: any): Promise<{ received: true }> {
    const data: TransactionCallbackDto['data'] | undefined = raw?.data;
    const transactionReference = data?.transactionReference;
    const platformTransactionReference = data?.platformTransactionReference;
    const providerStatus = data?.status;

    this.logger.debug(
      `Transaction callback received: txRef=${transactionReference}, platformRef=${platformTransactionReference}, status=${providerStatus}`,
    );

    if (!transactionReference || !platformTransactionReference) {
      // If payload is malformed, we don't want to crash the webhook handler.
      return { received: true };
    }

    const mappedStatus = this.mapProviderStatusToTransactionStatus(providerStatus);
    const receivedAt = new Date();
    const creditRef = `CREDIT-${platformTransactionReference}`;

    // Atomic update: lock the debit transaction and involved wallet rows.
    await this.databaseService.$transaction(async (tx: Prisma.TransactionClient) => {
      // Lock transaction row
      const txn = await tx.transaction.findUnique({
        where: { reference: transactionReference },
        include: {
          wallet: true,
        },
      });

      if (!txn) {
        this.logger.warn(
          `Transaction callback: no local transaction found for reference=${transactionReference}.`,
        );
        return;
      }

      await tx.$queryRaw`
        SELECT id FROM "Transaction" WHERE id = ${txn.id} FOR UPDATE
      `;

      // If we've already processed SUCCESS for the same platformRef, skip wallet changes.
      if (
        txn.providerPlatformTransactionReference === platformTransactionReference &&
        txn.status === TransactionStatus.SUCCESS
      ) {
        // Still ensure provider refs are persisted (idempotent).
        await tx.transaction.update({
          where: { id: txn.id },
          data: {
            providerPlatformTransactionReference: platformTransactionReference,
            providerStatus: providerStatus,
            providerCallbackReceivedAt: receivedAt,
            providerTransactionStan: data?.transactionStan ?? null,
            providerOriginalTransactionDate: null, // will set below if parseable
          },
        });

        return;
      }

      // Parse original txn date (provider misspells "original" as "orinalTxnTransactionDate")
      let parsedOriginalTxnDate: Date | null = null;
      if (typeof data?.orinalTxnTransactionDate === 'string') {
        const candidate = new Date(data.orinalTxnTransactionDate);
        parsedOriginalTxnDate = isNaN(candidate.getTime()) ? null : candidate;
      }

      // Update transaction provider fields + mapped status.
      const previousStatus = txn.status;
      await tx.transaction.update({
        where: { id: txn.id },
        data: {
          providerPlatformTransactionReference: platformTransactionReference,
          providerTransactionStan: data?.transactionStan ?? null,
          providerOriginalTransactionDate: parsedOriginalTxnDate,
          providerStatus: providerStatus ?? null,
          providerCallbackReceivedAt: receivedAt,
          status: mappedStatus,
          narration: data?.narration ?? txn.narration,
          metadata: {
            ...(typeof txn.metadata === 'object' && txn.metadata ? (txn.metadata as any) : {}),
            providerCallback: {
              status: providerStatus ?? null,
              transactionStan: data?.transactionStan ?? null,
              platformTransactionReference: platformTransactionReference,
              originalTxnDate: parsedOriginalTxnDate ? parsedOriginalTxnDate.toISOString() : null,
            },
          } as any,
        },
      });

      // Apply wallet balance changes only on first transition to SUCCESS.
      if (mappedStatus === TransactionStatus.SUCCESS && previousStatus !== TransactionStatus.SUCCESS) {
        const amount = txn.amount;

        // Debit source wallet
        const sourceWallet = await tx.wallet.findUnique({ where: { id: txn.walletId } });
        if (!sourceWallet) {
          throw new BadRequestException(`Source wallet not found for transaction=${transactionReference}`);
        }

        await tx.wallet.update({
          where: { id: sourceWallet.id },
          data: {
            availableBalance: sourceWallet.availableBalance.minus(amount),
            ledgerBalance: sourceWallet.ledgerBalance.minus(amount),
          },
        });

        // Credit destination wallet if internal
        if (txn.destinationAccountNumber) {
          const destinationWallet = await tx.wallet.findFirst({
            where: { virtualAccountNumber: txn.destinationAccountNumber },
          });

          if (destinationWallet) {
            await tx.wallet.update({
              where: { id: destinationWallet.id },
              data: {
                availableBalance: destinationWallet.availableBalance.plus(amount),
                ledgerBalance: destinationWallet.ledgerBalance.plus(amount),
              },
            });

            // Idempotently create credit transaction
            const creditTxn = await tx.transaction.findUnique({
              where: { reference: creditRef },
            });

            if (!creditTxn) {
              await tx.transaction.create({
                data: {
                  walletId: destinationWallet.id,
                  type: TransactionType.INFLOW,
                  direction: TransactionDirection.CREDIT,
                  status: TransactionStatus.SUCCESS,
                  amount,
                  currencyId: txn.currencyId,
                  reference: creditRef,
                  externalReference: platformTransactionReference,
                  narration: data?.narration ?? txn.narration,
                  groupReference: txn.groupReference ?? `TRANSFER-${platformTransactionReference}`,
                  metadata: {
                    providerCallback: {
                      platformTransactionReference,
                      transactionStan: data?.transactionStan ?? null,
                    },
                  },
                },
              });
            }
          }
        }
      }
    });

    return { received: true };
  }

  /**
   * Near real-time notification for debit/credit statuses on custom wallets.
   * For now we persist nothing; persistence will be implemented in the next step.
   */
  async handleTransactionNotification(raw: any): Promise<{ received: true }> {
    this.logger.debug(`Transaction notification received for account=${raw?.accountNumber}`);

    const accountNumber: string | undefined = raw?.accountNumber?.toString();
    const transactionType: string | undefined = raw?.transactionType?.toString();

    // Resolve wallet if possible (to link the event for later troubleshooting/auditing).
    const wallet = accountNumber
      ? await this.databaseService.wallet.findFirst({
          where: { virtualAccountNumber: accountNumber },
        })
      : null;

    // Persist as a provider webhook event (no ledger updates here).
    await this.databaseService.providerWebhookEvent.create({
      data: {
        event: 'transaction-notification',
        paymentReference: accountNumber
          ? `notif-${accountNumber}-${raw?.transactionDate ?? ''}`
          : undefined,
        payload: {
          ...raw,
          walletId: wallet?.id ?? null,
          virtualAccountNumber: accountNumber ?? null,
          transactionType: transactionType ?? null,
        },
        processingStatus: 'PROCESSED',
      },
    });

    return { received: true };
  }
}

