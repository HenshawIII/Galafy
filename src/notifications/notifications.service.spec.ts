import { Test } from '@nestjs/testing';
import { NotificationsService } from './notifications.service.js';
import { DatabaseService } from '../database/database.service.js';
import { FIREBASE_ADMIN } from './firesbase-admin.provider.js';

function mockFn<T extends (...args: unknown[]) => unknown>(impl?: T) {
  const fn = (...args: Parameters<T>) => {
    fn.calls.push(args);
    return impl?.(...args);
  };
  fn.calls = [] as Parameters<T>[];
  return fn as T & { calls: Parameters<T>[] };
}

describe('NotificationsService.registerDevice', () => {
  let service: NotificationsService;

  const db = {
    user: {
      findUnique: mockFn(async () => ({ id: 'user-b' })),
    },
    notificationDevice: {
      findUnique: mockFn(),
      update: mockFn(async (args: { where: { id: string }; data: Record<string, unknown> }) => ({
        id: args.where.id,
        ...args.data,
      })),
      create: mockFn(),
    },
  };

  beforeEach(async () => {
    db.user.findUnique = mockFn(async () => ({ id: 'user-b' }));
    db.notificationDevice.findUnique = mockFn();
    db.notificationDevice.update = mockFn(async (args: { where: { id: string }; data: Record<string, unknown> }) => ({
      id: args.where.id,
      ...args.data,
    }));
    db.notificationDevice.create = mockFn();

    const module = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: DatabaseService, useValue: db },
        {
          provide: FIREBASE_ADMIN,
          useValue: { messaging: () => ({ sendEachForMulticast: mockFn() }) },
        },
      ],
    }).compile();

    service = module.get(NotificationsService);
  });

  it('transfers device ownership when token belongs to another user', async () => {
    db.notificationDevice.findUnique = mockFn(async () => ({
      id: 'device-1',
      userId: 'user-a',
      deviceToken: 'shared-token',
      isActive: true,
    }));

    const result = await service.registerDevice('user-b', {
      deviceToken: 'shared-token',
      deviceType: 'ios',
      appVersion: '1.0.0',
    });

    expect(db.notificationDevice.update.calls).toEqual([
      [
        {
          where: { id: 'device-1' },
          data: {
            userId: 'user-b',
            deviceType: 'ios',
            appVersion: '1.0.0',
            isActive: true,
            lastSeenAt: expect.any(Date),
          },
        },
      ],
    ]);
    expect(result.userId).toBe('user-b');
  });
});
