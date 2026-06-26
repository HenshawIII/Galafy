import { Test } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { UsersService } from '../users/users.service.js';
import { CustomerKycService } from '../customer-kyc/customer-kyc.service.js';
import { EmailService } from '../users/email.service.js';
import { JwtService } from '@nestjs/jwt';
import { DatabaseService } from '../database/database.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import {
  authConflictMessage,
  googleLoginCredentialsConflictMessage,
  googleLoginSignUpPromptMessage,
} from '../common/utils/auth-conflict-messages.util.js';

process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? 'test-client-id';

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
  fn.mockRejectedValue = (value: unknown) => {
    const rejected = (..._args: Parameters<T>) => Promise.reject(value);
    rejected.calls = fn.calls;
    return rejected as T;
  };
  return fn as T & { calls: Parameters<T>[]; mockResolvedValue: (v: unknown) => T; mockRejectedValue: (v: unknown) => T };
}

describe('AuthService google auth', () => {
  let service: AuthService;

  const usersService = {
    findByEmail: mockFn(),
    issueLoginSession: mockFn(),
    create: mockFn(),
  };

  const validateGoogleTokenSpy = mockFn(async () => ({
    email: 'test@example.com',
    name: 'Test User',
  }));

  beforeEach(async () => {
    usersService.findByEmail.calls = [];
    usersService.issueLoginSession.calls = [];
    validateGoogleTokenSpy.calls = [];

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: CustomerKycService, useValue: {} },
        { provide: EmailService, useValue: { sendWelcomeEmail: mockFn() } },
        { provide: JwtService, useValue: { sign: mockFn() } },
        { provide: DatabaseService, useValue: { user: { findUnique: mockFn(), update: mockFn() } } },
        {
          provide: NotificationsService,
          useValue: { deactivateAllDevicesForUser: mockFn(async () => ({ deactivated: 1 })) },
        },
      ],
    }).compile();

    service = module.get(AuthService);
    (service as unknown as { validateGoogleToken: typeof validateGoogleTokenSpy }).validateGoogleToken =
      validateGoogleTokenSpy;
  });

  describe('googleLogin', () => {
    it('rejects when user has password (credentials account)', async () => {
      usersService.findByEmail = mockFn(async () => ({
        id: 'u1',
        email: 'test@example.com',
        password: 'hashed',
      }));

      await expect(service.googleLogin('token')).rejects.toThrow(
        new UnauthorizedException(googleLoginCredentialsConflictMessage()),
      );
      expect(usersService.issueLoginSession.calls.length).toBe(0);
    });

    it('prompts sign up when user not found', async () => {
      usersService.findByEmail = mockFn(async () => null);

      await expect(service.googleLogin('token')).rejects.toThrow(googleLoginSignUpPromptMessage());
    });

    it('delegates to issueLoginSession for Google-only users', async () => {
      usersService.findByEmail = mockFn(async () => ({
        id: 'u1',
        email: 'test@example.com',
        password: null,
      }));
      const session = {
        access_token: 'a',
        refresh_token: 'r',
        isPinSet: false,
        accountLimits: null,
      };
      usersService.issueLoginSession = mockFn(async () => session);

      const result = await service.googleLogin('token');
      expect(result).toEqual(session);
      expect(usersService.issueLoginSession.calls).toEqual([['u1']]);
    });
  });

  describe('googleSignUp', () => {
    it('throws ConflictException with credentials message when email account has password', async () => {
      usersService.findByEmail = mockFn(async () => ({
        id: 'u1',
        email: 'test@example.com',
        password: 'hashed',
      }));

      await expect(service.googleSignUp('token')).rejects.toThrow(
        new ConflictException(authConflictMessage({ field: 'email', method: 'credentials' })),
      );
    });
  });

  describe('logout', () => {
    it('clears refresh token and deactivates notification devices', async () => {
      const notificationsService = {
        deactivateAllDevicesForUser: mockFn(async () => ({ deactivated: 2 })),
      };
      const userUpdate = mockFn(async () => ({}));

      const module = await Test.createTestingModule({
        providers: [
          AuthService,
          { provide: UsersService, useValue: usersService },
          { provide: CustomerKycService, useValue: {} },
          { provide: EmailService, useValue: { sendWelcomeEmail: mockFn() } },
          { provide: JwtService, useValue: { sign: mockFn() } },
          { provide: DatabaseService, useValue: { user: { update: userUpdate } } },
          { provide: NotificationsService, useValue: notificationsService },
        ],
      }).compile();

      const authService = module.get(AuthService);
      const result = await authService.logout('user-1');

      expect(result.message).toBe('Logged out successfully');
      expect(userUpdate.calls).toEqual([
        [
          {
            where: { id: 'user-1' },
            data: { refreshToken: null, refreshTokenExpiresAt: null },
          },
        ],
      ]);
      expect(notificationsService.deactivateAllDevicesForUser.calls).toEqual([['user-1']]);
    });
  });
});
