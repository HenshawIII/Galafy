import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { Prisma } from '@prisma/client';
import { DatabaseService } from '../../database/database.service.js';
import {
  TransactionDirection,
  TransactionStatus,
  TransactionType,
} from '../../../generated/prisma/enums.js';
import { normalizeToKobo } from '../utils/money.util.js';
import { buildTransactionNotificationProviderReference } from '../utils/provider-transaction-notification-reference.util.js';
import { parseFeeSweepReferenceFromNotification } from '../utils/inflow-admin-fee-notification.util.js';
import {
  parsePayoutFeeSweepReferenceFromNotification,
  parsePayoutTransactionReferenceFromNotification,
} from '../utils/payout-notification.util.js';
import {
  isInternalSprayTransferNarration,
  parseEventIdFromSprayNarration,
} from '../utils/spray-notification.util.js';
import type { ProviderNotificationKind } from '../../provider/provider-notification-classifier.util.js';

type LinkableTxnRow = {
  id: string;
  walletId: string;
  status: TransactionStatus;
  amount: Decimal;
  metadata: unknown;
  reference: string | null;
  type: TransactionType;
};

export type NotificationLedgerInput = {
  accountNumber: string;
  amount: Decimal;
  narration: string;
  kind: ProviderNotificationKind;
  raw: Record<string, unknown>;
};

export type NotificationLedgerResult = {
  walletId: string;
  transactionId: string;
  providerReference: string;
  isDuplicate: boolean;
};

