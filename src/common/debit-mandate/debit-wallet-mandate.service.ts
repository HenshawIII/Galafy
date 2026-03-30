import { createHash, createHmac, randomBytes } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';

/**
 * Server-side HMAC mandate for ProcessClientTransfer `securityInfo`.
 * The partner echoes the same string to the auth callback; we store sha256(securityInfo) on Transaction.
 */
@Injectable()
export class DebitWalletMandateService {
  private readonly logger = new Logger(DebitWalletMandateService.name);

  private getSecret(): string {
    const s = process.env.DEBIT_WALLET_MANDATE_SECRET?.trim();
    if (!s) {
      this.logger.error(
        'DEBIT_WALLET_MANDATE_SECRET is not set. Server cannot generate debit mandates. Set a long random value in production.',
      );
      throw new Error(
        'DEBIT_WALLET_MANDATE_SECRET is not configured. Set it to a long random string (e.g. openssl rand -hex 32).',
      );
    }
    return s;
  }

  generateNonce(): string {
    return randomBytes(32).toString('hex');
  }

  generatePayoutMandate(params: {
    transactionReference: string;
    walletId: string;
    amountNormalized: string;
    bankCode: string;
    toAccountNumber: string;
    mandateNonce: string;
  }): { securityInfo: string; securityInfoHash: string } {
    const { transactionReference, walletId, amountNormalized, bankCode, toAccountNumber, mandateNonce } = params;
    const canonical = [
      'v1',
      'payout',
      transactionReference,
      walletId,
      amountNormalized,
      bankCode.trim(),
      toAccountNumber.trim(),
      mandateNonce,
    ].join('|');

    return this.signCanonical(canonical);
  }

  generateWalletToWalletMandate(params: {
    transactionReference: string;
    fromWalletId: string;
    toWalletId: string;
    amountNormalized: string;
    mandateNonce: string;
  }): { securityInfo: string; securityInfoHash: string } {
    const { transactionReference, fromWalletId, toWalletId, amountNormalized, mandateNonce } = params;
    const canonical = [
      'v1',
      'w2w',
      transactionReference,
      fromWalletId.trim(),
      toWalletId.trim(),
      amountNormalized,
      mandateNonce,
    ].join('|');

    return this.signCanonical(canonical);
  }

  /**
   * Event spray: deterministic per idempotency key (transactionReference) so retries return consistent mandate.
   */
  generateEventSprayMandate(params: {
    transactionReference: string;
    eventId: string;
    sprayerWalletId: string;
    receiverWalletId: string;
    amountNormalized: string;
    receiverVirtualAccount: string;
    receiverBankCode: string;
  }): { securityInfo: string; securityInfoHash: string } {
    const {
      transactionReference,
      eventId,
      sprayerWalletId,
      receiverWalletId,
      amountNormalized,
      receiverVirtualAccount,
      receiverBankCode,
    } = params;
    const canonical = [
      'v1',
      'spray',
      transactionReference,
      eventId,
      sprayerWalletId,
      receiverWalletId,
      amountNormalized,
      receiverVirtualAccount.trim(),
      receiverBankCode.trim(),
    ].join('|');

    return this.signCanonical(canonical);
  }

  private signCanonical(canonical: string): { securityInfo: string; securityInfoHash: string } {
    const hmacHex = createHmac('sha256', this.getSecret()).update(canonical, 'utf8').digest('hex');
    const securityInfo = `v1.hmac256.${hmacHex}`;
    const securityInfoHash = createHash('sha256').update(securityInfo, 'utf8').digest('hex');
    return { securityInfo, securityInfoHash };
  }
}
