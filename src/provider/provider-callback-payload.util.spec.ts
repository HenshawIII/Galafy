import { TransactionStatus } from '../../generated/prisma/enums.js';
import {
  extractTransactionCallbackFields,
  extractTransactionNotificationFields,
  mapProviderStatusToTransactionStatus,
  normalizeTransactionNotificationPayload,
  sanitizeProviderCallbackForLog,
} from './provider-callback-payload.util.js';

describe('provider-callback-payload.util', () => {
  it('maps ALAT Success to SUCCESS', () => {
    expect(mapProviderStatusToTransactionStatus('Success')).toBe(TransactionStatus.SUCCESS);
    expect(mapProviderStatusToTransactionStatus('SUCCESSFUL')).toBe(TransactionStatus.SUCCESS);
  });

  it('extracts PascalCase Status from data envelope', () => {
    const fields = extractTransactionCallbackFields({
      data: {
        Status: 'Success',
        TransactionReference: 'FEE-abc',
        PlatformTransactionReference: '639147319387981870',
      },
    });
    expect(fields.transactionReference).toBe('FEE-abc');
    expect(fields.platformTransactionReference).toBe('639147319387981870');
    expect(fields.status).toBe('Success');
    expect(mapProviderStatusToTransactionStatus(fields.status)).toBe(TransactionStatus.SUCCESS);
  });

  it('extracts from data envelope', () => {
    const fields = extractTransactionCallbackFields({
      data: {
        status: 'SUCCESSFUL',
        transactionReference: 'FEE-abc123',
        platformTransactionReference: 'PLAT-999',
      },
    });
    expect(fields.transactionReference).toBe('FEE-abc123');
    expect(fields.platformTransactionReference).toBe('PLAT-999');
    expect(fields.dataSource).toBe('data');
  });

  it('extracts from root-level fields', () => {
    const fields = extractTransactionCallbackFields({
      status: 'SUCCESSFUL',
      TransactionReference: 'TXN-1',
      PlatformTransactionReference: 'TXN-2',
    });
    expect(fields.transactionReference).toBe('TXN-1');
    expect(fields.platformTransactionReference).toBe('TXN-2');
    expect(fields.dataSource).toBe('root');
  });

  it('redacts securityInfo in logs', () => {
    const log = sanitizeProviderCallbackForLog({
      transactionReference: 'FEE-abc',
      securityInfo: 'secret-mandate-payload',
      accountNumber: '0123456789',
    });
    expect(log).toContain('[REDACTED]');
    expect(log).not.toContain('secret-mandate');
    expect(log).toContain('6789');
  });

  it('extracts transaction notification fields from data envelope', () => {
    const fields = extractTransactionNotificationFields({
      data: {
        AccountNumber: '0123456789',
        TransactionType: 'Credit',
        Amount: 500,
        Narration: 'Transfer credit',
        ReferenceId: '330052014056',
      },
    });
    expect(fields.accountNumber).toBe('0123456789');
    expect(fields.transactionType).toBe('Credit');
    expect(fields.amount).toBe(500);
    expect(fields.referenceId).toBe('330052014056');
    expect(fields.dataSource).toBe('data');
  });

  it('normalizes nested notification payload onto root', () => {
    const normalized = normalizeTransactionNotificationPayload({
      data: {
        accountNumber: '0123456789',
        transactionType: 'Credit',
        amount: 500,
        narration: 'EventId:42fe5e31-9623-4899-b223-17b1d9c39648 Spray in Party',
      },
    });
    expect(normalized.accountNumber).toBe('0123456789');
    expect(normalized.narration).toContain('EventId:');
  });
});
