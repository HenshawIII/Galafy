import { Decimal } from '@prisma/client/runtime/library';
import { WalletReconciliationService } from './wallet-reconciliation.service.js';

function mockFn<T extends (...args: unknown[]) => unknown>(impl?: T) {
  const fn = (...args: Parameters<T>) => {
    fn.calls.push(args);
    return impl?.(...args);
  };
  fn.calls = [] as Parameters<T>[];
  return fn as T & { calls: Parameters<T>[] };
}

describe('WalletReconciliationService', () => {
  let service: WalletReconciliationService;
  let providerService: {
    getProviderAccountDetails: ReturnType<typeof mockFn>;
  };
  let cacheService: {
    get: ReturnType<typeof mockFn>;
    set: ReturnType<typeof mockFn>;
  };

  const wallet = {
    id: 'w1',
    availableBalance: new Decimal('1000'),
    ledgerBalance: new Decimal('1000'),
    virtualAccountNumber: '0446881649',
  };

  beforeEach(() => {
    providerService = {
      getProviderAccountDetails: mockFn(async () => ({
        walletNumber: '0446881649',
        availableBalance: '1000.00',
        accountType: 'Savings',
      })),
    };
    cacheService = {
      get: mockFn(async () => undefined),
      set: mockFn(async () => undefined),
    };
    service = new WalletReconciliationService(providerService as never, cacheService as never);
  });

  it('builds in-sync provider balance snapshot', async () => {
    const snapshot = await service.buildProviderBalanceSnapshot(wallet);
    expect(snapshot?.inSync).toBe(true);
    expect(snapshot?.discrepancy).toBe('0.00');
    expect(snapshot?.availableBalance).toBe('1000.00');
    expect(snapshot?.internalAvailableBalance).toBe('1000.00');
  });

  it('flags discrepancy when provider balance differs', async () => {
    providerService.getProviderAccountDetails = mockFn(async () => ({
      walletNumber: '0446881649',
      availableBalance: '970.00',
      accountType: 'Savings',
    }));

    const snapshot = await service.buildProviderBalanceSnapshot(wallet);
    expect(snapshot?.inSync).toBe(false);
    expect(snapshot?.discrepancy).toBe('30.00');
  });

  it('returns graceful snapshot when provider fetch fails', async () => {
    providerService.getProviderAccountDetails = mockFn(async () => {
      throw new Error('upstream unavailable');
    });

    const snapshot = await service.buildProviderBalanceSnapshot(wallet);
    expect(snapshot?.providerFetchError).toContain('upstream unavailable');
    expect(snapshot?.inSync).toBeNull();
    expect(snapshot?.availableBalance).toBeNull();
    expect(snapshot?.internalAvailableBalance).toBe('1000.00');
  });

  it('returns null when wallet has no virtual account number', async () => {
    const snapshot = await service.buildProviderBalanceSnapshot({
      ...wallet,
      virtualAccountNumber: null,
    });
    expect(snapshot).toBeNull();
  });
});
