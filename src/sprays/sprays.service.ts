import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { CreateSprayDto } from './dto/create-spray.dto.js';
import { LiveGateway } from '../live/live.gateway.js';
import { ProviderService } from '../provider/provider.service.js';
import { EventStatus } from '../../generated/prisma/enums.js';
import { TransactionType, TransactionDirection, TransactionStatus } from '../../generated/prisma/enums.js';
import { Decimal } from '@prisma/client/runtime/library';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';

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
      select: { id: true, status: true, minSprayAmount: true },
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

    // Get receiver participant
    let receiverParticipant;
    if (createSprayDto.receiverParticipantId) {
      receiverParticipant = await this.databaseService.eventParticipant.findUnique({
        where: { id: createSprayDto.receiverParticipantId },
        include: {
          wallet: true,
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
      description: createSprayDto.note || `Spray in event ${eventId}`,
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
            narration: createSprayDto.note || `Spray in event ${eventId}`,
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
            narration: createSprayDto.note || `Spray received in event ${eventId}`,
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

    // Compute event totals
    const eventTotals = await this.computeEventTotals(eventId);

    // Emit WebSocket events AFTER transaction commits
    try {
      // Emit to event room
      this.liveGateway.emitSprayCreated(eventId, {
        eventId,
        spray: {
          id: result.spray.id,
          amount: result.spray.totalAmount.toString(),
          note: result.spray.note,
          createdAt: result.spray.createdAt,
          sprayerWalletId: result.spray.sprayerWalletId,
          receiverWalletId: result.spray.receiverWalletId,
        },
        eventTotals: {
          totalAmount: eventTotals.totalAmount.toString(),
          totalCount: eventTotals.totalCount,
        },
      });

      // Emit balance updates to sprayer and receiver
      this.liveGateway.emitBalanceUpdate(userId, {
        walletId: sprayerWallet.id,
        availableBalance: result.sprayerBalance.toString(),
      });

      this.liveGateway.emitBalanceUpdate(receiverParticipant.userId, {
        walletId: receiverWallet.id,
        availableBalance: result.receiverBalance.toString(),
      });
    } catch (error: any) {
      // Log error but don't fail the request - spray was successful
      this.logger.error(`Failed to emit WebSocket events: ${error.message}`);
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

