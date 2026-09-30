import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { DatabaseService } from '../database/database.service.js';
import { EventLeaderboardService } from './event-leaderboard.service.js';
import { SprayStatus } from '../../generated/prisma/enums.js';
import { Decimal } from '@prisma/client/runtime/library';
import { UpdatePublicLeaderboardDto } from './dto/public-leaderboard.dto.js';

export type PublicLeaderboardEntry = {
  rank: number;
  displayName: string;
  profilePicture: string | null;
  totalAmount?: string;
  sprayCount: number;
};

export type PublicActivityItem = {
  type: 'spray' | 'rank_up';
  displayName: string;
  amount?: string;
  rank?: number;
  createdAt: string;
};

export type PublicLeaderboardSnapshot = {
  event: {
    id: string;
    title: string;
    imageUrl: string | null;
    status: string;
    startsAt: string;
  };
  showAmounts: boolean;
  stats: {
    totalSprayed: string | null;
    giversCount: number;
  };
  leaderboard: PublicLeaderboardEntry[];
  recentActivity: PublicActivityItem[];
};

type FullLeaderboardResult = {
  eventId: string;
  eventTitle: string;
  totalParticipants: number;
  leaderboard: Array<{
    rank: number;
    userId: string;
    username: string | null;
    email: string;
    firstName: string | null;
    lastName: string | null;
    showOnLeaderboard: boolean;
    totalAmount: string;
    sprayCount: number;
    firstSprayAt: string;
    lastSprayAt: string;
    latestNote: string | null;
  }>;
};

