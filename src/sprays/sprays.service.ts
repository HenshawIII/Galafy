import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { CreateSprayDto } from './dto/create-spray.dto.js';
import { LiveGateway } from '../live/live.gateway.js';
import { ProviderService } from '../provider/provider.service.js';
import { CacheService } from '../cache/cache.service.js';
import { EventsService } from '../events/events.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { EventStatus } from '../../generated/prisma/enums.js';
import { EventRole } from '../events/dto/event-enums.js';
import { TransactionType, TransactionDirection, TransactionStatus } from '../../generated/prisma/enums.js';
import { Decimal } from '@prisma/client/runtime/library';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { WalletRiskService } from '../common/services/wallet-risk.service.js';
import { SprayAnomalyService } from './services/spray-anomaly.service.js';
import { AmlLoggingService } from '../common/services/aml-logging.service.js';

export interface SprayResult {
  spray: any;
  sprayerBalance: Decimal;
  receiverBalance: Decimal;
  eventTotals: {
    totalAmount: Decimal;
    totalCount: number;
  };
}

@Injectable()
export class SpraysService {
  private readonly logger = new Logger(SpraysService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly liveGateway: LiveGateway,
    private readonly providerService: ProviderService,
    private readonly cacheService: CacheService,
    private readonly eventsService: EventsService,
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService,
    private readonly walletRiskService: WalletRiskService,
    private readonly sprayAnomalyService: SprayAnomalyService,
    private readonly amlLoggingService: AmlLoggingService,
  ) {}

