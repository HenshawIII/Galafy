import { ForbiddenException } from '@nestjs/common';
import { ProviderAccountStatusService } from './provider-account-status.service.js';

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
  fn.mockRejectedValue = (error: unknown) => {
    const rejected = (..._args: Parameters<T>) => Promise.reject(error);
    rejected.calls = fn.calls;
    return rejected as T;
  };
  return fn as T & {
    calls: Parameters<T>[];
    mockResolvedValue: (v: unknown) => T;
    mockRejectedValue: (e: unknown) => T;
  };
}

describe('ProviderAccountStatusService', () => {
  const databaseService = {
    customer: {
      findUnique: mockFn(),
    },
  };
  const providerService = {
    getPartnerAccountKycStatus: mockFn(),
  };

  let service: ProviderAccountStatusService;

  beforeEach(() => {
    databaseService.customer.findUnique = mockFn();
    providerService.getPartnerAccountKycStatus = mockFn();
    service = new ProviderAccountStatusService(databaseService as never, providerService as never);
  });

  it('assertProviderAllowsOutbound throws when provider account is INACTIVE', async () => {
    databaseService.customer.findUnique = mockFn(async () => ({
      tier1Nuban: '0447131004',
      wallets: [],
    }));
    providerService.getPartnerAccountKycStatus = mockFn(async () => ({
      data: {
        accountNumber: '0447131004',
        accountStatus: 'INACTIVE',
        restrictionStatus: 'D',
      },
    }));

    await expect(service.assertProviderAllowsOutbound('customer-1')).rejects.toThrow(ForbiddenException);
  });

  it('assertProviderAllowsOutbound passes when provider account is ACTIVE', async () => {
    databaseService.customer.findUnique = mockFn(async () => ({
      tier1Nuban: '0447131004',
      wallets: [],
    }));
    providerService.getPartnerAccountKycStatus = mockFn(async () => ({
      data: {
        accountNumber: '0447131004',
        accountStatus: 'ACTIVE',
        restrictionStatus: null,
      },
    }));

    await expect(service.assertProviderAllowsOutbound('customer-1')).resolves.toBeUndefined();
  });

  it('assertProviderAllowsOutbound fail-opens when provider call fails', async () => {
    databaseService.customer.findUnique = mockFn(async () => ({
      tier1Nuban: '0447131004',
      wallets: [],
    }));
    providerService.getPartnerAccountKycStatus = mockFn(async () => {
      throw new Error('provider down');
    });

    await expect(service.assertProviderAllowsOutbound('customer-1')).resolves.toBeUndefined();
  });
});
