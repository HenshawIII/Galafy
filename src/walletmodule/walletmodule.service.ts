import { Injectable, NotFoundException, BadRequestException, Logger, UnauthorizedException } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { DatabaseService } from '../database/database.service.js';
import { ProviderService } from '../provider/provider.service.js';
import { CacheService } from '../cache/cache.service.js';
import {
  WalletToWalletTransferDto,
  InitiateWalletToWalletTransferDto,
  UpdateBankAccountDto,
} from './dto/index.js';
import { InitiatePayoutDto } from './dto/payout-security.dto.js';
import { PayoutSecurityService } from './services/payout-security.service.js';
import { KycTier } from '../users/dto/create-user-dto.js';
import { Decimal } from '@prisma/client/runtime/library';
import { Prisma } from '@prisma/client';
import { TransactionType, TransactionDirection, TransactionStatus } from '../../generated/prisma/enums.js';
import { normalizeToKobo, toDisplayAmount } from '../common/utils/money.util.js';
import { calculatePayoutFee } from '../common/utils/fee.util.js';
import { OrganizationWalletService } from '../common/services/organization-wallet.service.js';
import { WalletRiskService } from '../common/services/wallet-risk.service.js';
import { AmlLoggingService } from '../common/services/aml-logging.service.js';
import { EmailService } from '../users/email.service.js';
import { ConfigService } from '../config/config.service.js';
import { WithdrawalLimitService } from './services/withdrawal-limit.service.js';
import { ForbiddenException, GoneException } from '@nestjs/common';

@Injectable()
export class WalletmoduleService {
  private readonly logger = new Logger(WalletmoduleService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly providerService: ProviderService,
    private readonly payoutSecurityService: PayoutSecurityService,
    private readonly cacheService: CacheService,
    private readonly organizationWalletService: OrganizationWalletService,
    private readonly walletRiskService: WalletRiskService,
    private readonly amlLoggingService: AmlLoggingService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
    private readonly withdrawalLimitService: WithdrawalLimitService,
  ) {}

