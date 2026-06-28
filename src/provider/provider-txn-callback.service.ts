import { BadRequestException, forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { buildStableProviderRef } from '../common/utils/provider-transaction-reference.util.js';
import { buildTransactionNotificationProviderReference } from '../common/utils/provider-transaction-notification-reference.util.js';
import { classifyTransactionNotification } from './provider-notification-classifier.util.js';
import { ProviderNotificationLedgerService } from '../common/provider-notification/provider-notification-ledger.service.js';
import {
  extractTransactionCallbackFields,
  extractTransactionNotificationFields,
  mapProviderStatusToTransactionStatus,
  normalizeTransactionNotificationPayload,
  sanitizeProviderCallbackForLog,
} from './provider-callback-payload.util.js';
import { DatabaseService } from '../database/database.service.js';
import { TransactionCallbackDto } from './dto/transaction-callback.dto.js';
import {
  TransactionDirection,
  TransactionStatus,
  TransactionType,
  SprayStatus,
} from '../../generated/prisma/enums.js';
import { Prisma } from '@prisma/client';
import { InflowCreditService } from '../common/inflow-credit/inflow-credit.service.js';
import { WalletRiskService } from '../common/services/wallet-risk.service.js';
import { normalizeToKobo } from '../common/utils/money.util.js';
import { resolvePayoutSourceWalletDebitAmount, parsePayoutTransactionReferenceFromNotification } from '../common/utils/payout-notification.util.js';
import { SprayTransferLookupService } from '../common/provider-notification/spray-transfer-lookup.service.js';
import {
  buildWithdrawalPushNotification,
  resolveWithdrawalDisplayAmount,
} from '../common/utils/withdrawal-notification.util.js';
import { EmailService } from '../users/email.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { isHostReceiverRole } from '../common/utils/event-role.util.js';
import { EventSprayLiveBroadcastService } from '../live/event-spray-live-broadcast.service.js';

@Injectable()
export class ProviderTxnCallbackService {
  private readonly logger = new Logger(ProviderTxnCallbackService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly inflowCreditService: InflowCreditService,
    private readonly walletRiskService: WalletRiskService,
    private readonly emailService: EmailService,
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService,
    private readonly notificationLedger: ProviderNotificationLedgerService,
    private readonly sprayTransferLookup: SprayTransferLookupService,
    private readonly eventSprayLiveBroadcast: EventSprayLiveBroadcastService,
  ) {}

  private mask(value: unknown, visibleTail = 4): string {
    const str = typeof value === 'string' ? value.trim() : value != null ? String(value).trim() : '';
    if (!str) return 'n/a';
    if (str.length <= visibleTail) return '*'.repeat(str.length);
    return `${'*'.repeat(str.length - visibleTail)}${str.slice(-visibleTail)}`;
  }

  private computeSecurityInfoHash(securityInfo: string): string {
    return createHash('sha256').update(securityInfo).digest('hex');
  }

  async handleTransactionAuthCallback(raw: any): Promise<{ transactionReference: string; authorized: boolean }> {
    const transactionReference: string = raw?.transactionReference ?? '';
    const securityInfo: unknown = raw?.securityInfo;
    this.logger.log(`Transaction auth callback received: txRef=${this.mask(transactionReference)}`);

    if (!transactionReference || typeof securityInfo !== 'string') {
      this.logger.warn(
        `Transaction auth callback rejected: invalid payload txRef=${this.mask(transactionReference)} hasSecurityInfo=${typeof securityInfo === 'string'}`,
      );
      return { transactionReference: transactionReference || '', authorized: false };
    }

    const txn = await this.databaseService.transaction.findUnique({
      where: { reference: transactionReference },
    });

    if (!txn || !txn.securityInfoHash) {
      this.logger.warn(`Transaction auth callback rejected: local transaction/hash missing txRef=${this.mask(transactionReference)}`);
      return { transactionReference, authorized: false };
    }

    const computed = this.computeSecurityInfoHash(securityInfo);
    if (computed !== txn.securityInfoHash) {
      this.logger.warn(`Transaction auth callback rejected: security mismatch txRef=${this.mask(transactionReference)}`);
      return { transactionReference, authorized: false };
    }
    // Idempotent: partner may retry auth with the same mandate; deny if debit already failed.
    if (txn.status === TransactionStatus.FAILED || txn.status === TransactionStatus.REVERSED) {
      this.logger.warn(
        `Transaction auth callback rejected: txn already terminal txRef=${this.mask(transactionReference)} status=${txn.status}`,
      );
      return { transactionReference, authorized: false };
    }
    this.logger.log(`Transaction auth callback authorized: txRef=${this.mask(transactionReference)} status=${txn.status}`);
    return { transactionReference, authorized: true };
  }

  async handleTransactionCallback(raw: any): Promise<{ received: true }> {
    const extracted = extractTransactionCallbackFields(raw);
    const transactionReference = extracted.transactionReference;
    const platformTransactionReference = extracted.platformTransactionReference;
    const providerStatus = extracted.status;

    this.logger.log(
      `Transaction callback received: txRef=${this.mask(transactionReference)}, platformRef=${this.mask(platformTransactionReference)}, providerStatus=${providerStatus ?? 'n/a'}, dataSource=${extracted.dataSource}`,
    );

    if (!transactionReference || !platformTransactionReference) {
      this.logger.warn(
        `Transaction callback ignored: missing references txRef=${this.mask(transactionReference)} platformRef=${this.mask(platformTransactionReference)} dataSource=${extracted.dataSource}. Full sanitized payload: ${sanitizeProviderCallbackForLog(raw)}`,
      );
      return { received: true };
    }

    const data = {
      status: providerStatus ?? 'PENDING',
      message: extracted.message,
      narration: extracted.narration,
      transactionReference,
      platformTransactionReference,
      transactionStan: extracted.transactionStan,
      orinalTxnTransactionDate: extracted.orinalTxnTransactionDate,
    } satisfies TransactionCallbackDto['data'];

    const mappedStatus = mapProviderStatusToTransactionStatus(providerStatus);
    this.logger.log(
      `Transaction callback normalized: txRef=${this.mask(transactionReference)} platformRef=${this.mask(platformTransactionReference)} mappedStatus=${mappedStatus}`,
    );
    const receivedAt = new Date();
    const creditRef = `CREDIT-${platformTransactionReference}`;

    const notifyHolder: {
      v: {
        userId: string;
        email: string | null;
        amountFormatted: string;
        transactionReference: string;
        destinationAccountNumber: string | null;
        firstName?: string;
        kind: 'WITHDRAWAL_SUCCESS' | 'WITHDRAWAL_FAILED';
      } | null;
    } = { v: null };

    const confirmedEventSprayHolder: {
      v: { eventId: string; sprayId: string } | null;
    } = { v: null };

    await this.databaseService.$transaction(async (tx: Prisma.TransactionClient) => {
      const txn = await tx.transaction.findUnique({
        where: { reference: transactionReference },
        include: {
          wallet: true,
        },
      });

      if (!txn) {
        this.logger.warn(
          `Transaction callback: no local transaction found for txRef=${this.mask(transactionReference)}.`,
        );
        return;
      }

      await tx.$queryRaw`
        SELECT id FROM "Transaction" WHERE id = ${txn.id} FOR UPDATE
      `;

      if (
        txn.providerPlatformTransactionReference === platformTransactionReference &&
        txn.status === TransactionStatus.SUCCESS
      ) {
        this.logger.log(
          `Transaction callback duplicate success ack: txRef=${this.mask(transactionReference)} platformRef=${this.mask(platformTransactionReference)}`,
        );
        await tx.transaction.update({
          where: { id: txn.id },
          data: {
            providerPlatformTransactionReference: platformTransactionReference,
            providerStatus: providerStatus,
            providerCallbackReceivedAt: receivedAt,
            providerTransactionStan: data?.transactionStan ?? null,
            providerOriginalTransactionDate: null,
          },
        });

        return;
      }

      let parsedOriginalTxnDate: Date | null = null;
      if (typeof data?.orinalTxnTransactionDate === 'string') {
        const candidate = new Date(data.orinalTxnTransactionDate);
        parsedOriginalTxnDate = isNaN(candidate.getTime()) ? null : candidate;
      }

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
      this.logger.log(
        `Transaction callback status updated: txRef=${this.mask(transactionReference)} previousStatus=${previousStatus} currentStatus=${mappedStatus}`,
      );

      if (mappedStatus === TransactionStatus.FAILED && previousStatus !== TransactionStatus.FAILED) {
        this.logger.warn(
          `Transaction callback failure branch: txRef=${this.mask(transactionReference)} platformRef=${this.mask(platformTransactionReference)}`,
        );
        const sprayRow = await tx.spray.findFirst({ where: { transactionId: txn.id } });
        if (sprayRow?.status === SprayStatus.PENDING_PROVIDER) {
          const prev =
            typeof sprayRow.metadata === 'object' && sprayRow.metadata !== null
              ? (sprayRow.metadata as Record<string, unknown>)
              : {};
          await tx.spray.update({
            where: { id: sprayRow.id },
            data: {
              status: SprayStatus.FAILED,
              metadata: { ...prev, providerFailed: true } as any,
            },
          });
        }
        const failMeta =
          typeof txn.metadata === 'object' && txn.metadata !== null
            ? (txn.metadata as Record<string, unknown>)
            : null;
        if (failMeta?.inflowAdminFeeSweep === true && typeof failMeta.inflowTransactionId === 'string') {
          const inflowTxn = await tx.transaction.findUnique({ where: { id: failMeta.inflowTransactionId } });
          if (inflowTxn) {
            const im =
              typeof inflowTxn.metadata === 'object' && inflowTxn.metadata !== null
                ? { ...(inflowTxn.metadata as Record<string, unknown>) }
                : {};
            im.feeSweepFailed = true;
            await tx.transaction.update({
              where: { id: inflowTxn.id },
              data: { metadata: im as any },
            });
          }
        }
        if (failMeta?.payoutAdminFeeSweep === true) {
          const payoutNetTxId =
            typeof failMeta.payoutNetTransactionId === 'string' ? failMeta.payoutNetTransactionId : null;
          if (payoutNetTxId) {
            const payoutTxn = await tx.transaction.findUnique({
              where: { id: payoutNetTxId },
              select: { id: true, status: true, metadata: true },
            });
            if (payoutTxn?.status === TransactionStatus.SUCCESS) {
              const feeAmount = txn.amount;
              const sourceWallet = await tx.wallet.findUnique({
                where: { id: txn.walletId },
                select: { id: true, availableBalance: true, ledgerBalance: true },
              });
              if (sourceWallet) {
                await tx.wallet.update({
                  where: { id: sourceWallet.id },
                  data: {
                    availableBalance: sourceWallet.availableBalance.plus(feeAmount),
                    ledgerBalance: sourceWallet.ledgerBalance.plus(feeAmount),
                  },
                });
              }
              const payoutMeta =
                typeof payoutTxn.metadata === 'object' && payoutTxn.metadata !== null
                  ? { ...(payoutTxn.metadata as Record<string, unknown>) }
                  : {};
              payoutMeta.feeSweepFailed = true;
              await tx.transaction.update({
                where: { id: payoutTxn.id },
                data: { metadata: payoutMeta as any },
              });
            }
          }
          if (typeof failMeta.adminFeeId === 'string') {
            await tx.adminFee.update({
              where: { id: failMeta.adminFeeId },
              data: { status: 'REVERSED' },
            });
          }
        }

        const suppressDebitFailNotify =
          failMeta?.payoutAdminFeeSweep === true || failMeta?.inflowAdminFeeSweep === true;
        if (!suppressDebitFailNotify) {
          const payerWallet = await tx.wallet.findUnique({
            where: { id: txn.walletId },
            include: {
              customer: {
                include: {
                  user: true,
                },
              },
            },
          });
          if (payerWallet?.customer?.userId) {
            notifyHolder.v = {
              userId: payerWallet.customer.userId,
              email: payerWallet.customer.user?.email ?? null,
              amountFormatted: resolveWithdrawalDisplayAmount(txn.amount, txn.metadata),
              transactionReference,
              destinationAccountNumber: txn.destinationAccountNumber,
              firstName: payerWallet.customer.user?.firstName ?? payerWallet.customer.firstName ?? undefined,
              kind: 'WITHDRAWAL_FAILED',
            };
          }
        }
      }

      if (mappedStatus === TransactionStatus.SUCCESS && previousStatus !== TransactionStatus.SUCCESS) {
        const amount = txn.amount;
        const sourceWalletDebitAmount = resolvePayoutSourceWalletDebitAmount(txn);
        this.logger.log(
          `Transaction callback success branch: debit settlement started txRef=${this.mask(transactionReference)} recordAmount=${amount.toString()} walletDebit=${sourceWalletDebitAmount.toString()}`,
        );
        const sourceWalletId = txn.walletId;
        const txnDebitMeta =
          typeof txn.metadata === 'object' && txn.metadata !== null
            ? (txn.metadata as Record<string, unknown>)
            : null;

        let destinationWalletId: string | null = null;
        if (txn.destinationAccountNumber) {
          const destRow = await tx.wallet.findFirst({
            where: { virtualAccountNumber: txn.destinationAccountNumber },
            select: { id: true },
          });
          if (destRow) {
            destinationWalletId = destRow.id;
          }
        }

        const walletIdsToLock = [...new Set([sourceWalletId, ...(destinationWalletId ? [destinationWalletId] : [])])].sort(
          (a, b) => a.localeCompare(b),
        );
        for (const wid of walletIdsToLock) {
          await tx.$queryRaw`
            SELECT id FROM "Wallet" WHERE id = ${wid} FOR UPDATE
          `;
        }

        const sourceWallet = await tx.wallet.findUnique({
          where: { id: sourceWalletId },
          select: { id: true, availableBalance: true, ledgerBalance: true },
        });
        if (!sourceWallet) {
          throw new BadRequestException(`Source wallet not found for transaction=${transactionReference}`);
        }

        const skipLedgerDebit =
          txnDebitMeta?.inflowAdminFeeSweep === true || txnDebitMeta?.payoutAdminFeeSweep === true;

        // Inclusive inflow: credit net only. Inclusive payout: debit gross once. Fee sweeps are bank legs only.
        if (!skipLedgerDebit) {
          await tx.wallet.update({
            where: { id: sourceWallet.id },
            data: {
              availableBalance: sourceWallet.availableBalance.minus(sourceWalletDebitAmount),
              ledgerBalance: sourceWallet.ledgerBalance.minus(sourceWalletDebitAmount),
            },
          });
        } else {
          const sweepKind = txnDebitMeta?.payoutAdminFeeSweep === true ? 'payout' : 'inflow';
          this.logger.log(
            `Transaction callback: ${sweepKind} admin fee sweep settled without wallet debit txRef=${this.mask(transactionReference)} amount=${amount.toString()}`,
          );
        }

        if (destinationWalletId) {
          this.logger.log(
            `Transaction callback success branch: destination wallet found txRef=${this.mask(transactionReference)} destinationWallet=${destinationWalletId}`,
          );
          const destinationWallet = await tx.wallet.findUnique({
            where: { id: destinationWalletId },
            select: { id: true, availableBalance: true, ledgerBalance: true },
          });

          if (destinationWallet) {
            await tx.wallet.update({
              where: { id: destinationWallet.id },
              data: {
                availableBalance: destinationWallet.availableBalance.plus(amount),
                ledgerBalance: destinationWallet.ledgerBalance.plus(amount),
              },
            });

            const creditTxn = await tx.transaction.findUnique({
              where: { reference: creditRef },
            });

            const isPayoutRefundCredit = txnDebitMeta?.payoutRefundCredit === true;
            const isSprayCredit =
              txnDebitMeta?.eventSpray === true || txnDebitMeta?.walletToWalletSpray === true;
            const creditType = isPayoutRefundCredit
              ? TransactionType.PAYOUT
              : isSprayCredit
                ? TransactionType.SPRAY
                : TransactionType.INFLOW;

            if (!creditTxn) {
              await tx.transaction.create({
                data: {
                  walletId: destinationWallet.id,
                  type: creditType,
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
                    ...(isPayoutRefundCredit
                      ? {
                          payoutRefundCredit: true,
                          originalPayoutPaymentRef: txn.externalReference ?? null,
                        }
                      : {}),
                    ...(isSprayCredit
                      ? {
                          sprayCredit: true,
                          linkedSprayDebitRef: transactionReference,
                        }
                      : {}),
                  },
                },
              });
              this.logger.log(
                `Transaction callback success branch: mirror credit created creditRef=${this.mask(creditRef)} sourceTxRef=${this.mask(transactionReference)}`,
              );
            }

            if (txnDebitMeta?.eventSpray === true && txnDebitMeta?.sprayCompletion) {
              const sc = txnDebitMeta.sprayCompletion as Record<string, unknown>;
              const existingEventSpray = await tx.spray.findFirst({ where: { transactionId: txn.id } });
              if (!existingEventSpray) {
                const eventIdStr = typeof sc.eventId === 'string' ? sc.eventId : null;
                const receiverWid = typeof sc.receiverWalletId === 'string' ? sc.receiverWalletId : null;
                if (eventIdStr && receiverWid) {
                  await tx.spray.create({
                    data: {
                      eventId: eventIdStr,
                      sprayerWalletId: txn.walletId,
                      receiverWalletId: receiverWid,
                      transactionId: txn.id,
                      transactionGroupReference: txn.groupReference,
                      totalAmount: amount,
                      note: typeof sc.note === 'string' ? sc.note : null,
                      metadata: { providerConfirmed: true },
                    },
                  });
                }
              } else if (existingEventSpray.status === SprayStatus.PENDING_PROVIDER) {
                const prev =
                  typeof existingEventSpray.metadata === 'object' && existingEventSpray.metadata !== null
                    ? (existingEventSpray.metadata as Record<string, unknown>)
                    : {};
                await tx.spray.update({
                  where: { id: existingEventSpray.id },
                  data: {
                    status: SprayStatus.CONFIRMED,
                    metadata: { ...prev, providerConfirmed: true } as any,
                  },
                });
                const eventIdStr = typeof sc.eventId === 'string' ? sc.eventId : existingEventSpray.eventId;
                if (eventIdStr) {
                  confirmedEventSprayHolder.v = { eventId: eventIdStr, sprayId: existingEventSpray.id };
                }
              }
            } else if (txnDebitMeta?.walletToWalletSpray === true) {
              const existingSpray = await tx.spray.findFirst({ where: { transactionId: txn.id } });
              if (!existingSpray) {
                await tx.spray.create({
                  data: {
                    eventId: null,
                    sprayerWalletId: txn.walletId,
                    receiverWalletId: destinationWallet.id,
                    transactionId: txn.id,
                    transactionGroupReference: txn.groupReference,
                    totalAmount: amount,
                    note: txn.narration,
                    metadata: { providerWalletToWallet: true },
                  },
                });
              } else if (existingSpray.status === SprayStatus.PENDING_PROVIDER) {
                const prev =
                  typeof existingSpray.metadata === 'object' && existingSpray.metadata !== null
                    ? (existingSpray.metadata as Record<string, unknown>)
                    : {};
                await tx.spray.update({
                  where: { id: existingSpray.id },
                  data: {
                    status: SprayStatus.CONFIRMED,
                    metadata: { ...prev, providerConfirmed: true } as any,
                  },
                });
              }
            }

            if (txnDebitMeta?.eventSpray === true && txnDebitMeta?.sprayCompletion) {
              const sc = txnDebitMeta.sprayCompletion as Record<string, unknown>;
              const receiverUserId = typeof sc.receiverUserId === 'string' ? sc.receiverUserId : null;
              const sprayerUserId = typeof sc.sprayerUserId === 'string' ? sc.sprayerUserId : null;
              const receiverRole = sc.receiverRole as string | undefined;
              const eventTitle = typeof sc.eventTitle === 'string' ? sc.eventTitle : 'Event';
              if (receiverUserId && isHostReceiverRole(receiverRole) && sprayerUserId) {
                this.databaseService.user
                  .findUnique({
                    where: { id: sprayerUserId },
                    select: { username: true, profilePicture: true },
                  })
                  .then((sprayerUser) => {
                    const sprayerName = sprayerUser?.username || sprayerUser?.profilePicture || 'Someone';
                    return this.notificationsService.sendNotificationIfEnabled(receiverUserId, {
                      notification: {
                        title: 'You were sprayed!',
                        body: `${sprayerName} sprayed you ${amount.toString()}`,
                      },
                      data: {
                        type: 'SPRAY_RECEIVED',
                        eventId: typeof sc.eventId === 'string' ? sc.eventId : '',
                        eventTitle,
                        amount: amount.toString(),
                        sprayerId: sprayerUserId,
                        sprayerName,
                      },
                    });
                  })
                  .catch((e) => this.logger.warn(`Spray push notification failed: ${e.message}`));
              }
            }

            this.walletRiskService.updateWalletRiskScore(destinationWallet.id).catch((e) => {
              this.logger.error(`Risk score update (receiver) failed: ${e.message}`);
            });
          }
        } else {
          this.logger.warn(
            `Transaction callback success branch: destination wallet not found txRef=${this.mask(transactionReference)} destinationAccount=${this.mask(txn.destinationAccountNumber)}`,
          );
        }

        if (txnDebitMeta?.inflowAdminFeeSweep === true) {
          const inflowTxId =
            typeof txnDebitMeta.inflowTransactionId === 'string' ? txnDebitMeta.inflowTransactionId : null;
          const adminFeeId = typeof txnDebitMeta.adminFeeId === 'string' ? txnDebitMeta.adminFeeId : null;
          if (inflowTxId) {
            const inflowTxn = await tx.transaction.findUnique({ where: { id: inflowTxId } });
            if (inflowTxn) {
              const im =
                typeof inflowTxn.metadata === 'object' && inflowTxn.metadata !== null
                  ? { ...(inflowTxn.metadata as Record<string, unknown>) }
                  : {};
              im.feeSweepPending = false;
              await tx.transaction.update({
                where: { id: inflowTxId },
                data: {
                  status: TransactionStatus.SUCCESS,
                  metadata: im as any,
                },
              });
            }
          }
          if (adminFeeId) {
            await tx.adminFee.update({
              where: { id: adminFeeId },
              data: { status: 'COLLECTED' },
            });
          }
        } else if (txnDebitMeta?.payoutAdminFeeSweep === true) {
          const adminFeeId = typeof txnDebitMeta.adminFeeId === 'string' ? txnDebitMeta.adminFeeId : null;
          if (adminFeeId) {
            await tx.adminFee.update({
              where: { id: adminFeeId },
              data: { status: 'COLLECTED' },
            });
          }
        }

        const payerWallet = await tx.wallet.findUnique({
          where: { id: sourceWalletId },
          include: {
            customer: {
              include: {
                user: true,
              },
            },
          },
        });
        const txnMeta =
          typeof txn.metadata === 'object' && txn.metadata !== null
            ? (txn.metadata as Record<string, unknown>)
            : null;
        const suppressDebitSuccessNotify =
          txnMeta?.payoutAdminFeeSweep === true || txnMeta?.inflowAdminFeeSweep === true;
        if (payerWallet?.customer?.userId && !suppressDebitSuccessNotify) {
          notifyHolder.v = {
            userId: payerWallet.customer.userId,
            email: payerWallet.customer.user?.email ?? null,
            amountFormatted: resolveWithdrawalDisplayAmount(txn.amount, txn.metadata),
            transactionReference,
            destinationAccountNumber: txn.destinationAccountNumber,
            firstName: payerWallet.customer.user?.firstName ?? payerWallet.customer.firstName ?? undefined,
            kind: 'WITHDRAWAL_SUCCESS',
          };
        }

        this.walletRiskService.updateWalletRiskScore(sourceWalletId).catch((e) => {
          this.logger.error(`Risk score update (source) failed: ${e.message}`);
        });
      }
    });

    const confirmedEventSpray = confirmedEventSprayHolder.v;
    if (confirmedEventSpray) {
      this.eventSprayLiveBroadcast
        .broadcastSprayConfirmed(confirmedEventSpray.eventId, confirmedEventSpray.sprayId)
        .catch((error: Error) => {
          this.logger.warn(
            `Failed to broadcast confirmed spray for event ${confirmedEventSpray.eventId}: ${error.message}`,
          );
        });
    }

    const n = notifyHolder.v;
    if (n) {
      const destDisplay = n.destinationAccountNumber || 'Recipient';
      const emailStatus = n.kind === 'WITHDRAWAL_SUCCESS' ? 'success' : 'failed';
      if (n.email) {
        this.emailService
          .sendWithdrawalStatusAlert(
            n.email,
            n.amountFormatted,
            emailStatus,
            destDisplay,
            n.transactionReference,
            data?.narration ?? undefined,
            n.firstName,
            undefined,
            new Date(),
          )
          .catch((error) => {
            this.logger.error(`Failed to send transfer status email: ${error.message}`);
          });
      }
      try {
        const payload = buildWithdrawalPushNotification({
          kind: n.kind,
          amountFormatted: n.amountFormatted,
          transactionReference: n.transactionReference,
          destinationAccountNumber: n.destinationAccountNumber,
        });
        await this.notificationsService.sendNotificationIfEnabled(n.userId, payload);
      } catch (e: any) {
        this.logger.warn(`Failed to send transfer push (${n.kind}): ${e.message}`);
      }
    }

    return { received: true };
  }

  private async persistGenericNotification(
    raw: Record<string, unknown>,
    accountNumber: string | undefined,
    walletId: string | null | undefined,
    transactionTypeRaw: string | undefined,
  ): Promise<void> {
    await this.databaseService.providerWebhookEvent.create({
      data: {
        event: 'transaction-notification',
        paymentReference: accountNumber ? `notif-${accountNumber}-${raw?.transactionDate ?? ''}` : undefined,
        payload: {
          ...raw,
          walletId: walletId ?? null,
          virtualAccountNumber: accountNumber ?? null,
          transactionType: transactionTypeRaw ?? null,
        },
        processingStatus: 'PROCESSED',
      },
    });
  }

  async handleTransactionNotification(raw: any): Promise<{ received: true }> {
    const extracted = extractTransactionNotificationFields(raw);
    const notification = normalizeTransactionNotificationPayload(raw);

    this.logger.log(
      `Transaction notification received: account=${this.mask(extracted.accountNumber)} transactionType=${extracted.transactionType ?? 'n/a'} dataSource=${extracted.dataSource}`,
    );

    const accountNumber: string | undefined = extracted.accountNumber?.trim() || undefined;
    const transactionTypeRaw: string | undefined = extracted.transactionType;
    const kind = classifyTransactionNotification(notification);
    this.logger.log(
      `Transaction notification classified: account=${this.mask(accountNumber)} kind=${kind} transactionType=${transactionTypeRaw ?? 'n/a'}`,
    );

    const wallet = accountNumber
      ? await this.databaseService.wallet.findFirst({
          where: { virtualAccountNumber: accountNumber },
        })
      : null;

    if (kind === 'inflow_admin_fee') {
      if (!accountNumber) {
        throw new BadRequestException('accountNumber is required for inflow admin fee debit notifications');
      }
      const amountRaw = extracted.amount;
      if (amountRaw === undefined || amountRaw === null || Number.isNaN(Number(amountRaw))) {
        throw new BadRequestException('amount is required for inflow admin fee debit notifications');
      }
      const narration =
        typeof notification.narration === 'string' && notification.narration.trim()
          ? notification.narration.trim()
          : 'Admin funding fee';
      const ledgerResult = await this.notificationLedger.recordInflowAdminFeeNotification({
        accountNumber,
        amount: normalizeToKobo(amountRaw),
        narration,
        kind,
        raw: notification,
      });
      this.logger.log(
        `Inflow admin fee notification linked: walletId=${ledgerResult.walletId} feeTxId=${ledgerResult.transactionId} ref=${this.mask(ledgerResult.providerReference)} duplicate=${ledgerResult.isDuplicate}`,
      );
      return { received: true };
    }

    if (kind === 'payout_admin_fee') {
      if (!accountNumber) {
        throw new BadRequestException('accountNumber is required for payout admin fee debit notifications');
      }
      const amountRaw = extracted.amount;
      if (amountRaw === undefined || amountRaw === null || Number.isNaN(Number(amountRaw))) {
        throw new BadRequestException('amount is required for payout admin fee debit notifications');
      }
      const narration =
        typeof notification.narration === 'string' && notification.narration.trim()
          ? notification.narration.trim()
          : 'Admin payout fee';
      const ledgerResult = await this.notificationLedger.recordPayoutAdminFeeNotification({
        accountNumber,
        amount: normalizeToKobo(amountRaw),
        narration,
        kind,
        raw: notification,
      });
      this.logger.log(
        `Payout admin fee notification linked: walletId=${ledgerResult.walletId} feeTxId=${ledgerResult.transactionId} ref=${this.mask(ledgerResult.providerReference)} duplicate=${ledgerResult.isDuplicate}`,
      );
      return { received: true };
    }

    if (kind === 'payout_settlement') {
      if (!accountNumber) {
        throw new BadRequestException('accountNumber is required for payout settlement debit notifications');
      }
      const amountRaw = extracted.amount;
      if (amountRaw === undefined || amountRaw === null || Number.isNaN(Number(amountRaw))) {
        throw new BadRequestException('amount is required for payout settlement debit notifications');
      }
      const narration =
        typeof notification.narration === 'string' && notification.narration.trim()
          ? notification.narration.trim()
          : 'Payout settlement';
      const ledgerResult = await this.notificationLedger.recordPayoutSettlementNotification({
        accountNumber,
        amount: normalizeToKobo(amountRaw),
        narration,
        kind,
        raw: notification,
      });
      this.logger.log(
        `Payout settlement notification linked: walletId=${ledgerResult.walletId} txId=${ledgerResult.transactionId} ref=${this.mask(ledgerResult.providerReference)} duplicate=${ledgerResult.isDuplicate}`,
      );
      return { received: true };
    }

    if (kind === 'nip_commission' || kind === 'nip_vat' || kind === 'unclassified_debit') {
      if (!accountNumber) {
        throw new BadRequestException('accountNumber is required for debit transaction notifications');
      }
      const amountRaw = extracted.amount;
      if (amountRaw === undefined || amountRaw === null || Number.isNaN(Number(amountRaw))) {
        throw new BadRequestException('amount is required for debit transaction notifications');
      }
      const narration =
        typeof notification.narration === 'string' && notification.narration.trim()
          ? notification.narration.trim()
          : kind === 'unclassified_debit'
            ? 'Provider debit'
            : 'NIP transfer fee';

      if (kind === 'unclassified_debit') {
        const linked = await this.notificationLedger.tryLinkUnclassifiedProcessClientTransfer({
          accountNumber,
          amount: normalizeToKobo(amountRaw),
          narration,
          kind,
          raw: notification,
        });
        if (linked) {
          this.logger.log(
            `Unclassified debit linked to internal transfer: walletId=${linked.walletId} txId=${linked.transactionId} ref=${this.mask(linked.providerReference)} duplicate=${linked.isDuplicate}`,
          );
          return { received: true };
        }
      }

      const ledgerResult = await this.notificationLedger.recordNotificationDebit({
        accountNumber,
        amount: normalizeToKobo(amountRaw),
        narration,
        kind,
        raw: notification,
      });
      this.logger.log(
        `Debit notification ledger: kind=${kind} walletId=${ledgerResult.walletId} txId=${ledgerResult.transactionId} ref=${this.mask(ledgerResult.providerReference)} duplicate=${ledgerResult.isDuplicate}`,
      );
      return { received: true };
    }

    if (kind === 'nip_reversal') {
      if (!accountNumber) {
        throw new BadRequestException('accountNumber is required for NIP reversal notifications');
      }
      const amountRaw = extracted.amount;
      if (amountRaw === undefined || amountRaw === null || Number.isNaN(Number(amountRaw))) {
        throw new BadRequestException('amount is required for NIP reversal notifications');
      }
      const narration =
        typeof notification.narration === 'string' && notification.narration.trim()
          ? notification.narration.trim()
          : 'NIP transfer reversal';
      const ledgerResult = await this.notificationLedger.recordNipReversalCredit({
        accountNumber,
        amount: normalizeToKobo(amountRaw),
        narration,
        kind,
        raw: notification,
      });
      this.logger.log(
        `NIP reversal notification ledger: walletId=${ledgerResult.walletId} txId=${ledgerResult.transactionId} ref=${this.mask(ledgerResult.providerReference)} duplicate=${ledgerResult.isDuplicate}`,
      );
      return { received: true };
    }

    if (kind === 'internal_transfer_credit') {
      if (!accountNumber) {
        throw new BadRequestException('accountNumber is required for internal transfer credit notifications');
      }
      const amountRaw = extracted.amount;
      if (amountRaw === undefined || amountRaw === null || Number.isNaN(Number(amountRaw))) {
        throw new BadRequestException('amount is required for internal transfer credit notifications');
      }
      const narration =
        typeof notification.narration === 'string' && notification.narration.trim()
          ? notification.narration.trim()
          : 'Internal transfer credit';
      const ledgerResult = await this.notificationLedger.recordInternalTransferCreditNotification({
        accountNumber,
        amount: normalizeToKobo(amountRaw),
        narration,
        kind,
        raw: notification,
      });
      this.logger.log(
        `Internal transfer credit notification linked: walletId=${ledgerResult.walletId} txId=${ledgerResult.transactionId} ref=${this.mask(ledgerResult.providerReference)} duplicate=${ledgerResult.isDuplicate}`,
      );
      return { received: true };
    }

    if (kind === 'bank_inflow') {
      this.logger.log(
        `Transaction notification inflow path entered: account=${this.mask(accountNumber)} rawAmount=${extracted.amount != null ? String(extracted.amount) : 'n/a'}`,
      );
      if (!accountNumber) {
        this.logger.error('Transaction notification inflow validation failed: missing accountNumber');
        throw new BadRequestException('accountNumber is required for credit transaction notifications');
      }
      const amountRaw = extracted.amount;
      if (amountRaw === undefined || amountRaw === null || Number.isNaN(Number(amountRaw))) {
        this.logger.error(
          `Transaction notification inflow validation failed: invalid amount account=${this.mask(accountNumber)} rawAmount=${amountRaw != null ? String(amountRaw) : 'n/a'}`,
        );
        throw new BadRequestException('amount is required for credit transaction notifications');
      }

      const grossAmount = normalizeToKobo(amountRaw);
      const sprayDebitRef = parsePayoutTransactionReferenceFromNotification(notification);
      const pendingSprayDebit = await this.sprayTransferLookup.findPendingSprayDebitForReceiver({
        receiverAccountNumber: accountNumber,
        amount: grossAmount,
        sprayDebitRef,
      });
      if (pendingSprayDebit) {
        this.logger.warn(
          `Transaction notification rerouted from bank_inflow: pending spray debit account=${this.mask(accountNumber)} sprayRef=${this.mask(pendingSprayDebit.reference)}`,
        );
        const narration =
          typeof notification.narration === 'string' && notification.narration.trim()
            ? notification.narration.trim()
            : 'Internal transfer credit';
        const ledgerResult = await this.notificationLedger.recordInternalTransferCreditNotification({
          accountNumber,
          amount: grossAmount,
          narration,
          kind: 'internal_transfer_credit',
          raw: notification,
        });
        this.logger.log(
          `Internal transfer credit notification linked (spray reroute): walletId=${ledgerResult.walletId} txId=${ledgerResult.transactionId} ref=${this.mask(ledgerResult.providerReference)} duplicate=${ledgerResult.isDuplicate}`,
        );
        return { received: true };
      }

      const providerFee = normalizeToKobo(0);
      const providerReference = buildTransactionNotificationProviderReference(notification);
      const narration =
        typeof notification.narration === 'string' && notification.narration.trim()
          ? notification.narration.trim()
          : 'Inflow payment';

      const providerPayload = {
        ...notification,
        walletId: wallet?.id ?? null,
        virtualAccountNumber: accountNumber,
        transactionType: transactionTypeRaw ?? null,
      };

      this.logger.log(
        `Transaction notification inflow processing started: account=${this.mask(accountNumber)} wallet=${wallet?.id ?? 'n/a'} providerReference=${this.mask(providerReference)} grossAmount=${grossAmount.toString()}`,
      );

      let result: Awaited<ReturnType<InflowCreditService['processBankInflow']>>;
      try {
        result = await this.inflowCreditService.processBankInflow({
          accountNumber,
          grossAmount,
          providerFee,
          providerReference,
          narration,
          providerPayload,
          webhookEvent: { event: 'transaction-notification', paymentReference: providerReference },
        });
      } catch (error: any) {
        this.logger.error(
          `Transaction notification inflow processing failed: account=${this.mask(accountNumber)} providerReference=${this.mask(providerReference)} message=${error?.message ?? error}`,
          error?.stack,
        );
        throw error;
      }
      this.logger.log(
        `Transaction notification inflow processed: account=${this.mask(accountNumber)} providerReference=${this.mask(providerReference)} status=${result.status} duplicate=${result.isDuplicate}`,
      );

      const walletId = result.walletId;
      if (walletId) {
        this.walletRiskService.updateWalletRiskScore(walletId).catch((error) => {
          this.logger.error(`Failed to update risk score after transaction-notification inflow: ${error.message}`);
        });
      }

      if (result.status === 'success' && !result.isDuplicate && walletId) {
        const walletWithUser = await this.databaseService.wallet.findUnique({
          where: { id: walletId },
          include: {
            customer: {
              include: {
                user: true,
              },
            },
            fundings: {
              where: { providerReference },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        });

        if (walletWithUser?.customer?.user?.email && walletWithUser.virtualAccountNumber) {
          const amountFormatted = grossAmount.toFixed(2);
          const fundingTransaction = walletWithUser.fundings?.[0];
          const firstName =
            walletWithUser.customer.user.firstName || walletWithUser.customer.firstName || undefined;
          const paymentMethod = fundingTransaction?.channel || 'BANK_TRANSFER';
          const fundingDate = fundingTransaction?.createdAt || new Date();

          this.emailService
            .sendWalletFundingAlert(
              walletWithUser.customer.user.email,
              amountFormatted,
              walletWithUser.virtualAccountNumber,
              providerReference,
              firstName,
              paymentMethod,
              fundingDate,
            )
            .catch((error) => {
              this.logger.error(`Failed to send wallet funding email: ${error.message}`);
            });

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
                  reference: providerReference,
                  walletId: walletId,
                  virtualAccountNumber: walletWithUser.virtualAccountNumber || '',
                  paymentMethod: paymentMethod,
                },
              });
            } catch (notificationError: any) {
              this.logger.warn(`Failed to send inflow push notification: ${notificationError.message}`);
            }
          }
        }
      }

      return { received: true };
    }

    if (kind === 'unknown_notification') {
      this.logger.warn(
        `Unknown transaction-notification (missing or invalid transactionType): account=${this.mask(accountNumber)} transactionType=${transactionTypeRaw ?? 'n/a'}`,
      );
      await this.persistGenericNotification(notification, accountNumber, wallet?.id, transactionTypeRaw);
      return { received: true };
    }

    this.logger.warn(
      `Unhandled transaction-notification kind=${kind} account=${this.mask(accountNumber)} — persisting generic event`,
    );
    await this.persistGenericNotification(notification, accountNumber, wallet?.id, transactionTypeRaw);
    return { received: true };
  }
}
