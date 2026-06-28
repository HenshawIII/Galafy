import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { CacheService } from '../cache/cache.service.js';
import { SprayStatus } from '../../generated/prisma/enums.js';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class EventLeaderboardService {
  private readonly logger = new Logger(EventLeaderboardService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly cacheService: CacheService,
  ) {}

  /**
   * Returns aggregated sprays per sprayer, sorted by total amount descending.
   * Cached for 30 seconds.
   */
  async getEventLeaderboard(eventId: string) {
    const cacheKey = this.cacheService.getEventKey(eventId, 'leaderboard');
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const event = await this.databaseService.event.findFirst({
      where: { id: eventId },
      select: { id: true, title: true },
    });

    if (!event) {
      throw new NotFoundException(`Event with ID ${eventId} not found`);
    }

    const sprays = await this.databaseService.spray.findMany({
      where: { eventId, status: SprayStatus.CONFIRMED },
      select: {
        id: true,
        totalAmount: true,
        note: true,
        createdAt: true,
        sprayerWallet: {
          include: {
            customer: {
              include: {
                user: {
                  select: {
                    id: true,
                    username: true,
                    email: true,
                    firstName: true,
                    lastName: true,
                    settings: {
                      select: {
                        showOnLeaderboard: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const leaderboardMap = new Map<
      string,
      {
        userId: string;
        username: string | null;
        email: string;
        firstName: string | null;
        lastName: string | null;
        showOnLeaderboard: boolean;
        totalAmount: Decimal;
        sprayCount: number;
        firstSprayAt: Date;
        lastSprayAt: Date;
        latestNote: string | null;
      }
    >();

    for (const spray of sprays) {
      const user = spray.sprayerWallet.customer.user;

      if (!user) {
        this.logger.warn(`User not found for sprayer wallet ${spray.sprayerWallet.id}`);
        continue;
      }

      const userId = user.id;
      const existing = leaderboardMap.get(userId);

      if (existing) {
        existing.totalAmount = existing.totalAmount.plus(spray.totalAmount);
        existing.sprayCount += 1;
        if (spray.createdAt > existing.lastSprayAt) {
          existing.lastSprayAt = spray.createdAt;
          existing.latestNote = spray.note || null;
        }
        if (spray.createdAt < existing.firstSprayAt) {
          existing.firstSprayAt = spray.createdAt;
        }
      } else {
        leaderboardMap.set(userId, {
          userId: user.id,
          username: user.username,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          showOnLeaderboard: user.settings?.showOnLeaderboard ?? true,
          totalAmount: spray.totalAmount,
          sprayCount: 1,
          firstSprayAt: spray.createdAt,
          lastSprayAt: spray.createdAt,
          latestNote: spray.note || null,
        });
      }
    }

    const leaderboard = Array.from(leaderboardMap.values())
      .map((entry) => ({
        userId: entry.userId,
        username: entry.username,
        email: entry.email,
        firstName: entry.firstName,
        lastName: entry.lastName,
        showOnLeaderboard: entry.showOnLeaderboard,
        totalAmount: entry.totalAmount.toString(),
        sprayCount: entry.sprayCount,
        firstSprayAt: entry.firstSprayAt.toISOString(),
        lastSprayAt: entry.lastSprayAt.toISOString(),
        latestNote: entry.latestNote,
        rank: 0,
      }))
      .sort((a, b) => {
        const amountA = new Decimal(a.totalAmount);
        const amountB = new Decimal(b.totalAmount);
        return amountB.comparedTo(amountA);
      })
      .map((entry, index) => ({
        ...entry,
        rank: index + 1,
      }));

    const result = {
      eventId: event.id,
      eventTitle: event.title,
      leaderboard,
      totalParticipants: leaderboard.length,
    };

    await this.cacheService.set(cacheKey, result, 30);

    return result;
  }
}
