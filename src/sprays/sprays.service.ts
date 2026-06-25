import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { CreateSprayDto } from './dto/create-spray.dto.js';
import { ProviderService } from '../provider/provider.service.js';
import { EventStatus, SprayStatus, EventRole } from '../../generated/prisma/enums.js';
import { TransactionType, TransactionDirection, TransactionStatus } from '../../generated/prisma/enums.js';
import { Decimal } from '@prisma/client/runtime/library';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { LiveGateway } from '../live/live.gateway.js';
import { DebitWalletMandateService } from '../common/debit-mandate/debit-wallet-mandate.service.js';
import { normalizeToKobo } from '../common/utils/money.util.js';
import { buildStableProviderRef } from '../common/utils/provider-transaction-reference.util.js';
import { TierLimitService } from '../common/services/tier-limit.service.js';
import { ProviderAccountStatusService } from '../common/provider-account-status/provider-account-status.service.js';

const DEFAULT_PROVIDER_BANK_CODE = '035';
const DEFAULT_PROVIDER_BANK_NAME = 'WEMA BANK';

export interface SprayResult {
  spray: any | null;
  sprayerBalance: Decimal;
  receiverBalance: Decimal;
  eventTotals: {
    totalAmount: Decimal;
    totalCount: number;
  };
  /** When true, funds move via provider; spray row exists but may still be PENDING_PROVIDER until callback. */
  pending?: boolean;
  transactionRef?: string;
  message?: string;
}