@Injectable()
export class ProviderNotificationLedgerService {
  private readonly logger = new Logger(ProviderNotificationLedgerService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  buildProviderReference(raw: Record<string, unknown>): string {
    return buildTransactionNotificationProviderReference(raw);
  }

  /**
   * Records any provider debit notification on the wallet ledger (ADJUSTMENT debit).
   */
  async recordNotificationDebit(input: NotificationLedgerInput): Promise<NotificationLedgerResult> {
    const metadata: Record<string, unknown> = {
      providerNotification: true,
      notificationKind: input.kind,
      narration: input.narration,
    };
    if (input.kind === 'nip_commission') {
      metadata.nipFeeKind = 'COMM';
    } else if (input.kind === 'nip_vat') {
      metadata.nipFeeKind = 'VAT';
    }

    return this.recordWalletDebit({
      accountNumber: input.accountNumber,
      amount: input.amount,
      narration: input.narration,
      raw: input.raw,
      transactionType: TransactionType.ADJUSTMENT,
      metadata,
    });
  }

  async recordNipFeeDebit(input: NotificationLedgerInput): Promise<NotificationLedgerResult> {
    return this.recordNotificationDebit(input);
  }

  /**
   * Bank debit notification for an inflow admin fee sweep (ProcessClientTransfer to org VA).
   * Links to the existing FEE-* Transaction from InflowCreditService — no second wallet debit.
   */
  async recordInflowAdminFeeNotification(input: NotificationLedgerInput): Promise<NotificationLedgerResult> {
    const providerReference = this.buildProviderReference(input.raw);
    const amount = normalizeToKobo(input.amount);

    const wallet = await this.databaseService.wallet.findFirst({
      where: { virtualAccountNumber: input.accountNumber },
      select: { id: true },
    });
    if (!wallet) {
      throw new NotFoundException(`Wallet not found for account number: ${input.accountNumber}`);
    }

    const feeSweepRef = parseFeeSweepReferenceFromNotification({
      narration: input.narration,
      reference: input.raw.reference,
      transactionReference: input.raw.transactionReference,
      platformTransactionReference: input.raw.platformTransactionReference,
    });

    let feeTxn = feeSweepRef
      ? await this.databaseService.transaction.findUnique({
          where: { reference: feeSweepRef },
          select: {
            id: true,
            walletId: true,
            status: true,
            amount: true,
            metadata: true,
            reference: true,
          },
        })
      : null;

    if (feeTxn && feeTxn.walletId !== wallet.id) {
      this.logger.warn(
        `Inflow admin fee notification: FEE ref ${feeSweepRef} belongs to another wallet; falling back to amount match`,
      );
      feeTxn = null;
    }

    if (!feeTxn) {
      feeTxn = await this.databaseService.transaction.findFirst({
        where: {
          walletId: wallet.id,
          type: TransactionType.ADJUSTMENT,
          direction: TransactionDirection.DEBIT,
          amount,
          reference: { startsWith: 'FEE-' },
          status: { in: [TransactionStatus.PENDING, TransactionStatus.PROCESSING] },
          metadata: {
            path: ['inflowAdminFeeSweep'],
            equals: true,
          },
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          walletId: true,
          status: true,
          amount: true,
          metadata: true,
          reference: true,
        },
      });
    }

    if (!feeTxn) {
      this.logger.warn(
        `Inflow admin fee notification: no matching FEE sweep for wallet=${wallet.id} amount=${amount.toFixed(2)} ref=${providerReference}; skipping wallet debit`,
      );
      return {
        walletId: wallet.id,
        transactionId: '',
        providerReference,
        isDuplicate: false,
      };
    }

    const feeMeta = this.getTxnMetadata(feeTxn.metadata);
    const linkedInflowId =
      typeof feeMeta.inflowTransactionId === 'string' ? (feeMeta.inflowTransactionId as string) : null;
    if (linkedInflowId) {
      const linkedInflow = await this.databaseService.transaction.findUnique({
        where: { id: linkedInflowId },
        select: { narration: true, metadata: true },
      });
      if (
        linkedInflow &&
        (isInternalSprayTransferNarration(linkedInflow.narration) ||
          isInternalSprayTransferNarration(
            typeof linkedInflow.metadata === 'object' && linkedInflow.metadata !== null
              ? (linkedInflow.metadata as Record<string, unknown>).narration
              : null,
          ))
      ) {
        this.logger.warn(
          `Inflow admin fee notification skipped: linked inflow is internal spray transfer feeTx=${feeTxn.reference}`,
        );
        return {
          walletId: wallet.id,
          transactionId: '',
          providerReference,
          isDuplicate: false,
        };
      }
    }

    const existingMeta =
      typeof feeTxn.metadata === 'object' && feeTxn.metadata !== null
        ? (feeTxn.metadata as Record<string, unknown>)
        : {};

    const priorNotifRef =
      typeof existingMeta.providerNotificationReference === 'string'
        ? existingMeta.providerNotificationReference
        : null;

    if (priorNotifRef === providerReference) {
      return {
        walletId: feeTxn.walletId,
        transactionId: feeTxn.id,
        providerReference,
        isDuplicate: true,
      };
    }

    const mergedMeta: Record<string, unknown> = {
      ...existingMeta,
      providerNotification: true,
      notificationKind: 'inflow_admin_fee',
      providerNotificationReference: providerReference,
      providerNotificationLinkedAt: new Date().toISOString(),
      linkedWithoutWalletDebit: true,
    };

    await this.databaseService.$transaction(async (tx: Prisma.TransactionClient) => {
      const nextStatus =
        feeTxn!.status === TransactionStatus.PENDING || feeTxn!.status === TransactionStatus.PROCESSING
          ? TransactionStatus.SUCCESS
          : feeTxn!.status;

      await tx.transaction.update({
        where: { id: feeTxn!.id },
        data: {
          status: nextStatus,
          metadata: mergedMeta as any,
        },
      });

      const adminFeeId =
        typeof existingMeta.adminFeeId === 'string' ? (existingMeta.adminFeeId as string) : null;
      if (adminFeeId) {
        await tx.adminFee.update({
          where: { id: adminFeeId },
          data: { status: 'COLLECTED' },
        });
      }

      const inflowTxId =
        typeof existingMeta.inflowTransactionId === 'string' ? (existingMeta.inflowTransactionId as string) : null;
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
    });

    this.logger.log(
      `Inflow admin fee notification linked (no wallet debit): feeTx=${feeTxn.reference} walletId=${wallet.id} notifRef=${providerReference} amount=${amount.toFixed(2)}`,
    );

    return {
      walletId: feeTxn.walletId,
      transactionId: feeTxn.id,
      providerReference,
      isDuplicate: false,
    };
  }

  /**
   * Bank debit notification for a payout admin fee sweep (FEEP-* ProcessClientTransfer).
   * Links to existing FEEP ADJUSTMENT — no second wallet debit (callback already debited).
   */
  async recordPayoutAdminFeeNotification(input: NotificationLedgerInput): Promise<NotificationLedgerResult> {
    const providerReference = this.buildProviderReference(input.raw);
    const amount = normalizeToKobo(input.amount);

    const wallet = await this.databaseService.wallet.findFirst({
      where: { virtualAccountNumber: input.accountNumber },
      select: { id: true },
    });
    if (!wallet) {
      throw new NotFoundException(`Wallet not found for account number: ${input.accountNumber}`);
    }

    const feeSweepRef = parsePayoutFeeSweepReferenceFromNotification({
      narration: input.narration,
      reference: input.raw.reference,
      transactionReference: input.raw.transactionReference,
      platformTransactionReference: input.raw.platformTransactionReference,
    });

    let feeTxn = await this.findPayoutAdminFeeSweepTxn(wallet.id, amount, feeSweepRef);
    if (!feeTxn) {
      this.logger.warn(
        `Payout admin fee notification: no matching FEEP sweep for wallet=${wallet.id} amount=${amount.toFixed(2)} ref=${providerReference}; skipping wallet debit`,
      );
      return {
        walletId: wallet.id,
        transactionId: '',
        providerReference,
        isDuplicate: false,
      };
    }

    return this.linkProviderNotificationToTxn({
      txn: feeTxn,
      providerReference,
      notificationKind: 'payout_admin_fee',
      markSuccessIfPending: true,
      collectAdminFee: true,
    });
  }

  /**
   * Bank debit notification for main payout / wallet-to-wallet ProcessClientTransfer (TXN-*).
   * Links to existing PAYOUT or SPRAY debit — no second wallet debit (callback already debited).
   */
  async recordPayoutSettlementNotification(input: NotificationLedgerInput): Promise<NotificationLedgerResult> {
    const providerReference = this.buildProviderReference(input.raw);
    const amount = normalizeToKobo(input.amount);

    const wallet = await this.databaseService.wallet.findFirst({
      where: { virtualAccountNumber: input.accountNumber },
      select: { id: true },
    });
    if (!wallet) {
      throw new NotFoundException(`Wallet not found for account number: ${input.accountNumber}`);
    }

    const settlementTxn = await this.findPayoutSettlementTxn(wallet.id, amount, input.raw);
    if (!settlementTxn) {
      this.logger.warn(
        `Payout settlement notification: no matching TXN transfer for wallet=${wallet.id} amount=${amount.toFixed(2)} ref=${providerReference}; skipping wallet debit`,
      );
      return {
        walletId: wallet.id,
        transactionId: '',
        providerReference,
        isDuplicate: false,
      };
    }

    return this.linkProviderNotificationToTxn({
      txn: settlementTxn,
      providerReference,
      notificationKind: 'payout_settlement',
      markSuccessIfPending: false,
      collectAdminFee: false,
    });
  }

  /**
   * Credit notification for internal ProcessClientTransfer (spray / wallet transfer).
   * Links to existing receiver credit — no wallet credit or funding fee logic.
   */
  async recordInternalTransferCreditNotification(
    input: NotificationLedgerInput,
  ): Promise<NotificationLedgerResult> {
    const providerReference = this.buildProviderReference(input.raw);
    const amount = normalizeToKobo(input.amount);

    const wallet = await this.databaseService.wallet.findFirst({
      where: { virtualAccountNumber: input.accountNumber },
      select: { id: true },
    });
    if (!wallet) {
      throw new NotFoundException(`Wallet not found for account number: ${input.accountNumber}`);
    }

    const creditTxn = await this.findInternalTransferCreditTxn(
      wallet.id,
      amount,
      input.raw,
      input.narration,
    );
    if (!creditTxn) {
      this.logger.warn(
        `Internal transfer credit notification: no matching credit for wallet=${wallet.id} amount=${amount.toFixed(2)} ref=${providerReference}; skipping wallet credit`,
      );
      return {
        walletId: wallet.id,
        transactionId: '',
        providerReference,
        isDuplicate: false,
      };
    }

    return this.linkProviderNotificationToTxn({
      txn: creditTxn,
      providerReference,
      notificationKind: 'internal_transfer_credit',
      markSuccessIfPending: false,
      collectAdminFee: false,
    });
  }

  /**
   * Before treating a debit as unclassified, try to link it to an internal ProcessClientTransfer leg.
   */
  async tryLinkUnclassifiedProcessClientTransfer(
    input: NotificationLedgerInput,
  ): Promise<NotificationLedgerResult | null> {
    const providerReference = this.buildProviderReference(input.raw);
    const amount = normalizeToKobo(input.amount);

    const wallet = await this.databaseService.wallet.findFirst({
      where: { virtualAccountNumber: input.accountNumber },
      select: { id: true },
    });
    if (!wallet) {
      return null;
    }

    const feeSweepRef = parsePayoutFeeSweepReferenceFromNotification({
      narration: input.narration,
      reference: input.raw.reference,
      transactionReference: input.raw.transactionReference,
      platformTransactionReference: input.raw.platformTransactionReference,
    });
    const feeTxn = await this.findPayoutAdminFeeSweepTxn(wallet.id, amount, feeSweepRef);
    if (feeTxn) {
      return this.linkProviderNotificationToTxn({
        txn: feeTxn,
        providerReference,
        notificationKind: 'payout_admin_fee',
        markSuccessIfPending: true,
        collectAdminFee: true,
      });
    }

    const settlementTxn = await this.findPayoutSettlementTxn(wallet.id, amount, input.raw);
    if (settlementTxn) {
      return this.linkProviderNotificationToTxn({
        txn: settlementTxn,
        providerReference,
        notificationKind: 'payout_settlement',
        markSuccessIfPending: false,
        collectAdminFee: false,
      });
    }

    return null;
  }

  private getTxnMetadata(metadata: unknown): Record<string, unknown> {
    return typeof metadata === 'object' && metadata !== null ? (metadata as Record<string, unknown>) : {};
  }

  private hasLinkedNotification(metadata: Record<string, unknown>, providerReference: string): boolean {
    return metadata.providerNotificationReference === providerReference;
  }

  private async findPayoutAdminFeeSweepTxn(
    walletId: string,
    amount: Decimal,
    feeSweepRef: string | null,
  ): Promise<LinkableTxnRow | null> {
    let feeTxn: LinkableTxnRow | null = null;

    if (feeSweepRef) {
      const row = await this.databaseService.transaction.findUnique({
        where: { reference: feeSweepRef },
        select: {
          id: true,
          walletId: true,
          status: true,
          amount: true,
          metadata: true,
          reference: true,
          type: true,
        },
      });
      if (row && row.walletId === walletId) {
        feeTxn = row;
      } else if (row) {
        this.logger.warn(`Payout admin fee notification: FEEP ref ${feeSweepRef} belongs to another wallet`);
      }
    }

    if (!feeTxn) {
      feeTxn = await this.databaseService.transaction.findFirst({
        where: {
          walletId,
          type: TransactionType.ADJUSTMENT,
          direction: TransactionDirection.DEBIT,
          amount,
          reference: { startsWith: 'FEEP-' },
          status: { in: [TransactionStatus.PENDING, TransactionStatus.PROCESSING, TransactionStatus.SUCCESS] },
          metadata: {
            path: ['payoutAdminFeeSweep'],
            equals: true,
          },
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          walletId: true,
          status: true,
          amount: true,
          metadata: true,
          reference: true,
          type: true,
        },
      });
    }

    return feeTxn;
  }

  private async findPayoutSettlementTxn(
    walletId: string,
    amount: Decimal,
    raw: Record<string, unknown>,
  ): Promise<LinkableTxnRow | null> {
    const txnRef = parsePayoutTransactionReferenceFromNotification({
      narration: raw.narration,
      reference: raw.reference,
      transactionReference: raw.transactionReference,
      platformTransactionReference: raw.platformTransactionReference,
    });

    if (txnRef) {
      const row = await this.databaseService.transaction.findUnique({
        where: { reference: txnRef },
        select: {
          id: true,
          walletId: true,
          status: true,
          amount: true,
          metadata: true,
          reference: true,
          type: true,
          direction: true,
        },
      });
      if (
        row &&
        row.walletId === walletId &&
        row.direction === TransactionDirection.DEBIT &&
        (row.type === TransactionType.PAYOUT || row.type === TransactionType.SPRAY)
      ) {
        return {
          id: row.id,
          walletId: row.walletId,
          status: row.status,
          amount: row.amount,
          metadata: row.metadata,
          reference: row.reference,
          type: row.type,
        };
      }
      if (row && row.walletId !== walletId) {
        this.logger.warn(`Payout settlement notification: TXN ref ${txnRef} belongs to another wallet`);
      }
    }

    const candidates = await this.databaseService.transaction.findMany({
      where: {
        walletId,
        direction: TransactionDirection.DEBIT,
        type: { in: [TransactionType.PAYOUT, TransactionType.SPRAY] },
        status: { in: [TransactionStatus.PENDING, TransactionStatus.PROCESSING, TransactionStatus.SUCCESS] },
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        walletId: true,
        status: true,
        amount: true,
        metadata: true,
        reference: true,
        type: true,
      },
    });

    for (const candidate of candidates) {
      const meta = this.getTxnMetadata(candidate.metadata);
      if (typeof meta.providerNotificationReference === 'string') {
        continue;
      }
      if (candidate.amount.equals(amount)) {
        return candidate;
      }
      const payoutNetAmount = meta.payoutNetAmount;
      if (
        typeof payoutNetAmount === 'string' &&
        normalizeToKobo(payoutNetAmount).equals(amount)
      ) {
        return candidate;
      }
    }

    return null;
  }

  private parsePlatformReferenceFromNotification(raw: Record<string, unknown>): string | null {
    for (const field of [
      raw.referenceId,
      raw.reference,
      raw.platformTransactionReference,
      raw.transactionReference,
    ]) {
      if (typeof field === 'string' && field.trim()) {
        return field.trim();
      }
    }
    return null;
  }

  private async findInternalTransferCreditTxn(
    walletId: string,
    amount: Decimal,
    raw: Record<string, unknown>,
    narration: string,
  ): Promise<LinkableTxnRow | null> {
    const platformRef = this.parsePlatformReferenceFromNotification(raw);
    if (platformRef) {
      const creditRef = `CREDIT-${platformRef}`;
      const byRef = await this.databaseService.transaction.findUnique({
        where: { reference: creditRef },
        select: {
          id: true,
          walletId: true,
          status: true,
          amount: true,
          metadata: true,
          reference: true,
          type: true,
          direction: true,
        },
      });
      if (
        byRef &&
        byRef.walletId === walletId &&
        byRef.direction === TransactionDirection.CREDIT
      ) {
        return {
          id: byRef.id,
          walletId: byRef.walletId,
          status: byRef.status,
          amount: byRef.amount,
          metadata: byRef.metadata,
          reference: byRef.reference,
          type: byRef.type,
        };
      }

      const byExternal = await this.databaseService.transaction.findFirst({
        where: {
          walletId,
          direction: TransactionDirection.CREDIT,
          externalReference: platformRef,
          type: { in: [TransactionType.SPRAY, TransactionType.INFLOW] },
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          walletId: true,
          status: true,
          amount: true,
          metadata: true,
          reference: true,
          type: true,
        },
      });
      if (byExternal && byExternal.amount.equals(amount)) {
        return byExternal;
      }
    }

    const sprayDebitRef = parsePayoutTransactionReferenceFromNotification({
      narration: raw.narration,
      reference: raw.reference,
      transactionReference: raw.transactionReference,
      platformTransactionReference: raw.platformTransactionReference,
    });
    if (sprayDebitRef) {
      const debitTxn = await this.databaseService.transaction.findUnique({
        where: { reference: sprayDebitRef },
        select: { reference: true, groupReference: true },
      });
      if (debitTxn?.reference) {
        const linkedCredit = await this.databaseService.transaction.findFirst({
          where: {
            walletId,
            direction: TransactionDirection.CREDIT,
            amount,
            OR: [
              {
                metadata: {
                  path: ['linkedSprayDebitRef'],
                  equals: debitTxn.reference,
                },
              },
              ...(debitTxn.groupReference
                ? [{ groupReference: debitTxn.groupReference }]
                : []),
            ],
          },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            walletId: true,
            status: true,
            amount: true,
            metadata: true,
            reference: true,
            type: true,
          },
        });
        if (linkedCredit) {
          return linkedCredit;
        }
      }
    }

    const eventId = parseEventIdFromSprayNarration(narration);
    if (eventId) {
      const sprayCredit = await this.databaseService.transaction.findFirst({
        where: {
          walletId,
          direction: TransactionDirection.CREDIT,
          amount,
          type: { in: [TransactionType.SPRAY, TransactionType.INFLOW] },
          narration: { contains: eventId, mode: 'insensitive' },
          status: { in: [TransactionStatus.PENDING, TransactionStatus.PROCESSING, TransactionStatus.SUCCESS] },
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          walletId: true,
          status: true,
          amount: true,
          metadata: true,
          reference: true,
          type: true,
        },
      });
      if (sprayCredit) {
        return sprayCredit;
      }
    }

    const recentCredit = await this.databaseService.transaction.findFirst({
      where: {
        walletId,
        direction: TransactionDirection.CREDIT,
        amount,
        type: { in: [TransactionType.SPRAY, TransactionType.INFLOW] },
        status: { in: [TransactionStatus.PENDING, TransactionStatus.PROCESSING, TransactionStatus.SUCCESS] },
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        walletId: true,
        status: true,
        amount: true,
        metadata: true,
        reference: true,
        type: true,
      },
    });

    if (recentCredit) {
      const meta = this.getTxnMetadata(recentCredit.metadata);
      if (meta.sprayCredit === true || meta.providerCallback) {
        return recentCredit;
      }
    }

    return null;
  }

