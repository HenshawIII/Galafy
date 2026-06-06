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

  it('links inflow admin fee notification without debiting wallet', async () => {
    const feeTxn = {
      id: 'fee-tx-1',
      walletId: 'w1',
      status: 'PENDING',
      amount: new Decimal(10),
      metadata: { inflowAdminFeeSweep: true, adminFeeId: 'af1', inflowTransactionId: 'inflow-1' },
      reference: 'FEE-abc123',
    };
    db.transaction.findUnique = mockFn(async (args: { where: { reference?: string } }) => {
      if (args?.where?.reference === 'FEE-abc123') return feeTxn;
      return null;
    });
    let walletUpdated = false;
    db.$transaction = mockFn(async (cb: (tx: typeof db) => Promise<unknown>) => {
      const tx = {
        transaction: {
          update: mockFn(async () => feeTxn),
          findUnique: mockFn(async () => ({ id: 'inflow-1', metadata: { feeSweepPending: true } })),
        },
        adminFee: { update: mockFn(async () => ({})) },
      };
      return cb(tx as unknown as typeof db);
    });
    db.wallet.findFirst = mockFn(async () => ({ id: 'w1' }));
    db.wallet.update = mockFn(async () => {
      walletUpdated = true;
      return wallet;
    });

    const result = await service.recordInflowAdminFeeNotification({
      accountNumber: '1234567890',
      amount: new Decimal(10),
      narration: 'Admin funding fee FEE-abc123',
      kind: 'inflow_admin_fee',
      raw: {
        accountNumber: '1234567890',
        amount: 10,
        transactionType: 'Debit',
        narration: 'Admin funding fee FEE-abc123',
        transactionDate: '2026-06-04T12:00:00',
      },
    });

    expect(result.transactionId).toBe('fee-tx-1');
    expect(result.isDuplicate).toBe(false);
    expect(walletUpdated).toBe(false);
  });

  it('links payout admin fee notification without debiting wallet', async () => {
    const feeTxn = {
      id: 'fee-tx-payout',
      walletId: 'w1',
      status: 'PENDING',
      amount: new Decimal(30),
      metadata: { payoutAdminFeeSweep: true, adminFeeId: 'af1' },
      reference: 'FEEP-abc123',
      type: 'ADJUSTMENT',
    };
    db.transaction.findUnique = mockFn(async (args: { where: { reference?: string } }) => {
      if (args?.where?.reference === 'FEEP-abc123') return feeTxn;
      return null;
    });
    let walletUpdated = false;
    db.$transaction = mockFn(async (cb: (tx: typeof db) => Promise<unknown>) => {
      const tx = {
        transaction: { update: mockFn(async () => feeTxn) },
        adminFee: { update: mockFn(async () => ({})) },
      };
      return cb(tx as unknown as typeof db);
    });
    db.wallet.findFirst = mockFn(async () => ({ id: 'w1' }));
    db.wallet.update = mockFn(async () => {
      walletUpdated = true;
      return wallet;
    });

    const result = await service.recordPayoutAdminFeeNotification({
      accountNumber: '1234567890',
      amount: new Decimal(30),
      narration: 'Admin payout fee FEEP-abc123',
      kind: 'payout_admin_fee',
      raw: {
        accountNumber: '1234567890',
        amount: 30,
        transactionType: 'Debit',
        narration: 'Admin payout fee FEEP-abc123',
      },
    });

    expect(result.transactionId).toBe('fee-tx-payout');
    expect(walletUpdated).toBe(false);
  });

  it('links payout settlement notification without debiting wallet', async () => {
    const payoutTxn = {
      id: 'payout-tx-1',
      walletId: 'w1',
      status: 'SUCCESS',
      amount: new Decimal(970),
      metadata: { payoutNetAmount: '970.00', payoutGrossAmount: '1000.00' },
      reference: 'TXN-abc123',
      type: 'PAYOUT',
      direction: 'DEBIT',
    };
    db.transaction.findUnique = mockFn(async (args: { where: { reference?: string } }) => {
      if (args?.where?.reference === 'TXN-abc123') return payoutTxn;
      return null;
    });
    db.transaction.findMany = mockFn(async () => []);
    let walletUpdated = false;
    db.$transaction = mockFn(async (cb: (tx: typeof db) => Promise<unknown>) => {
      const tx = { transaction: { update: mockFn(async () => payoutTxn) } };
      return cb(tx as unknown as typeof db);
    });
    db.wallet.findFirst = mockFn(async () => ({ id: 'w1' }));
    db.wallet.update = mockFn(async () => {
      walletUpdated = true;
      return wallet;
    });

    const result = await service.recordPayoutSettlementNotification({
      accountNumber: '1234567890',
      amount: new Decimal(970),
      narration: 'Wallet payout to 0123456789',
      kind: 'payout_settlement',
      raw: {
        accountNumber: '1234567890',
        amount: 970,
        transactionType: 'Debit',
        narration: 'Wallet payout to 0123456789',
        transactionReference: 'TXN-abc123',
      },
    });

    expect(result.transactionId).toBe('payout-tx-1');
    expect(walletUpdated).toBe(false);
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
