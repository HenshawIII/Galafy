import { formatSprayForLive } from './spray-live-payload.util.js';
import { Decimal } from '@prisma/client/runtime/library';

describe('formatSprayForLive', () => {
  it('includes sprayer and receiver user details', () => {
    const createdAt = new Date('2026-01-01T12:00:00.000Z');
    const updatedAt = new Date('2026-01-01T12:01:00.000Z');

    const payload = formatSprayForLive({
      id: 'spray-1',
      totalAmount: new Decimal('5000'),
      note: 'Nice one',
      status: 'PENDING_PROVIDER',
      createdAt,
      updatedAt,
      sprayerWallet: {
        customer: {
          user: {
            id: 'user-a',
            username: 'sprayer1',
            profilePicture: 'https://example.com/a.png',
            settings: { showOnLeaderboard: true },
          },
        },
      },
      receiverWallet: {
        customer: {
          user: {
            id: 'user-b',
            username: 'host1',
            profilePicture: null,
            settings: { showOnLeaderboard: false },
          },
        },
      },
    });

    expect(payload).toEqual({
      id: 'spray-1',
      totalAmount: '5000',
      note: 'Nice one',
      status: 'PENDING_PROVIDER',
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
      sprayer: {
        id: 'user-a',
        username: 'sprayer1',
        profilePicture: 'https://example.com/a.png',
        showOnLeaderboard: true,
        visibleAtEvents: true,
      },
      receiver: {
        id: 'user-b',
        username: 'host1',
        profilePicture: null,
        showOnLeaderboard: false,
        visibleAtEvents: true,
      },
    });
  });
});
