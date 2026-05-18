import {
  extractTransactionCallbackFields,
  sanitizeProviderCallbackForLog,
} from './provider-callback-payload.util.js';

describe('provider-callback-payload.util', () => {
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
});