@Injectable()
export class PublicLeaderboardService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly eventLeaderboardService: EventLeaderboardService,
  ) {}

  private getShareBaseUrl(): string {
    return (process.env.PUBLIC_LEADERBOARD_BASE_URL || 'http://localhost:5174').replace(/\/$/, '');
  }

  private buildShareUrl(token: string): string {
    return `${this.getShareBaseUrl()}/e/${token}`;
  }

  private generateToken(): string {
    return randomBytes(24).toString('base64url');
  }

  formatDisplayName(input: {
    firstName?: string | null;
    lastName?: string | null;
    username?: string | null;
  }): string {
    const first = input.firstName?.trim();
    const last = input.lastName?.trim();
    if (first && last) {
      return `${first} ${last.charAt(0).toUpperCase()}.`;
    }
    if (first) return first;
    if (input.username?.trim()) return input.username.trim();
    return 'Guest';
  }

  async getHostPublicLeaderboard(eventId: string, userId: string) {
    const event = await this.requireHostEvent(eventId, userId);
    return this.toHostResponse(event);
  }

  async updateHostPublicLeaderboard(
    eventId: string,
    userId: string,
    dto: UpdatePublicLeaderboardDto,
  ) {
    const event = await this.requireHostEvent(eventId, userId);

    let token = event.publicLeaderboardToken;
    if (dto.enabled && !token) {
      token = this.generateToken();
    }

    const updated = await this.databaseService.event.update({
      where: { id: eventId },
      data: {
        publicLeaderboardEnabled: dto.enabled,
        publicLeaderboardShowAmounts:
          dto.showAmounts !== undefined ? dto.showAmounts : event.publicLeaderboardShowAmounts,
        publicLeaderboardToken: token,
      },
      select: {
        id: true,
        publicLeaderboardEnabled: true,
        publicLeaderboardShowAmounts: true,
        publicLeaderboardToken: true,
      },
    });

    return this.toHostResponse(updated);
  }

  async getSnapshotByToken(token: string): Promise<PublicLeaderboardSnapshot> {
    const event = await this.databaseService.event.findFirst({
      where: {
        publicLeaderboardToken: token,
        publicLeaderboardEnabled: true,
        deletedAt: null,
      },
      select: {
        id: true,
        title: true,
        imageUrl: true,
        status: true,
        startsAt: true,
        publicLeaderboardShowAmounts: true,
      },
    });

    if (!event) {
      throw new NotFoundException('Public leaderboard not found');
    }

    return this.buildSnapshot(event);
  }

  async getEventPublicShareSettings(eventId: string): Promise<{
    enabled: boolean;
    showAmounts: boolean;
  } | null> {
    const event = await this.databaseService.event.findFirst({
      where: { id: eventId, deletedAt: null },
      select: {
        publicLeaderboardEnabled: true,
        publicLeaderboardShowAmounts: true,
      },
    });
    if (!event || !event.publicLeaderboardEnabled) {
      return null;
    }
    return {
      enabled: true,
      showAmounts: event.publicLeaderboardShowAmounts,
    };
  }

  sanitizeLeaderboardForPublic(
    fullLeaderboard: FullLeaderboardResult,
    showAmounts: boolean,
    profileByUserId: Map<string, string | null>,
  ): PublicLeaderboardEntry[] {
    const rows = Array.isArray(fullLeaderboard?.leaderboard) ? fullLeaderboard.leaderboard : [];
    return rows.map((entry) => {
      const mapped: PublicLeaderboardEntry = {
        rank: entry.rank,
        displayName: this.formatDisplayName(entry),
        profilePicture: profileByUserId.get(entry.userId) ?? null,
        sprayCount: entry.sprayCount,
      };
      if (showAmounts) {
        mapped.totalAmount = entry.totalAmount;
      }
      return mapped;
    });
  }

  sanitizeSprayCreatedForPublic(
    payload: {
      eventId: string;
      spray: {
        id: string;
        totalAmount: string;
        createdAt: string | Date;
        sprayer?: {
          firstName?: string | null;
          lastName?: string | null;
          username?: string | null;
        } | null;
      };
      eventTotals: { totalAmount: string; totalCount: number };
      pending: boolean;
    },
    showAmounts: boolean,
  ) {
    const displayName = this.formatDisplayName(payload.spray.sprayer || {});
    return {
      eventId: payload.eventId,
      pending: payload.pending,
      showAmounts,
      stats: {
        totalSprayed: showAmounts ? payload.eventTotals.totalAmount : null,
        giversCount: undefined as number | undefined,
      },
      activity: {
        type: 'spray' as const,
        displayName,
        amount: showAmounts ? payload.spray.totalAmount : undefined,
        createdAt:
          typeof payload.spray.createdAt === 'string'
            ? payload.spray.createdAt
            : new Date(payload.spray.createdAt).toISOString(),
      },
      leaderboard: undefined as PublicLeaderboardEntry[] | undefined,
    };
  }

  private async buildSnapshot(event: {
    id: string;
    title: string;
    imageUrl: string | null;
    status: string;
    startsAt: Date;
    publicLeaderboardShowAmounts: boolean;
  }): Promise<PublicLeaderboardSnapshot> {
    const showAmounts = event.publicLeaderboardShowAmounts;
    const [leaderboardRaw, recentSprays] = await Promise.all([
      this.eventLeaderboardService.getEventLeaderboard(event.id),
      this.databaseService.spray.findMany({
        where: { eventId: event.id, status: SprayStatus.CONFIRMED },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          totalAmount: true,
          createdAt: true,
          sprayerWallet: {
            select: {
              customer: {
                select: {
                  user: {
                    select: {
                      firstName: true,
                      lastName: true,
                      username: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
    ]);

    const leaderboardData = leaderboardRaw as FullLeaderboardResult;
    const profileRows = await this.databaseService.user.findMany({
      where: {
        id: {
          in: (leaderboardData.leaderboard || []).map((e) => e.userId),
        },
      },
      select: { id: true, profilePicture: true },
    });

    const profileByUserId = new Map(profileRows.map((u) => [u.id, u.profilePicture]));
    const leaderboard = this.sanitizeLeaderboardForPublic(
      leaderboardData,
      showAmounts,
      profileByUserId,
    );

    const totalSprayed = (leaderboardData.leaderboard || []).reduce(
      (sum, entry) => sum.plus(new Decimal(entry.totalAmount || 0)),
      new Decimal(0),
    );

    const recentActivity: PublicActivityItem[] = recentSprays.map((spray) => ({
      type: 'spray' as const,
      displayName: this.formatDisplayName(spray.sprayerWallet.customer.user || {}),
      amount: showAmounts ? spray.totalAmount.toString() : undefined,
      createdAt: spray.createdAt.toISOString(),
    }));

    return {
      event: {
        id: event.id,
        title: event.title,
        imageUrl: event.imageUrl,
        status: event.status,
        startsAt: event.startsAt.toISOString(),
      },
      showAmounts,
      stats: {
        totalSprayed: showAmounts ? totalSprayed.toString() : null,
        giversCount: leaderboardData.totalParticipants ?? leaderboard.length,
      },
      leaderboard,
      recentActivity,
    };
  }

  private async requireHostEvent(eventId: string, userId: string) {
    const event = await this.databaseService.event.findFirst({
      where: { id: eventId, deletedAt: null },
      select: {
        id: true,
        hostUserId: true,
        publicLeaderboardEnabled: true,
        publicLeaderboardShowAmounts: true,
        publicLeaderboardToken: true,
      },
    });

    if (!event) {
      throw new NotFoundException(`Event with ID ${eventId} not found`);
    }
    if (event.hostUserId !== userId) {
      throw new ForbiddenException('Only the event host can manage the public leaderboard');
    }
    return event;
  }

  private toHostResponse(event: {
    publicLeaderboardEnabled: boolean;
    publicLeaderboardShowAmounts: boolean;
    publicLeaderboardToken: string | null;
  }) {
    const token = event.publicLeaderboardToken;
    return {
      enabled: event.publicLeaderboardEnabled,
      showAmounts: event.publicLeaderboardShowAmounts,
      token: event.publicLeaderboardEnabled ? token : token,
      shareUrl:
        event.publicLeaderboardEnabled && token ? this.buildShareUrl(token) : null,
    };
  }
}
