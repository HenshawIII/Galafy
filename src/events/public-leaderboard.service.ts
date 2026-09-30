import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { DatabaseService } from '../database/database.service.js';
import { CacheService } from '../cache/cache.service.js';
import { EventLeaderboardService } from './event-leaderboard.service.js';
import { LIVE_GATEWAY } from '../live/live.constants.js';
import { SprayStatus } from '../../generated/prisma/enums.js';
import { Decimal } from '@prisma/client/runtime/library';
import { UpdatePublicLeaderboardDto } from './dto/public-leaderboard.dto.js';

export type PublicPrivacySettings = {
  showNames: boolean;
  showAmounts: boolean;
  showTotalAmount: boolean;
  showParticipantCount: boolean;
  allowAnonymous: boolean;
  topN: number | null;
};

export type PublicLeaderboardEntry = {
  rank: number;
  displayName: string;
  profilePicture: string | null;
  totalAmount?: string;
  sprayCount: number;
  isAnonymous?: boolean;
};

export type PublicActivityItem = {
  type: 'spray' | 'rank_up';
  displayName: string;
  amount?: string;
  rank?: number;
  createdAt: string;
  isAnonymous?: boolean;
};

export type PublicLeaderboardSnapshot = {
  event: {
    id: string;
    title: string;
    imageUrl: string | null;
    status: string;
    startsAt: string;
  };
  privacy: PublicPrivacySettings;
  /** @deprecated use privacy.showAmounts */
  showAmounts: boolean;
  stats: {
    totalSprayed: string | null;
    giversCount: number | null;
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

type HostEventRow = {
  id: string;
  hostUserId: string;
  publicLeaderboardEnabled: boolean;
  publicLeaderboardToken: string | null;
  publicLeaderboardShowAmounts: boolean;
  publicLeaderboardShowNames: boolean;
  publicLeaderboardShowTotalAmount: boolean;
  publicLeaderboardShowParticipantCount: boolean;
  publicLeaderboardAllowAnonymous: boolean;
  publicLeaderboardTopN: number | null;
};

type PublicEventRow = {
  id: string;
  title: string;
  imageUrl: string | null;
  status: string;
  startsAt: Date;
  publicLeaderboardShowAmounts: boolean;
  publicLeaderboardShowNames: boolean;
  publicLeaderboardShowTotalAmount: boolean;
  publicLeaderboardShowParticipantCount: boolean;
  publicLeaderboardAllowAnonymous: boolean;
  publicLeaderboardTopN: number | null;
};

const HOST_PUBLIC_LB_SELECT = {
  id: true,
  hostUserId: true,
  publicLeaderboardEnabled: true,
  publicLeaderboardToken: true,
  publicLeaderboardShowAmounts: true,
  publicLeaderboardShowNames: true,
  publicLeaderboardShowTotalAmount: true,
  publicLeaderboardShowParticipantCount: true,
  publicLeaderboardAllowAnonymous: true,
  publicLeaderboardTopN: true,
} as const;

@Injectable()
export class PublicLeaderboardService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly eventLeaderboardService: EventLeaderboardService,
    private readonly cacheService: CacheService,
    @Inject(LIVE_GATEWAY)
    private readonly liveGateway: {
      revokePublicLeaderboardViewers(eventId: string): Promise<void>;
      emitPublicLeaderboardUpdate(eventId: string, snapshot: unknown): void;
    },
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

  privacyFromEvent(event: {
    publicLeaderboardShowAmounts: boolean;
    publicLeaderboardShowNames: boolean;
    publicLeaderboardShowTotalAmount: boolean;
    publicLeaderboardShowParticipantCount: boolean;
    publicLeaderboardAllowAnonymous: boolean;
    publicLeaderboardTopN: number | null;
  }): PublicPrivacySettings {
    return {
      showNames: event.publicLeaderboardShowNames,
      showAmounts: event.publicLeaderboardShowAmounts,
      showTotalAmount: event.publicLeaderboardShowTotalAmount,
      showParticipantCount: event.publicLeaderboardShowParticipantCount,
      allowAnonymous: event.publicLeaderboardAllowAnonymous,
      topN: event.publicLeaderboardTopN,
    };
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
    let revokedOrRotated = false;

    if (!dto.enabled) {
      token = null;
      revokedOrRotated = event.publicLeaderboardEnabled || !!event.publicLeaderboardToken;
    } else if (!token || dto.regenerate === true) {
      token = this.generateToken();
      revokedOrRotated = !!event.publicLeaderboardToken && event.publicLeaderboardToken !== token;
    }

    const privacyChanged =
      (dto.showAmounts !== undefined && dto.showAmounts !== event.publicLeaderboardShowAmounts) ||
      (dto.showNames !== undefined && dto.showNames !== event.publicLeaderboardShowNames) ||
      (dto.showTotalAmount !== undefined &&
        dto.showTotalAmount !== event.publicLeaderboardShowTotalAmount) ||
      (dto.showParticipantCount !== undefined &&
        dto.showParticipantCount !== event.publicLeaderboardShowParticipantCount) ||
      (dto.allowAnonymous !== undefined &&
        dto.allowAnonymous !== event.publicLeaderboardAllowAnonymous) ||
      (dto.topN !== undefined && dto.topN !== event.publicLeaderboardTopN);

    const updated = await this.databaseService.event.update({
      where: { id: eventId },
      data: {
        publicLeaderboardEnabled: dto.enabled,
        publicLeaderboardToken: token,
        publicLeaderboardShowAmounts:
          dto.showAmounts !== undefined ? dto.showAmounts : event.publicLeaderboardShowAmounts,
        publicLeaderboardShowNames:
          dto.showNames !== undefined ? dto.showNames : event.publicLeaderboardShowNames,
        publicLeaderboardShowTotalAmount:
          dto.showTotalAmount !== undefined
            ? dto.showTotalAmount
            : event.publicLeaderboardShowTotalAmount,
        publicLeaderboardShowParticipantCount:
          dto.showParticipantCount !== undefined
            ? dto.showParticipantCount
            : event.publicLeaderboardShowParticipantCount,
        publicLeaderboardAllowAnonymous:
          dto.allowAnonymous !== undefined
            ? dto.allowAnonymous
            : event.publicLeaderboardAllowAnonymous,
        publicLeaderboardTopN:
          dto.topN !== undefined ? dto.topN : event.publicLeaderboardTopN,
      },
      select: HOST_PUBLIC_LB_SELECT,
    });

    await this.bustPublicLeaderboardAccess(eventId, revokedOrRotated || !dto.enabled);

    // Privacy-only edits: push a fresh sanitized snapshot to connected public viewers.
    if (dto.enabled && privacyChanged && !revokedOrRotated) {
      await this.pushPublicSnapshot(eventId);
    }

    return this.toHostResponse(updated);
  }

  async regenerateHostPublicLeaderboard(eventId: string, userId: string) {
    const event = await this.requireHostEvent(eventId, userId);

    if (!event.publicLeaderboardEnabled) {
      throw new BadRequestException(
        'Public leaderboard is not enabled. Enable sharing first, or PUT with enabled=true and regenerate=true.',
      );
    }

    const token = this.generateToken();
    const updated = await this.databaseService.event.update({
      where: { id: eventId },
      data: { publicLeaderboardToken: token },
      select: HOST_PUBLIC_LB_SELECT,
    });

    await this.bustPublicLeaderboardAccess(eventId, true);

    return this.toHostResponse(updated);
  }

  private async bustPublicLeaderboardAccess(eventId: string, disconnectViewers: boolean) {
    await this.cacheService.invalidateEventCache(eventId);
    if (disconnectViewers) {
      await this.liveGateway.revokePublicLeaderboardViewers(eventId);
    }
  }

  private async pushPublicSnapshot(eventId: string) {
    const event = await this.databaseService.event.findFirst({
      where: { id: eventId, publicLeaderboardEnabled: true, deletedAt: null },
      select: { publicLeaderboardToken: true },
    });
    if (!event?.publicLeaderboardToken) return;
    const snapshot = await this.getSnapshotByToken(event.publicLeaderboardToken);
    this.liveGateway.emitPublicLeaderboardUpdate(eventId, snapshot);
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
        publicLeaderboardShowNames: true,
        publicLeaderboardShowTotalAmount: true,
        publicLeaderboardShowParticipantCount: true,
        publicLeaderboardAllowAnonymous: true,
        publicLeaderboardTopN: true,
      },
    });

    if (!event) {
      throw new NotFoundException('Public leaderboard not found');
    }

    return this.buildSnapshot(event);
  }

  async getEventPublicShareSettings(eventId: string): Promise<{
    enabled: boolean;
    privacy: PublicPrivacySettings;
  } | null> {
    const event = await this.databaseService.event.findFirst({
      where: { id: eventId, deletedAt: null },
      select: {
        publicLeaderboardEnabled: true,
        publicLeaderboardShowAmounts: true,
        publicLeaderboardShowNames: true,
        publicLeaderboardShowTotalAmount: true,
        publicLeaderboardShowParticipantCount: true,
        publicLeaderboardAllowAnonymous: true,
        publicLeaderboardTopN: true,
      },
    });
    if (!event || !event.publicLeaderboardEnabled) {
      return null;
    }
    return {
      enabled: true,
      privacy: this.privacyFromEvent(event),
    };
  }

  /**
   * Apply host privacy rules before any public serialization.
   */
  applyPrivacyToLeaderboard(
    fullLeaderboard: FullLeaderboardResult,
    privacy: PublicPrivacySettings,
    profileByUserId: Map<string, string | null>,
    visibilityByUserId: Map<string, { visibleAtEvents: boolean; showOnLeaderboard: boolean }>,
  ): PublicLeaderboardEntry[] {
    const rows = Array.isArray(fullLeaderboard?.leaderboard) ? fullLeaderboard.leaderboard : [];

    const filtered: PublicLeaderboardEntry[] = [];
    for (const entry of rows) {
      const visibility = visibilityByUserId.get(entry.userId) ?? {
        visibleAtEvents: true,
        showOnLeaderboard: entry.showOnLeaderboard ?? true,
      };

      if (!visibility.showOnLeaderboard) {
        continue;
      }

      const optedOut = visibility.visibleAtEvents === false;
      if (optedOut && !privacy.allowAnonymous) {
        continue;
      }

      const isAnonymous = !privacy.showNames || optedOut;
      const mapped: PublicLeaderboardEntry = {
        rank: 0,
        displayName: isAnonymous
          ? 'Anonymous'
          : this.formatDisplayName(entry),
        profilePicture: isAnonymous ? null : (profileByUserId.get(entry.userId) ?? null),
        sprayCount: entry.sprayCount,
        isAnonymous,
      };
      if (privacy.showAmounts) {
        mapped.totalAmount = entry.totalAmount;
      }
      filtered.push(mapped);
    }

    // Re-rank after privacy filtering, then apply Top N.
    let ranked = filtered.map((entry, index) => ({ ...entry, rank: index + 1 }));
    if (privacy.topN != null && privacy.topN > 0) {
      ranked = ranked.slice(0, privacy.topN);
    }
    return ranked;
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
          visibleAtEvents?: boolean | null;
          showOnLeaderboard?: boolean | null;
        } | null;
      };
      eventTotals: { totalAmount: string; totalCount: number };
      pending: boolean;
    },
    privacy: PublicPrivacySettings,
    giversCount?: number | null,
  ) {
    const sprayer = payload.spray.sprayer || {};
    const optedOut = sprayer.visibleAtEvents === false;
    const hiddenFromBoard = sprayer.showOnLeaderboard === false;

    if (hiddenFromBoard || (optedOut && !privacy.allowAnonymous)) {
      return {
        eventId: payload.eventId,
        pending: payload.pending,
        privacy,
        showAmounts: privacy.showAmounts,
        stats: {
          totalSprayed: privacy.showTotalAmount ? payload.eventTotals.totalAmount : null,
          giversCount: privacy.showParticipantCount ? giversCount ?? null : null,
        },
        activity: null as PublicActivityItem | null,
      };
    }

    const isAnonymous = !privacy.showNames || optedOut;
    return {
      eventId: payload.eventId,
      pending: payload.pending,
      privacy,
      showAmounts: privacy.showAmounts,
      stats: {
        totalSprayed: privacy.showTotalAmount ? payload.eventTotals.totalAmount : null,
        giversCount: privacy.showParticipantCount ? giversCount ?? null : null,
      },
      activity: {
        type: 'spray' as const,
        displayName: isAnonymous ? 'Anonymous' : this.formatDisplayName(sprayer),
        amount: privacy.showAmounts ? payload.spray.totalAmount : undefined,
        createdAt:
          typeof payload.spray.createdAt === 'string'
            ? payload.spray.createdAt
            : new Date(payload.spray.createdAt).toISOString(),
        isAnonymous,
      } as PublicActivityItem,
    };
  }

  private async buildSnapshot(event: PublicEventRow): Promise<PublicLeaderboardSnapshot> {
    const privacy = this.privacyFromEvent(event);
    const [leaderboardRaw, recentSprays] = await Promise.all([
      this.eventLeaderboardService.getEventLeaderboard(event.id),
      this.databaseService.spray.findMany({
        where: { eventId: event.id, status: SprayStatus.CONFIRMED },
        orderBy: { createdAt: 'desc' },
        take: 40,
        select: {
          totalAmount: true,
          createdAt: true,
          sprayerWallet: {
            select: {
              customer: {
                select: {
                  user: {
                    select: {
                      id: true,
                      firstName: true,
                      lastName: true,
                      username: true,
                      settings: {
                        select: {
                          visibleAtEvents: true,
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
      }),
    ]);

    const leaderboardData = leaderboardRaw as FullLeaderboardResult;
    const userIds = (leaderboardData.leaderboard || []).map((e) => e.userId);
    const profileRows = userIds.length
      ? await this.databaseService.user.findMany({
          where: { id: { in: userIds } },
          select: {
            id: true,
            profilePicture: true,
            settings: {
              select: {
                visibleAtEvents: true,
                showOnLeaderboard: true,
              },
            },
          },
        })
      : [];

    const profileByUserId = new Map(profileRows.map((u) => [u.id, u.profilePicture]));
    const visibilityByUserId = new Map(
      profileRows.map((u) => [
        u.id,
        {
          visibleAtEvents: u.settings?.visibleAtEvents ?? true,
          showOnLeaderboard: u.settings?.showOnLeaderboard ?? true,
        },
      ]),
    );

    const leaderboard = this.applyPrivacyToLeaderboard(
      leaderboardData,
      privacy,
      profileByUserId,
      visibilityByUserId,
    );

    const totalSprayed = (leaderboardData.leaderboard || []).reduce(
      (sum, entry) => sum.plus(new Decimal(entry.totalAmount || 0)),
      new Decimal(0),
    );

    const recentActivity: PublicActivityItem[] = [];
    for (const spray of recentSprays) {
      const user = spray.sprayerWallet.customer.user;
      if (!user) continue;
      const showOnLeaderboard = user.settings?.showOnLeaderboard ?? true;
      const visibleAtEvents = user.settings?.visibleAtEvents ?? true;
      if (!showOnLeaderboard) continue;
      if (!visibleAtEvents && !privacy.allowAnonymous) continue;

      const isAnonymous = !privacy.showNames || !visibleAtEvents;
      recentActivity.push({
        type: 'spray',
        displayName: isAnonymous ? 'Anonymous' : this.formatDisplayName(user),
        amount: privacy.showAmounts ? spray.totalAmount.toString() : undefined,
        createdAt: spray.createdAt.toISOString(),
        isAnonymous,
      });
      if (recentActivity.length >= 20) break;
    }

    return {
      event: {
        id: event.id,
        title: event.title,
        imageUrl: event.imageUrl,
        status: event.status,
        startsAt: event.startsAt.toISOString(),
      },
      privacy,
      showAmounts: privacy.showAmounts,
      stats: {
        totalSprayed: privacy.showTotalAmount ? totalSprayed.toString() : null,
        giversCount: privacy.showParticipantCount ? leaderboard.length : null,
      },
      leaderboard,
      recentActivity,
    };
  }

  private async requireHostEvent(eventId: string, userId: string): Promise<HostEventRow> {
    const event = await this.databaseService.event.findFirst({
      where: { id: eventId, deletedAt: null },
      select: HOST_PUBLIC_LB_SELECT,
    });

    if (!event) {
      throw new NotFoundException(`Event with ID ${eventId} not found`);
    }
    if (event.hostUserId !== userId) {
      throw new ForbiddenException('Only the event host can manage the public leaderboard');
    }
    return event;
  }

  private toHostResponse(event: Omit<HostEventRow, 'hostUserId' | 'id'> & { id?: string }) {
    const privacy = this.privacyFromEvent(event);
    const token = event.publicLeaderboardEnabled ? event.publicLeaderboardToken : null;
    return {
      enabled: event.publicLeaderboardEnabled,
      revoked: !event.publicLeaderboardEnabled,
      token,
      shareUrl: token ? this.buildShareUrl(token) : null,
      ...privacy,
      // Backward-compatible aliases
      showAmounts: privacy.showAmounts,
      privacy,
    };
  }
}
