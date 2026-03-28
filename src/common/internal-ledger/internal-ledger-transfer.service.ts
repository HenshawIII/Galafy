import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { normalizeToKobo } from '../utils/money.util.js';

/**
 * Moves funds between two internal wallet rows (same ledger). No provider call.
 * Use consistent wallet lock ordering to reduce deadlocks.
 */
@Injectable()
export class InternalLedgerTransferService {
  /**
   * Debit `fromWalletId`, credit `toWalletId`, by `amount`. Runs inside caller's transaction.
   */
  async transfer(
    tx: Prisma.TransactionClient,
    fromWalletId: string,
    toWalletId: string,
    amount: Decimal,
  ): Promise<void> {
    if (amount.lte(0)) {
      throw new BadRequestException('Transfer amount must be positive');
    }
    if (fromWalletId === toWalletId) {
      throw new BadRequestException('Source and destination wallet must differ');
    }

    const [lockFirst, lockSecond] =
      fromWalletId < toWalletId ? [fromWalletId, toWalletId] : [toWalletId, fromWalletId];

    await tx.$queryRaw`
      SELECT id FROM "Wallet" WHERE id = ${lockFirst} FOR UPDATE
    `;
    await tx.$queryRaw`
      SELECT id FROM "Wallet" WHERE id = ${lockSecond} FOR UPDATE
    `;

    const fromWallet = await tx.wallet.findUnique({
      where: { id: fromWalletId },
      select: { id: true, availableBalance: true, ledgerBalance: true },
    });
    const toWallet = await tx.wallet.findUnique({
      where: { id: toWalletId },
      select: { id: true, availableBalance: true, ledgerBalance: true },
    });

    if (!fromWallet || !toWallet) {
      throw new NotFoundException('Wallet not found for internal transfer');
    }

    if (fromWallet.availableBalance.lt(amount)) {
      throw new BadRequestException('Insufficient balance');
    }

    const fromAvail = normalizeToKobo(fromWallet.availableBalance.minus(amount));
    const fromLedger = normalizeToKobo(fromWallet.ledgerBalance.minus(amount));
    const toAvail = normalizeToKobo(toWallet.availableBalance.plus(amount));
    const toLedger = normalizeToKobo(toWallet.ledgerBalance.plus(amount));

    await tx.wallet.update({
      where: { id: fromWalletId },
      data: {
        availableBalance: fromAvail,
        ledgerBalance: fromLedger,
      },
    });
    await tx.wallet.update({
      where: { id: toWalletId },
      data: {
        availableBalance: toAvail,
        ledgerBalance: toLedger,
      },
    });
  }
}