  private async linkProviderNotificationToTxn(params: {
    txn: LinkableTxnRow;
    providerReference: string;
    notificationKind: string;
    markSuccessIfPending: boolean;
    collectAdminFee: boolean;
  }): Promise<NotificationLedgerResult> {
    const existingMeta = this.getTxnMetadata(params.txn.metadata);

    if (this.hasLinkedNotification(existingMeta, params.providerReference)) {
      return {
        walletId: params.txn.walletId,
        transactionId: params.txn.id,
        providerReference: params.providerReference,
        isDuplicate: true,
      };
    }

    const mergedMeta: Record<string, unknown> = {
      ...existingMeta,
      providerNotification: true,
      notificationKind: params.notificationKind,
      providerNotificationReference: params.providerReference,
      providerNotificationLinkedAt: new Date().toISOString(),
      linkedWithoutWalletDebit: true,
    };

    await this.databaseService.$transaction(async (tx: Prisma.TransactionClient) => {
      const nextStatus =
        params.markSuccessIfPending &&
        (params.txn.status === TransactionStatus.PENDING || params.txn.status === TransactionStatus.PROCESSING)
          ? TransactionStatus.SUCCESS
          : params.txn.status;

      await tx.transaction.update({
        where: { id: params.txn.id },
        data: {
          status: nextStatus,
          metadata: mergedMeta as any,
        },
      });

      if (params.collectAdminFee) {
        const adminFeeId =
          typeof existingMeta.adminFeeId === 'string' ? (existingMeta.adminFeeId as string) : null;
        if (adminFeeId) {
          await tx.adminFee.update({
            where: { id: adminFeeId },
            data: { status: 'COLLECTED' },
          });
        }
      }
    });

    this.logger.log(
      `Provider notification linked (no wallet debit): kind=${params.notificationKind} tx=${params.txn.reference ?? params.txn.id} walletId=${params.txn.walletId} notifRef=${params.providerReference}`,
    );

    return {
      walletId: params.txn.walletId,
      transactionId: params.txn.id,
      providerReference: params.providerReference,
      isDuplicate: false,
    };
  }

