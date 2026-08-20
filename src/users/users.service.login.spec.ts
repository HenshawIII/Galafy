import { Test } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
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

describe('UsersService login lockout', () => {
  let service: UsersService;

  const db = {
    user: {
      findUnique: mockFn(),
      update: mockFn(async () => ({})),
    },
  };

  beforeEach(async () => {
    db.user.findUnique = mockFn();
    db.user.update = mockFn(async () => ({}));

    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: DatabaseService, useValue: db },
        { provide: JwtService, useValue: { sign: mockFn(() => 'token') } },
        { provide: EmailService, useValue: {} },
        { provide: ProviderService, useValue: {} },
        { provide: CacheService, useValue: {} },
        { provide: CustomerKycService, useValue: {} },
        {
          provide: TierLimitService,
          useValue: {
            getCustomerForLimits: mockFn(),
            buildAccountLimitsSnapshot: mockFn(),
          },
        },
        { provide: AdminNotificationService, useValue: {} },
        { provide: NotificationsService, useValue: { registerDevice: mockFn() } },
        { provide: MixpanelService, useValue: { track: mockFn(), identify: mockFn(), setOnce: mockFn() } },
      ],
    }).compile();

    service = module.get(UsersService);
    (service as unknown as { issueLoginSession: typeof mockFn }).issueLoginSession = mockFn(async () => ({
      access_token: 'a',
      refresh_token: 'r',
      isPinSet: false,
      accountLimits: null,
    }));
  });

  it('locks account after repeated failed password attempts', async () => {
    const hashed = await bcrypt.hash('correct-password', 4);
    db.user.findUnique = mockFn(async (args: { where: { email?: string; id?: string } }) => {
      if (args.where.email === 'user@example.com') {
        return {
          id: 'u1',
          email: 'user@example.com',
          password: hashed,
          isVerified: true,
          failedLoginAttempts: 4,
          lockedUntil: null,
        };
      }
      if (args.where.id === 'u1') {
        return { failedLoginAttempts: 4 };
      }
      return null;
    });

    await expect(service.login({ email: 'user@example.com', password: 'wrong' })).rejects.toThrow(
      UnauthorizedException,
    );

    const lockUpdate = db.user.update.calls.find(
      (call) =>
        call[0]?.where?.id === 'u1' &&
        call[0]?.data?.failedLoginAttempts === 5 &&
        call[0]?.data?.lockedUntil instanceof Date,
    );
    expect(lockUpdate).toBeDefined();
  });

  it('rejects login when account is locked', async () => {
    const lockedUntil = new Date(Date.now() + 30 * 60 * 1000);
    db.user.findUnique = mockFn(async () => ({
      id: 'u1',
      email: 'user@example.com',
      password: 'hash',
      isVerified: true,
      failedLoginAttempts: 5,
      lockedUntil,
    }));

    await expect(service.login({ email: 'user@example.com', password: 'any' })).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('resets failed attempts on successful login', async () => {
    const hashed = await bcrypt.hash('correct-password', 4);
    db.user.findUnique = mockFn(async () => ({
      id: 'u1',
      email: 'user@example.com',
      password: hashed,
      isVerified: true,
      failedLoginAttempts: 2,
      lockedUntil: null,
    }));

    await service.login({ email: 'user@example.com', password: 'correct-password' });

    expect(db.user.update.calls).toContainEqual([
      {
        where: { id: 'u1' },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      },
    ]);
  });
});