  /**
   * Get wallet by ID
   */
  async getWalletById(walletId: string) {
    const wallet = await this.databaseService.wallet.findUnique({
      where: { id: walletId },
      include: {
        customer: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
      },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    return wallet;
  }

  /**
   * Get wallet by account number
   */
  async getWalletByAccountNumber(accountNumber: string) {
    // First try to find in our database
    const wallet = await this.databaseService.wallet.findFirst({
      where: { virtualAccountNumber: accountNumber },
      include: {
        customer: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
      },
    });

    if (wallet) {
      return wallet;
    }

    throw new NotFoundException('Wallet not found');
  }

  /**
   * Get all wallets for a customer by userId
   */
  async getCustomerWalletsByUserId(userId: string) {
    // Find customer by userId
    const customer = await this.databaseService.customer.findUnique({
      where: { userId },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found for this user');
    }

    const wallet = await this.databaseService.wallet.findFirst({
      where: { customerId: customer.id },
      include: {
        customer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found for this customer');
    }

    return wallet;
  }

  /**
   * @deprecated Wallet-to-wallet transfers go through the provider (ProcessClientTransfer). Use
   * `initiateWalletToWalletTransfer` + `confirmWalletToWalletTransfer` (OTP, PIN, callbacks).
   */
  walletToWalletTransfer(_transferDto: WalletToWalletTransferDto): never {
    throw new GoneException(
      'Direct wallet-to-wallet transfer is disabled. Use POST /wallets/transfer/wallet-to-wallet/initiate ' +
        'then POST /wallets/transfer/wallet-to-wallet/confirm (same provider flow as payouts).',
    );
  }

  /**
   * Wallet-to-wallet — step 1: validate, store pending payload, send OTP (same pattern as payout).
   */
  async initiateWalletToWalletTransfer(userId: string, dto: InitiateWalletToWalletTransferDto) {
    const fromWallet = await this.databaseService.wallet.findFirst({
      where: { virtualAccountNumber: dto.fromWalletId },
      include: { customer: { include: { user: true } } },
    });

    if (!fromWallet) {
      throw new NotFoundException('Source wallet not found');
    }
    if (fromWallet.customer.userId !== userId) {
      throw new UnauthorizedException('You do not have access to this wallet');
    }
    if (!fromWallet.virtualAccountNumber) {
      throw new BadRequestException('Source wallet does not have a virtual account number');
    }

    const toWallet = await this.databaseService.wallet.findFirst({
      where: { virtualAccountNumber: dto.toWalletId },
      include: { customer: true },
    });

    if (!toWallet) {
      throw new NotFoundException('Destination wallet not found');
    }
    if (!toWallet.virtualAccountNumber) {
      throw new BadRequestException('Destination wallet does not have a virtual account number');
    }
    if (fromWallet.id === toWallet.id) {
      throw new BadRequestException('Source and destination wallet must differ');
    }
    if (!toWallet.virtualBankCode?.trim()) {
      throw new BadRequestException(
        'Destination wallet is missing provider bank routing (virtualBankCode). It cannot receive a provider transfer yet.',
      );
    }

    const amount = normalizeToKobo(dto.amount);
    if (fromWallet.availableBalance.lt(amount)) {
      throw new BadRequestException('Insufficient balance');
    }

    await this.walletRiskService.checkWalletFreezeStatus(fromWallet.id, true);

    if (fromWallet.customer.isAmlRestricted) {
      throw new ForbiddenException('User account is restricted due to AML compliance. Contact support.');
    }
    if (fromWallet.customer.tier === KycTier.Tier_0 || fromWallet.customer.tier === KycTier.Tier_1) {
      throw new ForbiddenException(
        'Transfers are only available for Tier 2 and Tier 3 users. Please complete your KYC verification to upgrade your tier.',
      );
    }

    const transactionReference = dto.transactionReference?.trim() || `TXN-${randomUUID()}`;
    const destinationAccountName =
      toWallet.name ||
      [toWallet.customer.firstName, toWallet.customer.lastName].filter(Boolean).join(' ').trim() ||
      'Unknown';

    const pending = {
      kind: 'walletToWallet' as const,
      fromWalletId: dto.fromWalletId,
      toWalletId: dto.toWalletId,
      amount: amount.toString(),
      description: dto.description,
      transactionReference,
      securityInfo: dto.securityInfo,
      currencyId: dto.currencyId || fromWallet.currencyId || 'fd5e474d-bb42-4db1-ab74-e8d2a01047e9',
      destinationBankCode: toWallet.virtualBankCode.trim(),
      destinationBankName: (toWallet.virtualBankName || 'Unknown').trim() || 'Unknown',
      destinationAccountName,
      walletId: fromWallet.id,
      toWalletInternalId: toWallet.id,
    };

    await this.payoutSecurityService.storePendingPayout(userId, pending);
    await this.payoutSecurityService.generateAndSendOtp(userId);

    return {
      success: true,
      message: 'OTP sent to your email. Confirm the transfer with the OTP and your PIN.',
      expiresIn: '10 minutes',
    };
  }

  /**
   * Wallet-to-wallet — step 2: OTP + PIN, then ProcessClientTransfer (provider debits; callbacks settle balances).
   */
  async confirmWalletToWalletTransfer(userId: string, otp: string, pin: string) {
    await this.payoutSecurityService.verifyOtp(userId, otp);

    const isPinValid = await this.payoutSecurityService.verifyPayoutPin(userId, pin);
    if (!isPinValid) {
      throw new UnauthorizedException('Invalid PIN');
    }

    const peek = await this.payoutSecurityService.peekPendingPayout(userId);
    if (!peek || peek.kind !== 'walletToWallet') {
      throw new BadRequestException(
        'No pending wallet-to-wallet transfer. Please initiate a wallet transfer first.',
      );
    }

    const pending = await this.payoutSecurityService.getAndClearPendingPayout(userId);
    if (!pending || pending.kind !== 'walletToWallet') {
      throw new BadRequestException(
        'No pending wallet-to-wallet transfer. Please initiate a wallet transfer first.',
      );
    }

    if (typeof pending.securityInfo !== 'string' || pending.securityInfo.trim() === '') {
      throw new BadRequestException(
        'Transfer requires securityInfo from the client. Please initiate the transfer again from the current app version.',
      );
    }

    const amount = normalizeToKobo(pending.amount as string | number);
    const transactionReference: string = pending.transactionReference || `TXN-${randomUUID()}`;
    const securityInfo = pending.securityInfo as string;
    const securityInfoHash = createHash('sha256').update(securityInfo).digest('hex');
    const narration =
      (pending.description as string) || `Wallet transfer to ${pending.toWalletId as string}`;

    const fromWallet = await this.databaseService.wallet.findFirst({
      where: { virtualAccountNumber: pending.fromWalletId as string },
      include: { customer: { include: { user: true } } },
    });
    const toWallet = await this.databaseService.wallet.findFirst({
      where: { virtualAccountNumber: pending.toWalletId as string },
    });

    if (!fromWallet || !toWallet) {
      throw new NotFoundException('Source or destination wallet not found');
    }
    if (fromWallet.customer.userId !== userId) {
      throw new UnauthorizedException('You do not have access to this wallet');
    }
    if (fromWallet.id === toWallet.id) {
      throw new BadRequestException('Source and destination wallet must differ');
    }
    if (fromWallet.customer.isAmlRestricted) {
      throw new ForbiddenException('User account is restricted due to AML compliance. Contact support.');
    }
    if (fromWallet.customer.tier === KycTier.Tier_0 || fromWallet.customer.tier === KycTier.Tier_1) {
      throw new ForbiddenException(
        'Transfers are only available for Tier 2 and Tier 3 users. Please complete your KYC verification to upgrade your tier.',
      );
    }

    await this.walletRiskService.checkWalletFreezeStatus(fromWallet.id, false);

    const initiation = await this.databaseService.$transaction(async (tx: Prisma.TransactionClient) => {
      const lockedFrom = await tx.wallet.findFirst({
        where: { virtualAccountNumber: pending.fromWalletId as string },
        include: { customer: { select: { userId: true } } },
      });
      if (!lockedFrom || lockedFrom.customer.userId !== userId) {
        throw new UnauthorizedException('You do not have access to this wallet');
      }

      await tx.$queryRaw`
        SELECT id FROM "Wallet" WHERE id = ${lockedFrom.id} FOR UPDATE
      `;

      const lockedUserWallet = await tx.wallet.findUnique({
        where: { id: lockedFrom.id },
        select: { id: true, availableBalance: true, ledgerBalance: true, currencyId: true, virtualAccountNumber: true },
      });

      if (!lockedUserWallet?.virtualAccountNumber) {
        throw new BadRequestException('Source wallet does not have a virtual account number');
      }
      if (lockedUserWallet.availableBalance.lt(amount)) {
        throw new BadRequestException('Insufficient balance');
      }

      const risk = await tx.wallet.findUnique({
        where: { id: lockedFrom.id },
        select: { riskStatus: true, riskScore: true },
      });

      if (risk?.riskStatus === 'HARD_FREEZE' || risk?.riskStatus === 'SOFT_FREEZE') {
        throw new BadRequestException(
          risk.riskStatus === 'HARD_FREEZE'
            ? `Wallet is hard frozen due to high risk score (${risk.riskScore?.toString() || 'N/A'}). Contact support.`
            : `Wallet is soft frozen due to elevated risk score (${risk.riskScore?.toString() || 'N/A'}). Transfers are blocked.`,
        );
      }

      await tx.transaction.create({
        data: {
          walletId: lockedFrom.id,
          type: TransactionType.SPRAY,
          direction: TransactionDirection.DEBIT,
          status: TransactionStatus.PENDING,
          amount,
          currencyId: lockedFrom.currencyId,
          reference: transactionReference,
          externalReference: null,
          groupReference: `TRANSFER-${transactionReference}`,
          narration,
          securityInfoHash,
          destinationAccountNumber: toWallet.virtualAccountNumber,
          destinationAccountName: pending.destinationAccountName as string,
          metadata: {
            destinationBankCode: pending.destinationBankCode,
            destinationBankName: pending.destinationBankName,
            destinationAccountNumber: toWallet.virtualAccountNumber,
            destinationAccountName: pending.destinationAccountName,
            walletToWalletSpray: true,
            receiverWalletId: toWallet.id,
          },
        },
      });

      return { sourceAccountNumber: lockedUserWallet.virtualAccountNumber as string };
    });

    try {
      await this.providerService.processClientTransfer({
        securityInfo,
        amount: amount.toNumber(),
        destinationBankCode: pending.destinationBankCode as string,
        destinationBankName: (pending.destinationBankName as string) || 'Unknown',
        destinationAccountNumber: toWallet.virtualAccountNumber as string,
        destinationAccountName: (pending.destinationAccountName as string) || 'Unknown',
        sourceAccountNumber: initiation.sourceAccountNumber,
        narration,
        transactionReference,
        useCustomNarration: true,
      });
    } catch (error: any) {
      await this.databaseService.transaction.update({
        where: { reference: transactionReference },
        data: { status: TransactionStatus.FAILED, providerStatus: 'FAILED', providerCallbackReceivedAt: new Date() },
      });
      throw error;
    }

    this.logger.log(
      `W2W submitted via provider: ref=${transactionReference}, from=${pending.fromWalletId}, to=${pending.toWalletId}, amount=${amount.toString()}`,
    );

    return {
      success: true,
      message: 'Transfer submitted and pending provider authorization/processing',
      transactionRef: transactionReference,
      status: TransactionStatus.PENDING,
      fromWalletId: pending.fromWalletId,
      toWalletId: pending.toWalletId,
    };
  }

  /**
   * Initiate payout - Step 1: Validate request, send OTP
   */
  async initiatePayout(userId: string, initiateDto: InitiatePayoutDto) {
    // Find wallet and verify ownership
    const fromWallet = await this.databaseService.wallet.findFirst({
      where: { virtualAccountNumber: initiateDto.fromWalletId },
      include: {
        customer: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!fromWallet) {
      throw new NotFoundException('Source wallet not found');
    }

    // Verify wallet belongs to user
    if (fromWallet.customer.userId !== userId) {
      throw new UnauthorizedException('You do not have access to this wallet');
    }

    if (!fromWallet.virtualAccountNumber) {
      throw new BadRequestException('Wallet does not have a virtual account number');
    }

    // Convert amount from string to Decimal and normalize to kobo precision
    const amount = normalizeToKobo(initiateDto.amount);

    // Check sufficient balance using Decimal comparison
    if (fromWallet.availableBalance.lt(amount)) {
      throw new BadRequestException('Insufficient balance');
    }

    // Get destination account name if not provided (via name enquiry)
    let destinationAccountName = initiateDto.recipientName;
    if (!destinationAccountName) {
      try {
        const nameEnquiry = await this.providerService.bankAccountNameEnquiry(
          initiateDto.bankCode,
          initiateDto.toAccountNumber,
        );
        destinationAccountName = nameEnquiry.accountName;
      } catch (error) {
        this.logger.warn(`Name enquiry failed: ${error.message}. Proceeding without account name.`);
        destinationAccountName = 'Unknown';
      }
    }

    // Resolve destination bank name (provider ProcessClientTransfer requires bankName).
    let destinationBankName = 'Unknown';
    try {
      const banks = await this.providerService.getBanks();
      destinationBankName = banks.find((b) => b.bankcode === initiateDto.bankCode)?.bankname ?? 'Unknown';
    } catch (error: any) {
      this.logger.warn(`Failed to resolve destination bank name: ${error.message}. Proceeding as 'Unknown'.`);
    }

    const transactionReference = initiateDto.transactionReference?.trim() || `TXN-${randomUUID()}`;

    // Get source account name
    const customerName =
      fromWallet.customer.firstName && fromWallet.customer.lastName
        ? `${fromWallet.customer.firstName} ${fromWallet.customer.lastName}`
        : null;
    const userName =
      fromWallet.customer.user.firstName && fromWallet.customer.user.lastName
        ? `${fromWallet.customer.user.firstName} ${fromWallet.customer.user.lastName}`
        : null;
    const sourceAccountName = fromWallet.name || customerName || userName || 'Unknown';

    // Prepare payout data to store temporarily
    const payoutData = {
      kind: 'payout' as const,
      fromWalletId: initiateDto.fromWalletId,
      bankCode: initiateDto.bankCode,
      toAccountNumber: initiateDto.toAccountNumber,
      amount: amount.toString(),
      description: initiateDto.description,
      recipientName: destinationAccountName,
      destinationBankName,
      transactionReference,
      securityInfo: initiateDto.securityInfo,
      currencyId: initiateDto.currencyId || fromWallet.currencyId || 'fd5e474d-bb42-4db1-ab74-e8d2a01047e9',
      sourceAccountName,
      walletId: fromWallet.id,
    };

    // Store pending payout data
    await this.payoutSecurityService.storePendingPayout(userId, payoutData);

    // Generate and send OTP
    await this.payoutSecurityService.generateAndSendOtp(userId);

    return {
      success: true,
      message: 'OTP sent to your email. Please confirm the payout with the OTP and your PIN.',
      expiresIn: '10 minutes',
    };
  }

  /**
   * Confirm payout - Step 2: Verify OTP and PIN, execute payout (debit-wallet + callbacks only).
   */
  async confirmPayout(userId: string, otp: string, pin: string) {
    await this.payoutSecurityService.verifyOtp(userId, otp);

    const isPinValid = await this.payoutSecurityService.verifyPayoutPin(userId, pin);
    if (!isPinValid) {
      throw new UnauthorizedException('Invalid PIN');
    }

    const peek = await this.payoutSecurityService.peekPendingPayout(userId);
    if (!peek) {
      throw new BadRequestException('No pending payout found. Please initiate a payout first.');
    }
    if (peek.kind === 'walletToWallet') {
      throw new BadRequestException(
        'You have a pending wallet-to-wallet transfer. Confirm it with POST /wallets/transfer/wallet-to-wallet/confirm instead.',
      );
    }

    const payoutData = await this.payoutSecurityService.getAndClearPendingPayout(userId);
    if (!payoutData) {
      throw new BadRequestException('No pending payout found. Please initiate a payout first.');
    }

    if (typeof payoutData.securityInfo !== 'string' || payoutData.securityInfo.trim() === '') {
      throw new BadRequestException(
        'Payout confirmation requires securityInfo from the client. Please initiate payout again from the current app version.',
      );
    }

    const amount = normalizeToKobo(payoutData.amount as string | number);
    const transactionReference: string = payoutData.transactionReference || `TXN-${randomUUID()}`;
    const securityInfo = payoutData.securityInfo as string;
    const securityInfoHash = createHash('sha256').update(securityInfo).digest('hex');
    const narration = (payoutData.description as string) || `Wallet payout to ${payoutData.toAccountNumber}`;

    const previewWallet = await this.databaseService.wallet.findFirst({
      where: { virtualAccountNumber: payoutData.fromWalletId },
      include: {
        customer: { include: { user: true } },
      },
    });

    if (!previewWallet) {
      throw new NotFoundException('Source wallet not found');
    }
    if (previewWallet.customer.userId !== userId) {
      throw new UnauthorizedException('You do not have access to this wallet');
    }
    if (previewWallet.customer.isAmlRestricted) {
      throw new ForbiddenException('User account is restricted due to AML compliance. Contact support.');
    }
    if (previewWallet.customer.tier === KycTier.Tier_0 || previewWallet.customer.tier === KycTier.Tier_1) {
      throw new ForbiddenException(
        'Withdrawals are only available for Tier 2 and Tier 3 users. Please complete your KYC verification to upgrade your tier.',
      );
    }

    await this.walletRiskService.checkWalletFreezeStatus(previewWallet.id, false);

    const { fee, netAmount, feePercentage } = await calculatePayoutFee(amount, this.configService);

    if (previewWallet.customer.tier === KycTier.Tier_2 || previewWallet.customer.tier === KycTier.Tier_3) {
      const limitCheck = await this.withdrawalLimitService.checkDailyLimit(previewWallet.customer.id, amount);
      if (!limitCheck.allowed) {
        throw new BadRequestException({
          message:
            'This withdrawal exceeds your remaining daily limit. Reduce the amount or try again after your limit resets.',
          dailyLimit: {
            limit: limitCheck.currentLimit.toString(),
            used: limitCheck.used.toString(),
            remaining: limitCheck.remaining.toString(),
          },
        });
      }
    }

    const initiation = await this.databaseService.$transaction(async (tx: Prisma.TransactionClient) => {
      const fromWallet = await tx.wallet.findFirst({
        where: { virtualAccountNumber: payoutData.fromWalletId },
        include: {
          customer: {
            select: { isAmlRestricted: true, tier: true, userId: true },
          },
        },
      });

      if (!fromWallet) throw new NotFoundException('Source wallet not found');
      if (!fromWallet.virtualAccountNumber) throw new BadRequestException('Wallet does not have a virtual account number');
      if (fromWallet.customer.userId !== userId) throw new UnauthorizedException('You do not have access to this wallet');

      await tx.$queryRaw`
        SELECT id FROM "Wallet" WHERE id = ${fromWallet.id} FOR UPDATE
      `;

      const lockedUserWallet = await tx.wallet.findUnique({
        where: { id: fromWallet.id },
        select: { id: true, availableBalance: true, ledgerBalance: true, currencyId: true },
      });

      if (!lockedUserWallet) throw new NotFoundException('User wallet not found after lock');
      if (lockedUserWallet.availableBalance.lt(amount)) {
        throw new BadRequestException('Insufficient balance');
      }

      const risk = await tx.wallet.findUnique({
        where: { id: fromWallet.id },
        select: { riskStatus: true, riskScore: true },
      });

      if (risk?.riskStatus === 'HARD_FREEZE' || risk?.riskStatus === 'SOFT_FREEZE') {
        throw new BadRequestException(
          risk.riskStatus === 'HARD_FREEZE'
            ? `Wallet is hard frozen due to high risk score (${risk.riskScore?.toString() || 'N/A'}). Contact support.`
            : `Wallet is soft frozen due to elevated risk score (${risk.riskScore?.toString() || 'N/A'}). Payouts are blocked.`,
        );
      }

      await tx.transaction.create({
        data: {
          walletId: fromWallet.id,
          type: TransactionType.PAYOUT,
          direction: TransactionDirection.DEBIT,
          status: TransactionStatus.PENDING,
          amount,
          currencyId: fromWallet.currencyId,
          reference: transactionReference,
          externalReference: null,
          groupReference: `TRANSFER-${transactionReference}`,
          narration,
          metadata: {
            destinationBankCode: payoutData.bankCode ?? null,
            destinationBankName: payoutData.destinationBankName ?? null,
            destinationAccountNumber: payoutData.toAccountNumber ?? null,
            destinationAccountName: payoutData.recipientName ?? null,
          },
          securityInfoHash,
          destinationAccountNumber: payoutData.toAccountNumber ?? null,
          destinationAccountName: payoutData.recipientName ?? null,
        },
      });

      return { sourceAccountNumber: fromWallet.virtualAccountNumber as string };
    });

    try {
      await this.providerService.processClientTransfer({
        securityInfo,
        amount: amount.toNumber(),
        destinationBankCode: payoutData.bankCode,
        destinationBankName: payoutData.destinationBankName || 'Unknown',
        destinationAccountNumber: payoutData.toAccountNumber,
        destinationAccountName: payoutData.recipientName || 'Unknown',
        sourceAccountNumber: initiation.sourceAccountNumber,
        narration,
        transactionReference,
        useCustomNarration: true,
      });
    } catch (error: any) {
      await this.databaseService.transaction.update({
        where: { reference: transactionReference },
        data: { status: TransactionStatus.FAILED, providerStatus: 'FAILED', providerCallbackReceivedAt: new Date() },
      });
      throw error;
    }

    return {
      success: true,
      message: 'Transfer submitted and pending authorization/processing',
      transactionRef: transactionReference,
      status: TransactionStatus.PENDING,
    };
  }

  /**
   * Get wallet transaction history
   * Cached for 30 seconds (transaction history changes frequently)
   * Supports search, status filtering, type filtering, and amount range filtering
   */
  async getWalletHistory(
    accountNumber: string,
    fromDate: string,
    toDate: string,
    page?: number,
    pageSize?: number,
    query?: string,
    status?: string,
    minAmount?: number,
    maxAmount?: number,
    type?: string,
  ) {
    // Generate cache key from all parameters (excluding filters for cache efficiency)
    const baseCacheKey = `wallet:history:${accountNumber}:${fromDate}:${toDate}:${page || 1}:${pageSize || 20}`;
    const filterCacheKey = `${baseCacheKey}:${query || ''}:${status || 'all'}:${minAmount || ''}:${maxAmount || ''}:${type || 'all'}`;

    // Check cache first
    const cached = await this.cacheService.get(filterCacheKey);
    if (cached) {
      return cached;
    }

    const wallet = await this.databaseService.wallet.findFirst({
      where: { virtualAccountNumber: accountNumber },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    if (!wallet.virtualAccountNumber) {
      throw new BadRequestException('Wallet does not have a virtual account number');
    }

    const startRange = new Date(`${fromDate}T00:00:00.000Z`);
    const endRange = new Date(`${toDate}T23:59:59.999Z`);

    const andConditions: object[] = [
      { walletId: wallet.id },
      { createdAt: { gte: startRange, lte: endRange } },
    ];

    if (type && type !== 'all') {
      const typeMap: Record<string, TransactionType> = {
        inflow: TransactionType.INFLOW,
        spray: TransactionType.SPRAY,
        payout: TransactionType.PAYOUT,
        refund: TransactionType.REFUND,
        adjustment: TransactionType.ADJUSTMENT,
      };
      const mapped = typeMap[type.toLowerCase()];
      if (mapped) {
        andConditions.push({ type: mapped });
      }
    }

    if (status && status !== 'all') {
      const statusMap: Record<string, TransactionStatus> = {
        successful: TransactionStatus.SUCCESS,
        pending: TransactionStatus.PENDING,
        failed: TransactionStatus.FAILED,
      };
      const mapped = statusMap[status.toLowerCase()];
      if (mapped) {
        andConditions.push({ status: mapped });
      }
    }

    if (minAmount !== undefined || maxAmount !== undefined) {
      const amountFilter: { gte?: Decimal; lte?: Decimal } = {};
      if (minAmount !== undefined) amountFilter.gte = new Decimal(minAmount);
      if (maxAmount !== undefined) amountFilter.lte = new Decimal(maxAmount);
      andConditions.push({ amount: amountFilter });
    }

    if (query && query.trim()) {
      const q = query.trim();
      andConditions.push({
        OR: [
          { narration: { contains: q, mode: 'insensitive' } },
          { reference: { contains: q, mode: 'insensitive' } },
        ],
      });
    }

    const where = { AND: andConditions };

    const priorRows = await this.databaseService.transaction.findMany({
      where: { walletId: wallet.id, createdAt: { lt: startRange } },
      select: { direction: true, amount: true },
    });

    let priorNet = new Decimal(0);
    for (const r of priorRows) {
      priorNet = priorNet.plus(r.direction === TransactionDirection.CREDIT ? r.amount : r.amount.neg());
    }

    const allFiltered = await this.databaseService.transaction.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });

    const balanceAfterById = new Map<string, number>();
    let run = priorNet;
    for (const t of allFiltered) {
      run = normalizeToKobo(run.plus(t.direction === TransactionDirection.CREDIT ? t.amount : t.amount.neg()));
      balanceAfterById.set(t.id, toDisplayAmount(run));
    }

    const totalFiltered = allFiltered.length;
    const limit = pageSize || 20;
    const p = page || 1;
    const startIndex = (p - 1) * limit;
    const pageSlice = allFiltered.slice(startIndex, startIndex + limit).reverse();

    const paginatedTransactions = pageSlice.map((t) => ({
      id: t.id,
      reference: t.reference,
      description: t.narration ?? '',
      amount: toDisplayAmount(t.amount),
      type: t.direction === TransactionDirection.CREDIT ? 'CREDIT' : 'DEBIT',
      timestamp: t.createdAt.toISOString(),
      status: t.status.toLowerCase(),
      balance: balanceAfterById.get(t.id) ?? toDisplayAmount(wallet.ledgerBalance),
    }));

    const result = {
      transactions: paginatedTransactions,
      total: totalFiltered,
      page: p,
      limit,
      totalPages: Math.ceil(totalFiltered / limit) || 1,
    };

    // Cache for 30 seconds (transaction history changes frequently)
    await this.cacheService.set(filterCacheKey, result, 30);

    return result;
  }

  /**
   * Set payout PIN for a user (first time setup only)
   */
  async setPayoutPin(userId: string, pin: string): Promise<void> {
    await this.payoutSecurityService.setPayoutPin(userId, pin);
  }

  /**
   * Reset payout PIN - Generate and send OTP to user's email
   */
  async resetPayoutPin(emailAddress: string): Promise<{ success: boolean; message: string }> {
    await this.payoutSecurityService.resetPayoutPin(emailAddress);
    return {
      success: true,
      message: 'If the email exists and PIN is set, a PIN reset OTP has been sent to your email.',
    };
  }

  /**
   * Update payout PIN for a user (requires OTP verification)
   */
  async updatePayoutPin(userId: string, otp: string, newPin: string): Promise<void> {
    await this.payoutSecurityService.updatePayoutPin(userId, otp, newPin);
  }

  /**
   * Update bank account details for a user
   */
  async updateBankAccount(userId: string, updateDto: UpdateBankAccountDto): Promise<any> {
    // Find customer by userId
    const customer = await this.databaseService.customer.findUnique({
      where: { userId },
      include: {
        user: true,
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    // Get destination account name if not provided (via name enquiry)
    let accountName = updateDto.accountName;
    if (!accountName) {
      try {
        const nameEnquiry = await this.providerService.bankAccountNameEnquiry(
          updateDto.bankCode,
          updateDto.accountNumber,
        );
        accountName = nameEnquiry.accountName;
      } catch (error) {
        this.logger.warn(`Name enquiry failed: ${error.message}. Proceeding without account name.`);
        accountName = 'Unknown';
      }
    }

    // Find existing bank account for this customer
    const existingBankAccount = await this.databaseService.bankAccount.findFirst({
      where: {
        customerId: customer.id,
        accountNumber: updateDto.accountNumber,
        bankCode: updateDto.bankCode,
      },
    });

    let oldAccountNumber: string | null = null;
    let bankAccount;

    if (existingBankAccount) {
      // Update existing bank account
      oldAccountNumber = existingBankAccount.accountNumber;
      bankAccount = await this.databaseService.bankAccount.update({
        where: { id: existingBankAccount.id },
        data: {
          accountName,
          accountNumber: updateDto.accountNumber,
          bankCode: updateDto.bankCode,
          isDefault: updateDto.isDefault ?? existingBankAccount.isDefault,
        },
      });
    } else {
      // Create new bank account
      // If setting as default, unset other default accounts
      if (updateDto.isDefault) {
        await this.databaseService.bankAccount.updateMany({
          where: {
            customerId: customer.id,
            isDefault: true,
          },
          data: {
            isDefault: false,
          },
        });
      }

      bankAccount = await this.databaseService.bankAccount.create({
        data: {
          customerId: customer.id,
          accountName,
          accountNumber: updateDto.accountNumber,
          bankCode: updateDto.bankCode,
          isDefault: updateDto.isDefault ?? false,
          isVerified: true,
        },
      });
    }

    // Send email notification (don't await to avoid blocking)
    if (customer.user?.email) {
      this.emailService
        .sendBankAccountChangeAlert(
          customer.user.email,
          oldAccountNumber || 'N/A',
          updateDto.accountNumber,
          updateDto.bankCode,
          'pending',
          customer.user.firstName || customer.firstName || undefined,
          new Date(),
        )
        .catch((error) => {
          this.logger.error(`Failed to send bank account change email: ${error.message}`);
        });
    }

    return {
      success: true,
      message: existingBankAccount ? 'Bank account updated successfully' : 'Bank account added successfully',
      bankAccount,
    };
  }
}
