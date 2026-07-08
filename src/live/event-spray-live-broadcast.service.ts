import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { CacheService } from '../cache/cache.service.js';
import { LiveGateway } from './live.gateway.js';
import { EventLeaderboardService } from '../events/event-leaderboard.service.js';
import { SprayStatus } from '../../generated/prisma/enums.js';
import { Decimal } from '@prisma/client/runtime/library';
import {
  formatSprayForLive,
  SPRAY_LIVE_INCLUDE,
} from '../common/utils/spray-live-payload.util.js';

export type EventSprayCreatedPayload = {
  eventId: string;
  spray: ReturnType<typeof formatSprayForLive>;
  sprayerBalance: string;
  receiverBalance: string;
  eventTotals: {
    totalAmount: string;
    totalCount: number;
  };
  pending: boolean;
};

@Injectable()
export class EventSprayLiveBroadcastService {
  private readonly logger = new Logger(EventSprayLiveBroadcastService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly cacheService: CacheService,
    private readonly liveGateway: LiveGateway,
    private readonly eventLeaderboardService: EventLeaderboardService,
  ) {}

  async broadcastSprayCreated(eventId: string, sprayId: string, pending: boolean): Promise<void> {
    const built = await this.buildPayloadWithSpray(eventId, sprayId, pending);
    if (!built) {
      return;
    }

    this.liveGateway.emitSprayCreated(eventId, built.payload);
  }

  async broadcastSprayConfirmed(eventId: string, sprayId: string): Promise<void> {
    await this.cacheService.invalidateEventCache(eventId);

    const built = await this.buildPayloadWithSpray(eventId, sprayId, false);
    if (!built) {
      return;
    }

    this.liveGateway.emitSprayCreated(eventId, built.payload);
    this.emitConfirmedBalanceUpdates(built.spray, built.payload);

    try {
      const leaderboard = await this.eventLeaderboardService.getEventLeaderboard(eventId);
      this.liveGateway.emitLeaderboardUpdate(eventId, leaderboard);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to broadcast leaderboard update for event ${eventId}: ${message}`);
    }
  }

  private emitConfirmedBalanceUpdates(
    spray: {
      sprayerWalletId: string;
      receiverWalletId: string;
      sprayerWallet: { customer: { user: { id: string } } };
      receiverWallet: { customer: { user: { id: string } } };
    },
    payload: EventSprayCreatedPayload,
  ): void {
    const eventBalance = payload.eventTotals.totalAmount;

    this.liveGateway.emitBalanceUpdate(spray.sprayerWallet.customer.user.id, {
      walletId: spray.sprayerWalletId,
      availableBalance: payload.sprayerBalance,
      eventBalance,
    });

    this.liveGateway.emitBalanceUpdate(spray.receiverWallet.customer.user.id, {
      walletId: spray.receiverWalletId,
      availableBalance: payload.receiverBalance,
      eventBalance,
    });
  }

  private async buildPayloadWithSpray(
    eventId: string,
    sprayId: string,
    pending: boolean,
  ): Promise<{
    payload: EventSprayCreatedPayload;
    spray: {
      sprayerWalletId: string;
      receiverWalletId: string;
      sprayerWallet: { customer: { user: { id: string } } };
      receiverWallet: { customer: { user: { id: string } } };
    };
  } | null> {
    const spray = await this.databaseService.spray.findUnique({
      where: { id: sprayId },
      include: SPRAY_LIVE_INCLUDE,
    });

    if (!spray || spray.eventId !== eventId) {
      this.logger.warn(`Spray ${sprayId} not found for event ${eventId} live broadcast`);
      return null;
    }

    if (!spray.sprayerWallet?.customer?.user || !spray.receiverWallet?.customer?.user) {
      this.logger.warn(`Spray ${sprayId} missing sprayer/receiver user for live broadcast`);
      return null;
    }

    const [sprayerWallet, receiverWallet] = await Promise.all([
      this.databaseService.wallet.findUnique({
        where: { id: spray.sprayerWalletId },
        select: { availableBalance: true },
      }),
      this.databaseService.wallet.findUnique({
        where: { id: spray.receiverWalletId },
        select: { availableBalance: true },
      }),
    ]);

    const eventTotals = await this.computeEventTotals(eventId);

    return {
      spray: {
        sprayerWalletId: spray.sprayerWalletId,
        receiverWalletId: spray.receiverWalletId,
        sprayerWallet: { customer: { user: { id: spray.sprayerWallet.customer.user.id } } },
        receiverWallet: { customer: { user: { id: spray.receiverWallet.customer.user.id } } },
      },
      payload: {
        eventId,
        spray: formatSprayForLive(spray),
        sprayerBalance: sprayerWallet?.availableBalance.toString() ?? '0',
        receiverBalance: receiverWallet?.availableBalance.toString() ?? '0',
        eventTotals: {
          totalAmount: eventTotals.totalAmount.toString(),
          totalCount: eventTotals.totalCount,
        },
        pending,
      },
    };
  }

  private async computeEventTotals(eventId: string): Promise<{
    totalAmount: Decimal;
    totalCount: number;
  }> {
    const sprays = await this.databaseService.spray.findMany({
      where: { eventId, status: SprayStatus.CONFIRMED },
      select: { totalAmount: true },
    });

    const totalAmount = sprays.reduce((sum, row) => sum.plus(row.totalAmount), new Decimal(0));

    return {
      totalAmount,
      totalCount: sprays.length,
    };
  }
}
