import { KycTier, Tier3UpgradeStatus } from '../../generated/prisma/enums.js';
import { CustomerKycService } from './customer-kyc.service.js';

function createMockFn<T extends (...args: any[]) => any>() {
  const calls: Parameters<T>[] = [];
  const fn = ((...args: Parameters<T>) => {
    calls.push(args);
    return (fn as any).impl ? (fn as any).impl(...args) : undefined;
  }) as T & { calls: Parameters<T>[]; impl?: T; mockResolvedValue: (value: any) => void };
  fn.calls = calls;
  fn.mockResolvedValue = (value: any) => {
    (fn as any).impl = (async () => value) as T;
  };
  return fn;
}

describe('CustomerKycService Tier 3 provider webhook helpers', () => {
  const databaseService = {
    customer: {
      findUnique: createMockFn(),
      update: createMockFn(),
    },
    addressVerification: {
      upsert: createMockFn(),
    },
  };
  const emailService = {
    sendTier3ApprovedEmail: createMockFn(),
  };
  const cacheService = {
    invalidateUserCache: createMockFn(),
  };
  const mixpanel = {
    identify: createMockFn(),
    track: createMockFn(),
  };

  let service: CustomerKycService;

  beforeEach(() => {
    for (const fn of [
      databaseService.customer.findUnique,
      databaseService.customer.update,
      databaseService.addressVerification.upsert,
      emailService.sendTier3ApprovedEmail,
      cacheService.invalidateUserCache,
      mixpanel.identify,
    ]) {
      fn.calls.length = 0;
    }

    databaseService.customer.update.mockResolvedValue({
      tier: KycTier.Tier_3,
      tier3UpgradeStatus: Tier3UpgradeStatus.COMPLETED,
    });
    databaseService.addressVerification.upsert.mockResolvedValue({});
    emailService.sendTier3ApprovedEmail.mockResolvedValue(undefined);
    cacheService.invalidateUserCache.mockResolvedValue(undefined);

    service = new CustomerKycService(
      databaseService as any,
      {} as any,
      {} as any,
      {} as any,
      mixpanel as any,
      emailService as any,
      cacheService as any,
    );
  });

  it('completes Tier 3 and sends approved email once', async () => {
    databaseService.customer.findUnique.mockResolvedValue({
      id: 'cust-1',
      userId: 'user-1',
      tier: KycTier.Tier_3,
      tier3UpgradeStatus: Tier3UpgradeStatus.PENDING,
      user: {
        email: 'jane@example.com',
        firstName: 'Jane',
        lastName: 'Doe',
        username: 'jane',
      },
    });

    const result = await service.completeTier3FromProviderWebhook('cust-1', {
      webhookEventId: 'evt-1',
      nuban: '0447131004',
    });

    expect(result.alreadyCompleted).toBe(false);
    expect(databaseService.customer.update.calls[0]?.[0].data).toMatchObject({
      tier: KycTier.Tier_3,
      providerTierCode: 3,
      tier3UpgradeStatus: Tier3UpgradeStatus.COMPLETED,
      tier2AddressVerificationStatus: 'COMPLETED',
    });
    expect(databaseService.addressVerification.upsert.calls[0]?.[0].update).toMatchObject({
      verified: true,
      providerStatus: 'COMPLETED',
    });
    expect(emailService.sendTier3ApprovedEmail.calls.length).toBe(1);
    expect(cacheService.invalidateUserCache.calls[0]?.[0]).toBe('user-1');
  });

  it('is idempotent when already COMPLETED (no duplicate email)', async () => {
    databaseService.customer.findUnique.mockResolvedValue({
      id: 'cust-1',
      userId: 'user-1',
      tier: KycTier.Tier_3,
      tier3UpgradeStatus: Tier3UpgradeStatus.COMPLETED,
      user: { email: 'jane@example.com', firstName: 'Jane', lastName: 'Doe', username: 'jane' },
    });

    const result = await service.completeTier3FromProviderWebhook('cust-1');

    expect(result.alreadyCompleted).toBe(true);
    expect(databaseService.customer.update.calls.length).toBe(0);
    expect(emailService.sendTier3ApprovedEmail.calls.length).toBe(0);
  });

  it('marks address verification FAILED without completing Tier 3', async () => {
    databaseService.customer.findUnique.mockResolvedValue({
      id: 'cust-1',
      userId: 'user-1',
      tier: KycTier.Tier_3,
      tier3UpgradeStatus: Tier3UpgradeStatus.PENDING,
    });
    databaseService.customer.update.mockResolvedValue({});

    const result = await service.markTier3AddressVerificationFailedFromProviderWebhook('cust-1');

    expect(result.ignored).toBe(false);
    expect(databaseService.customer.update.calls[0]?.[0].data).toEqual({
      tier2AddressVerificationStatus: 'FAILED',
    });
    expect(databaseService.addressVerification.upsert.calls[0]?.[0].update).toMatchObject({
      verified: false,
      providerStatus: 'FAILED',
    });
    expect(emailService.sendTier3ApprovedEmail.calls.length).toBe(0);
  });

  it('does not downgrade an already COMPLETED Tier 3 on failure webhook', async () => {
    databaseService.customer.findUnique.mockResolvedValue({
      id: 'cust-1',
      userId: 'user-1',
      tier: KycTier.Tier_3,
      tier3UpgradeStatus: Tier3UpgradeStatus.COMPLETED,
    });

    const result = await service.markTier3AddressVerificationFailedFromProviderWebhook('cust-1');

    expect(result.ignored).toBe(true);
    expect(databaseService.customer.update.calls.length).toBe(0);
    expect(databaseService.addressVerification.upsert.calls.length).toBe(0);
  });
});
