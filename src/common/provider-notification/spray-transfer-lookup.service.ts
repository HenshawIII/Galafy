import { Injectable } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { DatabaseService } from '../../database/database.service.js';
import {
  TransactionDirection,
  TransactionStatus,
  TransactionType,
} from '../../../generated/prisma/enums.js';

export const SPRAY_TRANSFER_MATCH_LOOKBACK_MS = 15 * 60 * 1000;

export type PendingSprayDebitMatch = {
  id: string;
  reference: string;
  walletId: string;
  amount: Decimal;
  metadata: unknown;
};

@Injectable()
export class SprayTransferLookupService {
  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Match a receiver credit notification to an in-flight ProcessClientTransfer spray debit.
   */
  async findPendingSprayDebitForReceiver(params: {
    receiverAccountNumber: string;
    amount: Decimal;
    sprayDebitRef?: string | null;
    lookbackMs?: number;
  }): Promise<PendingSprayDebitMatch | null> {
    const lookbackMs = params.lookbackMs ?? SPRAY_TRANSFER_MATCH_LOOKBACK_MS;
    const since = new Date(Date.now() - lookbackMs);
    const receiverAccountNumber = params.receiverAccountNumber.trim();

    if (params.sprayDebitRef) {
      const byRef = await this.databaseService.transaction.findUnique({
        where: { reference: params.sprayDebitRef },
        select: {
          id: true,
          reference: true,
          walletId: true,
          amount: true,
          metadata: true,
          type: true,
          direction: true,
          status: true,
          destinationAccountNumber: true,
        },
      });
      if (
        byRef &&
        byRef.type === TransactionType.SPRAY &&
        byRef.direction === TransactionDirection.DEBIT &&
        byRef.destinationAccountNumber === receiverAccountNumber &&
        byRef.amount.equals(params.amount) &&
        (byRef.status === TransactionStatus.PENDING || byRef.status === TransactionStatus.PROCESSING)
      ) {
        return {
          id: byRef.id,
          reference: byRef.reference,
          walletId: byRef.walletId,
          amount: byRef.amount,
          metadata: byRef.metadata,
        };
      }
    }

    const row = await this.databaseService.transaction.findFirst({
      where: {
        type: TransactionType.SPRAY,
        direction: TransactionDirection.DEBIT,
        destinationAccountNumber: receiverAccountNumber,
        amount: params.amount,
        status: { in: [TransactionStatus.PENDING, TransactionStatus.PROCESSING] },
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        reference: true,
        walletId: true,
        amount: true,
        metadata: true,
      },
    });

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      reference: row.reference,
      walletId: row.walletId,
      amount: row.amount,
      metadata: row.metadata,
    };
  }

  /** Receiver callback may have already created the mirror SPRAY credit. */
  async hasRecentSprayCreditForAmount(
    walletId: string,
    amount: Decimal,
    lookbackMs?: number,
  ): Promise<boolean> {
    const since = new Date(Date.now() - (lookbackMs ?? SPRAY_TRANSFER_MATCH_LOOKBACK_MS));
    const credit = await this.databaseService.transaction.findFirst({
      where: {
        walletId,
        direction: TransactionDirection.CREDIT,
        type: TransactionType.SPRAY,
        amount,
        status: TransactionStatus.SUCCESS,
        createdAt: { gte: since },
        metadata: { path: ['sprayCredit'], equals: true },
      },
      select: { id: true },
    });
    return credit != null;
  }
}
