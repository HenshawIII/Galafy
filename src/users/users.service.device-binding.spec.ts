import { Test } from '@nestjs/testing';
import { UsersService } from './users.service.js';
import { DatabaseService } from '../database/database.service.js';
import { JwtService } from '@nestjs/jwt';
import { EmailService } from './email.service.js';
import { ProviderService } from '../provider/provider.service.js';
import { CacheService } from '../cache/cache.service.js';
import { CustomerKycService } from '../customer-kyc/customer-kyc.service.js';
import { TierLimitService } from '../common/services/tier-limit.service.js';
import { AdminNotificationService } from '../admin/admin-notification.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { MixpanelService } from '../analytics/mixpanel.service.js';

function mockFn<T extends (...args: unknown[]) => unknown>(impl?: T) {
  const fn = (...args: Parameters<T>) => {
    fn.calls.push(args);
    return impl?.(...args);
  };
  fn.calls = [] as Parameters<T>[];
  return fn as T & { calls: Parameters<T>[] };
}

describe('UsersService issueLoginSession device binding', () => {
  let service: UsersService;
  const registerDevice = mockFn(async () => ({ id: 'device-1' }));

  const db = {
    user: {
      findUnique: mockFn(),
      update: mockFn(async () => ({
        id: 'user-b',
        email: 'b@example.com',
        authSessionVersion: 2,
        isVerified: true,
      })),
    },
    customer: {
      findUnique: mockFn(async () => null),
    },
  };

  beforeEach(async () => {
    registerDevice.calls = [];
    db.user.findUnique = mockFn(async () => ({
      id: 'user-b',
      email: 'b@example.com',
      isVerified: true,
      payoutPin: null,
    }));
    db.user.update = mockFn(async () => ({
      id: 'user-b',
      email: 'b@example.com',
      authSessionVersion: 2,
      isVerified: true,
    }));

    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: DatabaseService, useValue: db },
        { provide: JwtService, useValue: { sign: mockFn(() => 'token') } },
        { provide: EmailService, useValue: {} },
        { provide: ProviderService, useValue: {} },
        { provide: CacheService, useValue: {} },
        { provide: CustomerKycService, useValue: { getCustomerKycStatusByUserId: mockFn(async () => null) } },
        {
          provide: TierLimitService,
          useValue: {
            getCustomerForLimits: mockFn(),
            buildAccountLimitsSnapshot: mockFn(),
          },
        },
        { provide: AdminNotificationService, useValue: {} },
        { provide: NotificationsService, useValue: { registerDevice } },
        { provide: MixpanelService, useValue: { track: mockFn(), identify: mockFn(), setOnce: mockFn() } },
      ],
    }).compile();

    service = module.get(UsersService);
  });

  it('registers push device during login session issuance', async () => {
    await service.issueLoginSession('user-b', {
      deviceToken: 'shared-token',
      deviceType: 'android',
      appVersion: '2.0.0',
    });

    expect(registerDevice.calls).toEqual([
      [
        'user-b',
        {
          deviceToken: 'shared-token',
          deviceType: 'android',
          appVersion: '2.0.0',
        },
      ],
    ]);
  });
});