@Injectable()
export class SpraysService {
  private readonly logger = new Logger(SpraysService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly providerService: ProviderService,
    private readonly liveGateway: LiveGateway,
    private readonly debitWalletMandateService: DebitWalletMandateService,
    private readonly tierLimitService: TierLimitService,
    private readonly providerAccountStatusService: ProviderAccountStatusService,
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

    const transactionReference = buildStableProviderRef('SPRAY', idempotencyKey);

    // Check idempotency: if transaction with this reference exists, return previous result
    const existingTransaction = await this.databaseService.transaction.findUnique({
      where: { reference: transactionReference },
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
      const eventTotals = await this.computeEventTotals(eventId);

      if (spray.status === SprayStatus.CONFIRMED) {
        return {
          spray,
          sprayerBalance: spray.sprayerWallet.availableBalance,
          receiverBalance: spray.receiverWallet.availableBalance,
          eventTotals,
        };
      }

      if (spray.status === SprayStatus.PENDING_PROVIDER) {
        return {
          spray,
          sprayerBalance: spray.sprayerWallet.availableBalance,
          receiverBalance: spray.receiverWallet.availableBalance,
          eventTotals,
          pending: true,
          transactionRef: transactionReference,
          message: 'Spray transfer is still pending provider confirmation.',
        };
      }

      if (spray.status === SprayStatus.FAILED) {
        throw new BadRequestException(
          'Previous spray attempt with this idempotency key failed. Use a new Idempotency-Key to retry.',
        );
      }
    }

    if (existingTransaction && !existingTransaction.spray) {
      const st = existingTransaction.status;
      if (st === TransactionStatus.PENDING || st === TransactionStatus.PROCESSING) {
        const meta = existingTransaction.metadata as Record<string, unknown> | null;
        const sc = meta?.sprayCompletion as Record<string, unknown> | undefined;
        const rwId = typeof sc?.receiverWalletId === 'string' ? sc.receiverWalletId : null;
        if (rwId) {
          const [sw, rw] = await Promise.all([
            this.databaseService.wallet.findUnique({
              where: { id: existingTransaction.walletId },
              select: { availableBalance: true },
            }),
            this.databaseService.wallet.findUnique({
              where: { id: rwId },
              select: { availableBalance: true },
            }),
          ]);
          const eventTotals = await this.computeEventTotals(eventId);
          return {
            spray: null,
            sprayerBalance: sw!.availableBalance,
            receiverBalance: rw!.availableBalance,
            eventTotals,
            pending: true,
            transactionRef: transactionReference,
            message: 'Spray transfer is still pending provider confirmation.',
          };
        }
      }
      if (st === TransactionStatus.FAILED) {
        throw new BadRequestException(
          'Previous spray attempt with this idempotency key failed. Use a new Idempotency-Key to retry.',
        );
      }
    }

    // Validate event exists and is LIVE
    const event = await this.databaseService.event.findFirst({
      where: { id: eventId, deletedAt: null },
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
      throw new BadRequestException(`Spray amount must be at least ${event.minSprayAmount.toString()}`);
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
      throw new ForbiddenException(`User ${userId} is not a participant in event ${eventId}`);
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
      throw new BadRequestException('Either receiverUserId or receiverParticipantId must be provided');
    }

    if (receiverParticipant.role !== EventRole.HOST) {
      throw new BadRequestException('Sprays can only be sent to the event host');
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
        throw new NotFoundException(`No wallet found for sprayer. Please create a wallet first.`);
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
        throw new NotFoundException(`No wallet found for receiver. Please create a wallet first.`);
      }

      receiverWallet = receiverCustomer.wallets[0];
    }

    // Ensure wallets have same currency
    if (sprayerWallet.currencyId !== receiverWallet.currencyId) {
      throw new BadRequestException('Sprayer and receiver wallets must have the same currency');
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

    const receiverBankCode = receiverWallet.virtualBankCode?.trim() || DEFAULT_PROVIDER_BANK_CODE;
    const receiverBankName = receiverWallet.virtualBankName?.trim() || DEFAULT_PROVIDER_BANK_NAME;

    const receiverCustomer = await this.databaseService.customer.findUnique({
      where: { id: receiverWallet.customerId },
      select: { firstName: true, lastName: true },
    });
    const destinationAccountName =
      [receiverCustomer?.firstName, receiverCustomer?.lastName].filter(Boolean).join(' ').trim() || 'Receiver';

    const groupReference = randomUUID();
    const amountKobo = normalizeToKobo(createSprayDto.amount);
    const amountNormalized = amountKobo.toFixed(2);
    const { securityInfo, securityInfoHash } = this.debitWalletMandateService.generateEventSprayMandate({
      transactionReference,
      eventId,
      sprayerWalletId: sprayerWallet.id,
      receiverWalletId: receiverWallet.id,
      amountNormalized,
      receiverVirtualAccount: receiverWallet.virtualAccountNumber,
      receiverBankCode,
    });
    const narration = createSprayDto.note || `Spray in event ${event.title}, EventId: ${eventId}`;

    await this.tierLimitService.assertDailySpendAllowed(sprayerWallet.customerId, amountKobo);
    await this.providerAccountStatusService.assertProviderAllowsOutbound(sprayerWallet.customerId);
    const sprayerCustomer = await this.tierLimitService.getCustomerForLimits(sprayerWallet.customerId);
    this.tierLimitService.assertInternalOutboundAllowed(sprayerCustomer);

    await this.databaseService.$transaction(
      async (tx: Prisma.TransactionClient) => {
        await tx.$queryRaw`
          SELECT id FROM "Wallet" WHERE id = ${sprayerWallet.id} FOR UPDATE
        `;

        const lockedSprayer = await tx.wallet.findUnique({
          where: { id: sprayerWallet.id },
          select: {
            id: true,
            availableBalance: true,
            ledgerBalance: true,
            currencyId: true,
            riskStatus: true,
            riskScore: true,
          },
        });

        if (!lockedSprayer) {
          throw new NotFoundException('Sprayer wallet not found');
        }

        if (lockedSprayer.availableBalance.lt(amountKobo)) {
          throw new BadRequestException('Insufficient balance');
        }

        if (lockedSprayer.riskStatus === 'HARD_FREEZE') {
          throw new BadRequestException(
            `Wallet is hard frozen due to high risk score (${lockedSprayer.riskScore?.toString() || 'N/A'}). ` +
              `All transactions are blocked. Please contact support.`,
          );
        }

        const createdTxn = await tx.transaction.create({
          data: {
            walletId: sprayerWallet.id,
            type: TransactionType.SPRAY,
            direction: TransactionDirection.DEBIT,
            status: TransactionStatus.PENDING,
            amount: amountKobo,
            currencyId: lockedSprayer.currencyId,
            reference: transactionReference,
            groupReference,
            securityInfoHash,
            destinationAccountNumber: receiverWallet.virtualAccountNumber,
            destinationAccountName,
            narration,
            metadata: {
              eventSpray: true,
              walletToWalletSpray: true,
              sprayCompletion: {
                eventId,
                receiverWalletId: receiverWallet.id,
                note: createSprayDto.note ?? null,
                sprayerUserId: userId,
                receiverUserId: receiverParticipant.userId,
                receiverRole: EventRole.HOST,
                eventTitle: event.title,
              },
            },
          },
        });

        await tx.spray.create({
          data: {
            eventId,
            sprayerWalletId: sprayerWallet.id,
            receiverWalletId: receiverWallet.id,
            transactionId: createdTxn.id,
            transactionGroupReference: groupReference,
            totalAmount: amountKobo,
            note: createSprayDto.note ?? null,
            status: SprayStatus.PENDING_PROVIDER,
            metadata: { pendingProvider: true },
          },
        });
      },
      { timeout: 10000 },
    );

    const sprayWithWallets = await this.databaseService.spray.findFirst({
      where: { transaction: { reference: transactionReference } },
      include: {
        sprayerWallet: { select: { id: true, availableBalance: true } },
        receiverWallet: { select: { id: true, availableBalance: true } },
      },
    });

    const [swAfter, rwAfter] = await Promise.all([
      this.databaseService.wallet.findUnique({
        where: { id: sprayerWallet.id },
        select: { availableBalance: true },
      }),
      this.databaseService.wallet.findUnique({
        where: { id: receiverWallet.id },
        select: { availableBalance: true },
      }),
    ]);

    const eventTotals = await this.computeEventTotals(eventId);

    if (sprayWithWallets) {
      this.liveGateway.emitSprayCreated(eventId, {
        eventId,
        spray: sprayWithWallets,
        sprayerBalance: swAfter!.availableBalance,
        receiverBalance: rwAfter!.availableBalance,
        eventTotals: {
          totalAmount: eventTotals.totalAmount.toString(),
          totalCount: eventTotals.totalCount,
        },
        pending: true,
      });
    }

    try {
      await this.providerService.processClientTransfer({
        securityInfo,
        amount: amountKobo.toNumber(),
        destinationBankCode: receiverBankCode,
        destinationBankName: receiverBankName,
        destinationAccountNumber: receiverWallet.virtualAccountNumber,
        destinationAccountName,
        sourceAccountNumber: sprayerWallet.virtualAccountNumber,
        narration,
        transactionReference,
        useCustomNarration: true,
      });
    } catch (error: any) {
      await this.databaseService.transaction.update({
        where: { reference: transactionReference },
        data: {
          status: TransactionStatus.FAILED,
          providerStatus: 'FAILED',
          providerCallbackReceivedAt: new Date(),
        },
      });
      await this.databaseService.spray.updateMany({
        where: { transaction: { reference: transactionReference } },
        data: { status: SprayStatus.FAILED },
      });
      throw error;
    }

    await this.tierLimitService.recordDailySpend(sprayerWallet.customerId, amountKobo);

    this.logger.log(
      `💰 SPRAY (provider): Amount=${amountKobo.toString()}, EventId=${eventId}, Ref=${transactionReference} — pending callback`,
    );

    return {
      spray: sprayWithWallets,
      sprayerBalance: swAfter!.availableBalance,
      receiverBalance: rwAfter!.availableBalance,
      eventTotals,
      pending: true,
      transactionRef: transactionReference,
      message: 'Spray submitted to the payment partner. Balances and live event data update when the transfer succeeds.',
    };
  }

  /**
   * Compute event totals (count and sum of confirmed sprays only)
   */
  private async computeEventTotals(eventId: string): Promise<{
    totalAmount: Decimal;
    totalCount: number;
  }> {
    const sprays = await this.databaseService.spray.findMany({
      where: { eventId, status: SprayStatus.CONFIRMED },
      select: { totalAmount: true },
    });

    const totalAmount = sprays.reduce((sum, spray) => sum.plus(spray.totalAmount), new Decimal(0));

    return {
      totalAmount,
      totalCount: sprays.length,
    };
  }
}
