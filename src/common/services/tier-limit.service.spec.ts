import { Test } from '@nestjs/testing';
import { Decimal } from '@prisma/client/runtime/library';
import { ForbiddenException } from '@nestjs/common';
import { KycTier, Tier3UpgradeStatus } from '../../../generated/prisma/enums.js';
import { TierLimitService } from './tier-limit.service.js';
import { DatabaseService } from '../../database/database.service.js';
import { CacheService } from '../../cache/cache.service.js';

function mockFn<T extends (...args: unknown[]) => unknown>(impl?: T) {
  const fn = (...args: Parameters<T>) => {
    fn.calls.push(args);
    return impl?.(...args);
  };
  fn.calls = [] as Parameters<T>[];
  fn.mockResolvedValue = (value: unknown) => {
    const resolved = (..._args: Parameters<T>) => value;
    resolved.calls = fn.calls;
    return resolved as T;
  };
  return fn as T & { calls: Parameters<T>[]; mockResolvedValue: (v: unknown) => T };
}

describe('TierLimitService', () => {
  let service: TierLimitService;
  const db = {
    customer: {
      findUnique: mockFn(),
      update: mockFn(),
    },
    wallet: { findFirst: mockFn() },
    withdrawalLimit: { findUnique: mockFn(), create: mockFn(), update: mockFn() },
  };
  const cache = { invalidateUserCache: mockFn(async () => undefined) };

  beforeEach(async () => {
    db.customer.findUnique.calls = [];
    db.customer.update.calls = [];
    db.wallet.findFirst.calls = [];
    cache.invalidateUserCache.calls = [];

    const module = await Test.createTestingModule({
      providers: [
        TierLimitService,
        { provide: DatabaseService, useValue: db },
        { provide: CacheService, useValue: cache },
      ],
    }).compile();
    service = module.get(TierLimitService);
  });

  it('assertOutboundAllowed blocks balance-restricted customers', () => {
    expect(() =>
      service.assertOutboundAllowed({
        id: 'c1',
        tier: KycTier.Tier_1,
        tier3UpgradeStatus: null,
        isBalanceRestricted: true,
        balanceRestrictionReason: 'Over cap',
        providerRestrictionStatus: null,
        isAmlRestricted: false,
      }),
    ).toThrow(ForbiddenException);
  });

  it('evaluateBalanceAfterInflow sets restriction when balance exceeds tier max', async () => {
    db.customer.findUnique = mockFn(async () => ({
      id: 'c1',
      tier: KycTier.Tier_1,
      tier3UpgradeStatus: null,
      isBalanceRestricted: false,
      balanceRestrictionReason: null,
      providerRestrictionStatus: null,
      isAmlRestricted: false,
    }));
    db.wallet.findFirst = mockFn(async () => ({ availableBalance: new Decimal(350000) }));
    db.customer.update = mockFn(async () => ({ userId: 'u1' }));

    const restricted = await service.evaluateBalanceAfterInflow('c1');
    expect(restricted).toBe(true);
    expect(db.customer.update.calls.length).toBe(1);
    expect(cache.invalidateUserCache.calls).toEqual([['u1']]);
  });

  it('assertDailySpendAllowed skips unlimited Tier_3 COMPLETED', async () => {
    db.customer.findUnique = mockFn(async () => ({
      id: 'c1',
      tier: KycTier.Tier_3,
      tier3UpgradeStatus: Tier3UpgradeStatus.COMPLETED,
      isBalanceRestricted: false,
      balanceRestrictionReason: null,
      providerRestrictionStatus: null,
      isAmlRestricted: false,
    }));
    db.withdrawalLimit.findUnique = mockFn();

    await expect(service.assertDailySpendAllowed('c1', new Decimal(999999))).resolves.toBeUndefined();
    expect(db.withdrawalLimit.findUnique.calls.length).toBe(0);
  });
});