  async recordNipReversalCredit(input: NotificationLedgerInput): Promise<NotificationLedgerResult> {
    const providerReference = this.buildProviderReference(input.raw);
    const amount = normalizeToKobo(input.amount);

    const existing = await this.databaseService.transaction.findUnique({
      where: { reference: providerReference },
      select: { id: true, walletId: true },
    });
    if (existing) {
      return {
        walletId: existing.walletId,
        transactionId: existing.id,
        providerReference,
        isDuplicate: true,
      };
    }

    const wallet = await this.databaseService.wallet.findFirst({
      where: { virtualAccountNumber: input.accountNumber },
      select: { id: true, currencyId: true, availableBalance: true, ledgerBalance: true },
    });
    if (!wallet) {
      throw new NotFoundException(`Wallet not found for account number: ${input.accountNumber}`);
    }

    const groupReference = `NIP-REV-${providerReference}`;

    const result = await this.databaseService.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.$queryRaw`
        SELECT id FROM "Wallet" WHERE id = ${wallet.id} FOR UPDATE
      `;

      const locked = await tx.wallet.findUnique({
        where: { id: wallet.id },
        select: { id: true, availableBalance: true, ledgerBalance: true, currencyId: true },
      });
      if (!locked) {
        throw new NotFoundException('Wallet not found after lock');
      }

      const txn = await tx.transaction.create({
        data: {
          walletId: locked.id,
          type: TransactionType.REFUND,
          direction: TransactionDirection.CREDIT,
          status: TransactionStatus.SUCCESS,
          amount,
          currencyId: locked.currencyId,
          reference: providerReference,
          groupReference,
          narration: input.narration,
          metadata: {
            providerNotification: true,
            nipReversal: true,
            skipAdminFee: true,
            providerPayload: input.raw,
          },
        },
      });

      await tx.wallet.update({
        where: { id: locked.id },
        data: {
          availableBalance: locked.availableBalance.plus(amount),
          ledgerBalance: locked.ledgerBalance.plus(amount),
        },
      });

      return { transactionId: txn.id };
    });

    this.logger.log(
      `NIP reversal credited: walletId=${wallet.id} ref=${providerReference} amount=${amount.toFixed(2)} kind=nip_reversal`,
    );

    return {
      walletId: wallet.id,
      transactionId: result.transactionId,
      providerReference,
      isDuplicate: false,
    };
  }

  private async recordWalletDebit(params: {
    accountNumber: string;
    amount: Decimal;
    narration: string;
    raw: Record<string, unknown>;
    transactionType: TransactionType;
    metadata: Record<string, unknown>;
  }): Promise<NotificationLedgerResult> {
    const providerReference = this.buildProviderReference(params.raw);
    const amount = normalizeToKobo(params.amount);

    const existing = await this.databaseService.transaction.findUnique({
      where: { reference: providerReference },
      select: { id: true, walletId: true },
    });
    if (existing) {
      return {
        walletId: existing.walletId,
        transactionId: existing.id,
        providerReference,
        isDuplicate: true,
      };
    }

    const wallet = await this.databaseService.wallet.findFirst({
      where: { virtualAccountNumber: params.accountNumber },
      select: { id: true, currencyId: true, availableBalance: true, ledgerBalance: true },
    });
    if (!wallet) {
      throw new NotFoundException(`Wallet not found for account number: ${params.accountNumber}`);
    }

    if (wallet.availableBalance.lt(amount)) {
      this.logger.warn(
        `Provider notification debit exceeds available balance: walletId=${wallet.id} balance=${wallet.availableBalance.toFixed(2)} amount=${amount.toFixed(2)} ref=${providerReference}`,
      );
    }

    const result = await this.databaseService.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.$queryRaw`
        SELECT id FROM "Wallet" WHERE id = ${wallet.id} FOR UPDATE
      `;

      const locked = await tx.wallet.findUnique({
        where: { id: wallet.id },
        select: { id: true, availableBalance: true, ledgerBalance: true, currencyId: true },
      });
      if (!locked) {
        throw new NotFoundException('Wallet not found after lock');
      }

      const txn = await tx.transaction.create({
        data: {
          walletId: locked.id,
          type: params.transactionType,
          direction: TransactionDirection.DEBIT,
          status: TransactionStatus.SUCCESS,
          amount,
          currencyId: locked.currencyId,
          reference: providerReference,
          narration: params.narration,
          metadata: {
            ...params.metadata,
            providerPayload: params.raw,
          },
        },
      });

      await tx.wallet.update({
        where: { id: locked.id },
        data: {
          availableBalance: locked.availableBalance.minus(amount),
          ledgerBalance: locked.ledgerBalance.minus(amount),
        },
      });

      return { transactionId: txn.id };
    });

    this.logger.log(
      `Provider notification debited: walletId=${wallet.id} ref=${providerReference} amount=${amount.toFixed(2)} metadata=${JSON.stringify(params.metadata)}`,
    );

    return {
      walletId: wallet.id,
      transactionId: result.transactionId,
      providerReference,
      isDuplicate: false,
    };
  }
}
