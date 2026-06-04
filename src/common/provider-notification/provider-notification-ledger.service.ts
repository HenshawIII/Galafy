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
import type { ProviderNotificationKind } from '../../provider/provider-notification-classifier.util.js';

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
          metadata: mergedMeta as Prisma.InputJsonValue,
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
              metadata: im as Prisma.InputJsonValue,
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