  /**
   * Create a spray within an event
   * Handles idempotency, validation, atomic wallet operations, and real-time events
   */
  async createSpray(
    eventId: string,
    userId: string,
    createSprayDto: CreateSprayDto,
    idempotencyKey: string,
  ): Promise<SprayResult> {
    // Validate idempotency key format
    if (!idempotencyKey || typeof idempotencyKey !== 'string') {
      throw new BadRequestException('Idempotency-Key header is required');
    }

    // Check idempotency: if transaction with this reference exists, return previous result
    const existingTransaction = await this.databaseService.transaction.findUnique({
      where: { reference: idempotencyKey },
      include: {
        spray: {
          include: {
            sprayerWallet: {
              select: { id: true, availableBalance: true },
            },
            receiverWallet: {
              select: { id: true, availableBalance: true },
            },
          },
        },
      },
    });

    if (existingTransaction && existingTransaction.spray) {
      this.logger.log(`Idempotent request detected for key: ${idempotencyKey}`);
      const spray = existingTransaction.spray;

      // Compute event totals
      const eventTotals = await this.computeEventTotals(eventId);

      return {
        spray,
        sprayerBalance: spray.sprayerWallet.availableBalance,
        receiverBalance: spray.receiverWallet.availableBalance,
        eventTotals,
      };
    }

    // Validate event exists and is LIVE
    const event = await this.databaseService.event.findUnique({
      where: { id: eventId },
      select: { id: true, status: true, minSprayAmount: true, title: true },
    });

    if (!event) {
      throw new NotFoundException(`Event with ID ${eventId} not found`);
    }

    if (event.status !== EventStatus.LIVE) {
      throw new ForbiddenException(`Event is not LIVE. Current status: ${event.status}`);
    }

    // Validate amount
    const amount = new Decimal(createSprayDto.amount);
    if (amount.lte(0)) {
      throw new BadRequestException('Spray amount must be greater than 0');
    }

    if (event.minSprayAmount && amount.lt(event.minSprayAmount)) {
      throw new BadRequestException(
        `Spray amount must be at least ${event.minSprayAmount.toString()}`,
      );
    }

    // Get sprayer participant
    const sprayerParticipant = await this.databaseService.eventParticipant.findUnique({
      where: {
        eventId_userId: {
          eventId,
          userId,
        },
      },
      include: {
        wallet: true,
      },
    });

    if (!sprayerParticipant) {
      throw new ForbiddenException(
        `User ${userId} is not a participant in event ${eventId}`,
      );
    }

    // Get receiver participant (include role for notification check)
    let receiverParticipant;
    if (createSprayDto.receiverParticipantId) {
      receiverParticipant = await this.databaseService.eventParticipant.findUnique({
        where: { id: createSprayDto.receiverParticipantId },
        include: {
          wallet: true,
          user: {
            select: {
              id: true,
            },
          },
        },
      });

      if (!receiverParticipant || receiverParticipant.eventId !== eventId) {
        throw new NotFoundException(
          `Receiver participant ${createSprayDto.receiverParticipantId} not found in event ${eventId}`,
        );
      }
    } else if (createSprayDto.receiverUserId) {
      receiverParticipant = await this.databaseService.eventParticipant.findUnique({
        where: {
          eventId_userId: {
            eventId,
            userId: createSprayDto.receiverUserId,
          },
        },
        include: {
          wallet: true,
          user: {
            select: {
              id: true,
            },
          },
        },
      });

      if (!receiverParticipant) {
        throw new NotFoundException(
          `Receiver user ${createSprayDto.receiverUserId} is not a participant in event ${eventId}`,
        );
      }
    } else {
      throw new BadRequestException(
        'Either receiverUserId or receiverParticipantId must be provided',
      );
    }

    // Determine wallets
    let sprayerWallet = sprayerParticipant.wallet;
    if (!sprayerWallet) {
      // Fallback: get customer's default wallet
      const customer = await this.databaseService.customer.findUnique({
        where: { userId },
        include: {
          wallets: {
            where: { isDefault: true },
            take: 1,
          },
        },
      });

      if (!customer || !customer.wallets || customer.wallets.length === 0) {
        throw new NotFoundException(
          `No wallet found for sprayer. Please create a wallet first.`,
        );
      }

      sprayerWallet = customer.wallets[0];
    }

    let receiverWallet = receiverParticipant.wallet;
    if (!receiverWallet) {
      // Fallback: get receiver's default wallet
      const receiverCustomer = await this.databaseService.customer.findUnique({
        where: { userId: receiverParticipant.userId },
        include: {
          wallets: {
            where: { isDefault: true },
            take: 1,
          },
        },
      });

      if (!receiverCustomer || !receiverCustomer.wallets || receiverCustomer.wallets.length === 0) {
        throw new NotFoundException(
          `No wallet found for receiver. Please create a wallet first.`,
        );
      }

      receiverWallet = receiverCustomer.wallets[0];
    }

    // Ensure wallets have same currency
    if (sprayerWallet.currencyId !== receiverWallet.currencyId) {
      throw new BadRequestException(
        'Sprayer and receiver wallets must have the same currency',
      );
    }

    // Ensure wallets have virtual account numbers (required for provider transfer)
    if (!sprayerWallet.virtualAccountNumber) {
      throw new BadRequestException(
        'Sprayer wallet does not have a virtual account number. Please ensure the wallet is properly configured.',
      );
    }

    if (!receiverWallet.virtualAccountNumber) {
      throw new BadRequestException(
        'Receiver wallet does not have a virtual account number. Please ensure the wallet is properly configured.',
      );
    }

    // Lock wallet and check balance BEFORE calling provider
    // This prevents race conditions where multiple requests try to spend the same balance
    const lockedSprayerWallet = await this.databaseService.$transaction(
      async (tx: Prisma.TransactionClient) => {
        // Lock sprayer wallet row to prevent double spend
        await tx.$queryRaw`
          SELECT id FROM "Wallet" WHERE id = ${sprayerWallet.id} FOR UPDATE
        `;

        // Re-fetch sprayer wallet with lock to get latest balance
        const locked = await tx.wallet.findUnique({
          where: { id: sprayerWallet.id },
          select: { id: true, availableBalance: true, ledgerBalance: true, currencyId: true },
        });

        if (!locked) {
          throw new NotFoundException('Sprayer wallet not found');
        }

        // Verify sufficient balance
        if (locked.availableBalance.lt(amount)) {
          throw new BadRequestException('Insufficient balance');
        }

        // Check wallet freeze status (hard freeze blocks all transactions)
        const wallet = await tx.wallet.findUnique({
          where: { id: sprayerWallet.id },
          select: { riskStatus: true, riskScore: true },
        });

        if (wallet?.riskStatus === 'HARD_FREEZE') {
          throw new BadRequestException(
            `Wallet is hard frozen due to high risk score (${wallet.riskScore?.toString() || 'N/A'}). ` +
            `All transactions are blocked. Please contact support.`,
          );
        }

        return locked;
      },
      {
        timeout: 5000,
      },
    );

    // Generate group reference
    const groupReference = randomUUID();

    // Call provider service to execute the actual wallet-to-wallet transfer
    this.logger.log(
      `Calling provider service for wallet transfer: ${sprayerWallet.virtualAccountNumber} -> ${receiverWallet.virtualAccountNumber}`,
    );

    const providerResponse = await this.providerService.walletToWalletTransfer({
      fromWalletId: sprayerWallet.virtualAccountNumber,
      toWalletId: receiverWallet.virtualAccountNumber,
      amount: Number(amount),
      currencyId: sprayerWallet.currencyId,
      description: createSprayDto.note || `Spray in event ${event.title }, EventId: ${eventId}`,
      reference: idempotencyKey,
    });

    if (!providerResponse.success) {
      this.logger.error(
        `Provider transfer failed: ${providerResponse.message}`,
      );
      throw new BadRequestException(
        providerResponse.message || 'Transfer failed. Please try again.',
      );
    }

    this.logger.log(`Provider transfer successful: ${providerResponse.message}`);

    // After provider succeeds, create transaction records and spray record atomically
    const result = await this.databaseService.$transaction(
      async (tx: Prisma.TransactionClient) => {
        // Calculate new balances (optimistic update - will sync with provider later if needed)
        const newSprayerAvailableBalance = lockedSprayerWallet.availableBalance.minus(amount);
        const newSprayerLedgerBalance = lockedSprayerWallet.ledgerBalance.minus(amount);
        const newReceiverAvailableBalance = receiverWallet.availableBalance.plus(amount);
        const newReceiverLedgerBalance = receiverWallet.ledgerBalance.plus(amount);

        // Update wallets
        await Promise.all([
          tx.wallet.update({
            where: { id: sprayerWallet.id },
            data: {
              availableBalance: newSprayerAvailableBalance,
              ledgerBalance: newSprayerLedgerBalance,
            },
          }),
          tx.wallet.update({
            where: { id: receiverWallet.id },
            data: {
              availableBalance: newReceiverAvailableBalance,
              ledgerBalance: newReceiverLedgerBalance,
            },
          }),
        ]);

        // Create debit transaction
        const debitTransaction = await tx.transaction.create({
          data: {
            walletId: sprayerWallet.id,
            type: TransactionType.SPRAY,
            direction: TransactionDirection.DEBIT,
            status: TransactionStatus.SUCCESS,
            amount,
            currencyId: lockedSprayerWallet.currencyId,
            reference: idempotencyKey, // Use idempotency key as reference
            groupReference,
            narration: createSprayDto.note || `Spray in event ${event.title}, EventId: ${eventId}`,
            metadata: {
              eventId,
              receiverWalletId: receiverWallet.id,
              providerResponse: providerResponse.data,
            },
          },
        });

        // Create credit transaction
        const creditTransaction = await tx.transaction.create({
          data: {
            walletId: receiverWallet.id,
            type: TransactionType.SPRAY,
            direction: TransactionDirection.CREDIT,
            status: TransactionStatus.SUCCESS,
            amount,
            currencyId: receiverWallet.currencyId,
            reference: `SPRAY-CREDIT-${randomUUID()}`,
            groupReference,
            narration: createSprayDto.note || `Spray received in event ${event.title}, EventId: ${eventId}`,
            metadata: {
              eventId,
              sprayerWalletId: sprayerWallet.id,
              debitTransactionId: debitTransaction.id,
              providerResponse: providerResponse.data,
            },
          },
        });

        // Create Spray record
        const spray = await tx.spray.create({
          data: {
            eventId,
            sprayerWalletId: sprayerWallet.id,
            receiverWalletId: receiverWallet.id,
            transactionId: debitTransaction.id,
            transactionGroupReference: groupReference,
            totalAmount: amount,
            note: createSprayDto.note,
            metadata: {
              creditTransactionId: creditTransaction.id,
              providerResponse: providerResponse.data,
            },
          },
        });

        // Log spray transaction (event-based)
        this.logger.log(
          `💰 SPRAY TRANSACTION (Event): Amount=${amount.toString()}, ` +
          `EventId=${eventId}, EventTitle="${event.title}", ` +
          `From=${sprayerWallet.virtualAccountNumber || sprayerWallet.id}, ` +
          `To=${receiverWallet.virtualAccountNumber || receiverWallet.id}, ` +
          `DebitTxId=${debitTransaction.id}, CreditTxId=${creditTransaction.id}, ` +
          `SprayId=${spray.id}, GroupRef=${groupReference}, ` +
          `Reference=${idempotencyKey}, Note="${createSprayDto.note || 'N/A'}"`,
        );

        return {
          spray,
          sprayerBalance: newSprayerAvailableBalance,
          receiverBalance: newReceiverAvailableBalance,
        };
      },
      {
        timeout: 10000, // 10 seconds timeout
      },
    );

    // Recalculate risk scores for both wallets (outside transaction to avoid blocking)
    this.walletRiskService.updateWalletRiskScore(sprayerWallet.id).catch((error) => {
      this.logger.error(`Failed to update risk score for sprayer wallet: ${error.message}`);
    });
    this.walletRiskService.updateWalletRiskScore(receiverWallet.id).catch((error) => {
      this.logger.error(`Failed to update risk score for receiver wallet: ${error.message}`);
    });

    // Detect anomalies (async, non-blocking)
    const spray = result.spray;
    if (spray && spray.transactionId) {
      this.sprayAnomalyService
        .detectAnomalies(
          spray.id,
          spray.transactionId,
          sprayerWallet.id,
          receiverWallet.id,
          amount,
          eventId,
          spray.createdAt,
        )
        .catch((error) => {
          this.logger.error(`Failed to detect anomalies for spray ${spray.id}: ${error.message}`);
        });
    }

    // Send push notification to celebrant/performer immediately after spray creation (non-blocking)
    // This ensures real-time delivery without waiting for other operations
    if (
      receiverParticipant.role === EventRole.CELEBRANT ||
      receiverParticipant.role === EventRole.PERFORMER
    ) {
      // Fetch sprayer name asynchronously and send notification (fire and forget)
      this.databaseService.user
        .findUnique({
          where: { id: userId },
          select: {
            username: true,
            profilePicture: true,
          },
        })
        .then((sprayerUser) => {
          const sprayerName =
            sprayerUser?.username ||
            sprayerUser?.profilePicture ||
            'Someone';
          
          // Send notification asynchronously (non-blocking)
          return this.notificationsService.sendNotificationIfEnabled(
            receiverParticipant.userId,
            {
              notification: {
                title: 'You were sprayed!',
                body: `${sprayerName} sprayed you ${spray.totalAmount.toString()}`,
              },
              data: {
                type: 'SPRAY_RECEIVED',
                eventId: eventId,
                eventTitle: event.title,
                sprayId: spray.id,
                amount: spray.totalAmount.toString(),
                sprayerId: userId,
                sprayerName: sprayerName,
              },
            },
          );
        })
        .catch((notificationError: any) => {
          // Log error but don't fail the request - notification is optional
          this.logger.warn(
            `Failed to send spray notification: ${notificationError.message}`,
          );
        });
    }

    // Compute event totals
    const eventTotals = await this.computeEventTotals(eventId);

    // Fetch sprayer and receiver user details for the WebSocket event
    const sprayerUser = await this.databaseService.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        profilePicture: true,
      },
    });

    const receiverUser = await this.databaseService.user.findUnique({
      where: { id: receiverParticipant.userId },
      select: {
        id: true,
        username: true,
        profilePicture: true,
      },
    });

    // Emit WebSocket events AFTER transaction commits
    try {
      // Fetch sprays array first (we'll use it in multiple events)
      let formattedSprays: any[] = [];
      try {
        const eventWithSprays = await this.databaseService.event.findUnique({
          where: { id: eventId },
          include: {
            sprays: {
              include: {
                sprayerWallet: {
                  include: {
                    customer: {
                      include: {
                        user: {
                          select: {
                            id: true,
                            username: true,
                            profilePicture: true,
                          },
                        },
                      },
                    },
                  },
                },
                receiverWallet: {
                  include: {
                    customer: {
                      include: {
                        user: {
                          select: {
                            id: true,
                            username: true,
                            profilePicture: true,
                          },
                        },
                      },
                    },
                  },
                },
              },
              orderBy: { createdAt: 'desc' },
            },
          },
        });

        if (eventWithSprays?.sprays) {
          formattedSprays = eventWithSprays.sprays
            .filter((spray: any) => 
              spray.sprayerWallet?.customer?.user && 
              spray.receiverWallet?.customer?.user
            )
            .map((spray: any) => ({
              id: spray.id,
              totalAmount: spray.totalAmount.toString(),
              note: spray.note,
              createdAt: spray.createdAt,
              updatedAt: spray.updatedAt,
              sprayer: {
                id: spray.sprayerWallet.customer.user.id,
                username: spray.sprayerWallet.customer.user.username,
                profilePicture: spray.sprayerWallet.customer.user.profilePicture,
              },
              receiver: {
                id: spray.receiverWallet.customer.user.id,
                username: spray.receiverWallet.customer.user.username,
                profilePicture: spray.receiverWallet.customer.user.profilePicture,
              },
            }));
        }
      } catch (spraysError: any) {
        // Log error but don't fail the request - sprays fetch is optional
        this.logger.warn(`Failed to fetch sprays: ${spraysError.message}`);
      }

      // Emit to event room with full user details (now includes sprays array)
      this.liveGateway.emitSprayCreated(eventId, {
        eventId,
        eventName: event.title,
        spray: {
          id: result.spray.id,
          totalAmount: result.spray.totalAmount.toString(),
          note: result.spray.note,
          createdAt: result.spray.createdAt,
          sprayer: {
            id: sprayerUser?.id || userId,
            username: sprayerUser?.username || null,
            profilePicture: sprayerUser?.profilePicture || null,
          },
          receiver: {
            id: receiverUser?.id || receiverParticipant.userId,
            username: receiverUser?.username || null,
            profilePicture: receiverUser?.profilePicture || null,
          },
        },
        eventTotals: {
          totalAmount: eventTotals.totalAmount.toString(),
          totalCount: eventTotals.totalCount,
        },
        sprays: formattedSprays,
      });

      // Emit balance updates to sprayer and receiver
      this.liveGateway.emitBalanceUpdate(userId, {
        walletId: sprayerWallet.id,
        availableBalance: result.sprayerBalance.toString(),
        eventBalance: eventTotals.totalAmount.toString(),
      });

      this.liveGateway.emitBalanceUpdate(receiverParticipant.userId, {
        walletId: receiverWallet.id,
        availableBalance: result.receiverBalance.toString(),
        eventBalance: eventTotals.totalAmount.toString(),
      });

      // Fetch and emit updated leaderboard (now includes sprays array)
      try {
        const leaderboard = await this.eventsService.getEventLeaderboard(eventId);
        this.liveGateway.emitLeaderboardUpdate(eventId, {
          ...leaderboard,
          sprays: formattedSprays,
        });
      } catch (leaderboardError: any) {
        // Log error but don't fail the request - leaderboard is optional
        this.logger.warn(`Failed to emit leaderboard update: ${leaderboardError.message}`);
      }

      // Still emit separate sprays.updated event for consistency
      if (formattedSprays.length > 0) {
        this.liveGateway.emitSpraysUpdate(eventId, formattedSprays);
      }
    } catch (error: any) {
      // Log error but don't fail the request - spray was successful
      this.logger.error(`Failed to emit WebSocket events: ${error.message}`);
    }

    // Invalidate event leaderboard cache (new spray changes leaderboard)
    try {
      await this.cacheService.del(this.cacheService.getEventKey(eventId, 'leaderboard'));
    } catch (error: any) {
      // Log error but don't fail the request
      this.logger.warn(`Failed to invalidate leaderboard cache: ${error.message}`);
    }

    return {
      ...result,
      eventTotals,
    };
  }

  /**
   * Compute event totals (count and sum of sprays)
   */
  private async computeEventTotals(eventId: string): Promise<{
    totalAmount: Decimal;
    totalCount: number;
  }> {
    const sprays = await this.databaseService.spray.findMany({
      where: { eventId },
      select: { totalAmount: true },
    });

    const totalAmount = sprays.reduce(
      (sum, spray) => sum.plus(spray.totalAmount),
      new Decimal(0),
    );

    return {
      totalAmount,
      totalCount: sprays.length,
    };
  }
}

