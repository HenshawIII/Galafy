import { Test } from '@nestjs/testing';
import { Decimal } from '@prisma/client/runtime/library';
import { ProviderNotificationLedgerService } from './provider-notification-ledger.service.js';
import { DatabaseService } from '../../database/database.service.js';

function mockFn<T extends (...args: unknown[]) => unknown>(impl?: T) {
  const fn = (...args: Parameters<T>) => {
    fn.calls.push(args);
    return impl?.(...args);
  };
  fn.calls = [] as Parameters<T>[];
  return fn as T & { calls: Parameters<T>[] };
}

describe('ProviderNotificationLedgerService', () => {
  let service: ProviderNotificationLedgerService;
  const wallet = {
    id: 'w1',
    currencyId: 'cur1',
    availableBalance: new Decimal(1000),
    ledgerBalance: new Decimal(1000),
  };

  const db: {
    transaction: { findUnique: ReturnType<typeof mockFn>; create: ReturnType<typeof mockFn> };
    wallet: { findFirst: ReturnType<typeof mockFn>; findUnique: ReturnType<typeof mockFn>; update: ReturnType<typeof mockFn> };
    $transaction: ReturnType<typeof mockFn>;
    $queryRaw: ReturnType<typeof mockFn>;
  } = {
    transaction: { findUnique: mockFn(), create: mockFn() },
    wallet: { findFirst: mockFn(), findUnique: mockFn(), update: mockFn() },
    $transaction: mockFn(),
    $queryRaw: mockFn(),
  };

  beforeEach(async () => {
    db.transaction.findUnique = mockFn(async () => null);
    db.wallet.findFirst = mockFn(async () => wallet);
    db.$queryRaw = mockFn(async () => []);
    db.$transaction = mockFn(async (cb: (tx: typeof db) => Promise<unknown>) => {
      const tx = {
        $queryRaw: db.$queryRaw,
        wallet: {
          findUnique: mockFn(async () => wallet),
          update: mockFn(async () => wallet),
        },
        transaction: {
          create: mockFn(async () => ({ id: 'tx-nip-1' })),
        },
      };
      return cb(tx as unknown as typeof db);
    });

    const module = await Test.createTestingModule({
      providers: [ProviderNotificationLedgerService, { provide: DatabaseService, useValue: db }],
    }).compile();
    service = module.get(ProviderNotificationLedgerService);
  });

  it('records NIP commission debit with ADJUSTMENT type', async () => {
    const result = await service.recordNipFeeDebit({
      accountNumber: '1234567890',
      amount: new Decimal(10),
      narration: 'COMM ALAT NIP TRANSFER TO Withdrawal',
      kind: 'nip_commission',
      raw: {
        accountNumber: '1234567890',
        amount: 10,
        transactionType: 'Debit',
        narration: 'COMM ALAT NIP TRANSFER TO Withdrawal',
        transactionDate: '2026-05-23T02:00:00',
      },
    });
    expect(result.isDuplicate).toBe(false);
    expect(result.transactionId).toBe('tx-nip-1');
    expect(db.$transaction.calls.length).toBe(1);
  });

  it('records unclassified provider debit on wallet', async () => {
    const result = await service.recordNotificationDebit({
      accountNumber: '1234567890',
      amount: new Decimal(50),
      narration: 'Some other bank debit',
      kind: 'unclassified_debit',
      raw: {
        accountNumber: '1234567890',
        amount: 50,
        transactionType: 'Debit',
        narration: 'Some other bank debit',
        transactionDate: '2026-05-23T03:00:00',
      },
    });
    expect(result.isDuplicate).toBe(false);
    expect(db.$transaction.calls.length).toBe(1);
  });
});
