import { Injectable, NotFoundException, BadRequestException, Logger, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../database/database.service.js';
import { ProviderService } from '../provider/provider.service.js';
import { CacheService } from '../cache/cache.service.js';
import { InitiateWalletToWalletTransferDto, UpdateBankAccountDto } from './dto/index.js';
import { InitiatePayoutDto } from './dto/payout-security.dto.js';
import { PayoutSecurityService } from './services/payout-security.service.js';
import { Decimal } from '@prisma/client/runtime/library';
import { Prisma } from '@prisma/client';
import {
  TransactionType,
  TransactionDirection,
  TransactionStatus,
  PayoutStatus,
} from '../../generated/prisma/enums.js';
import { normalizeToKobo, toDisplayAmount } from '../common/utils/money.util.js';
import { calculatePayoutFee } from '../common/utils/fee.util.js';
import { OrganizationWalletService } from '../common/services/organization-wallet.service.js';
import { WalletRiskService } from '../common/services/wallet-risk.service.js';
import { AmlLoggingService } from '../common/services/aml-logging.service.js';
import { EmailService } from '../users/email.service.js';
import { ConfigService } from '../config/config.service.js';
import { WithdrawalLimitService } from './services/withdrawal-limit.service.js';
import { DebitWalletMandateService } from '../common/debit-mandate/debit-wallet-mandate.service.js';
import { ForbiddenException } from '@nestjs/common';
import {
  buildStableProviderRef,
  buildUniqueProviderRef,
  toProviderTransactionReference,
} from '../common/utils/provider-transaction-reference.util.js';

const DEFAULT_PROVIDER_BANK_CODE = '035';
const DEFAULT_PROVIDER_BANK_NAME = 'WEMA BANK';

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
    private readonly debitWalletMandateService: DebitWalletMandateService,
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
   * Wallet-to-wallet in one step: Bearer auth only (no OTP/PIN). Server generates `securityInfo` for ProcessClientTransfer.
   */
  async walletToWalletTransfer(userId: string, dto: InitiateWalletToWalletTransferDto) {
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
    const amount = normalizeToKobo(dto.amount);
    if (fromWallet.availableBalance.lt(amount)) {
      throw new BadRequestException('Insufficient balance');
    }

    await this.walletRiskService.checkWalletFreezeStatus(fromWallet.id, true);

    await this.withdrawalLimitService.validatePayoutForTier(
      fromWallet.customer,
      fromWallet.customerId,
      amount,
    );

    const transactionReference = dto.transactionReference?.trim()
      ? toProviderTransactionReference(dto.transactionReference.trim(), 'TXN')
      : buildUniqueProviderRef('TXN');
    const destinationAccountName =
      toWallet.name ||
      [toWallet.customer.firstName, toWallet.customer.lastName].filter(Boolean).join(' ').trim() ||
      'Unknown';
    const destinationBankCode = toWallet.virtualBankCode?.trim() || DEFAULT_PROVIDER_BANK_CODE;
    const destinationBankName = toWallet.virtualBankName?.trim() || DEFAULT_PROVIDER_BANK_NAME;
    const mandateNonce = this.debitWalletMandateService.generateNonce();
    const amountNormalized = amount.toFixed(2);
    const { securityInfo, securityInfoHash } = this.debitWalletMandateService.generateWalletToWalletMandate({
      transactionReference,
      fromWalletId: dto.fromWalletId,
      toWalletId: dto.toWalletId,
      amountNormalized,
      mandateNonce,
    });
    const narration = dto.description || `Wallet transfer to ${dto.toWalletId}`;

    await this.walletRiskService.checkWalletFreezeStatus(fromWallet.id, false);

    const initiation = await this.databaseService.$transaction(async (tx: Prisma.TransactionClient) => {
      const lockedFrom = await tx.wallet.findFirst({
        where: { virtualAccountNumber: dto.fromWalletId },
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
          destinationAccountName,
          metadata: {
            destinationBankCode,
            destinationBankName,
            destinationAccountNumber: toWallet.virtualAccountNumber,
            destinationAccountName,
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
        destinationBankCode,
        destinationBankName,
        destinationAccountNumber: toWallet.virtualAccountNumber as string,
        destinationAccountName,
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

    await this.withdrawalLimitService.recordWithdrawal(fromWallet.customerId, amount);

    this.logger.log(
      `W2W submitted via provider: ref=${transactionReference}, from=${dto.fromWalletId}, to=${dto.toWalletId}, amount=${amount.toString()}`,
    );

    return {
      success: true,
      message: 'Transfer submitted and pending provider authorization/processing',
      transactionRef: transactionReference,
      status: TransactionStatus.PENDING,
      fromWalletId: dto.fromWalletId,
      toWalletId: dto.toWalletId,
    };
  }

  /**
   * Initiate payout - Step 1: Validate request and store pending payout for PIN confirmation.
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

    const payoutCustomer = fromWallet.customer;
    await this.withdrawalLimitService.validatePayoutForTier(payoutCustomer, payoutCustomer.id, amount);

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

    const transactionReference = initiateDto.transactionReference?.trim()
      ? toProviderTransactionReference(initiateDto.transactionReference.trim(), 'TXN')
      : buildUniqueProviderRef('TXN');
    const mandateNonce = this.debitWalletMandateService.generateNonce();

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
      mandateNonce,
      currencyId: initiateDto.currencyId || fromWallet.currencyId || 'fd5e474d-bb42-4db1-ab74-e8d2a01047e9',
      sourceAccountName,
      walletId: fromWallet.id,
    };

    await this.payoutSecurityService.storePendingPayout(userId, payoutData);

    return {
      success: true,
      message: 'Payout prepared. Confirm with your payout PIN.',
      expiresIn: '10 minutes',
    };
  }

  /**
   * Confirm payout - Step 2: Verify PIN and execute payout (debit-wallet + callbacks only).
   */
  async confirmPayout(userId: string, pin: string) {
    const isPinValid = await this.payoutSecurityService.verifyPayoutPin(userId, pin);
    if (!isPinValid) {
      throw new UnauthorizedException('Invalid PIN');
    }

    const peek = await this.payoutSecurityService.peekPendingPayout(userId);
    if (!peek) {
      throw new BadRequestException('No pending payout found. Please initiate a payout first.');
    }

    const payoutData = await this.payoutSecurityService.getAndClearPendingPayout(userId);
    if (!payoutData) {
      throw new BadRequestException('No pending payout found. Please initiate a payout first.');
    }

    if (typeof payoutData.mandateNonce !== 'string' || payoutData.mandateNonce.trim() === '') {
      throw new BadRequestException(
        'This pending payout is missing a server mandate. Please initiate payout again.',
      );
    }

    const amount = normalizeToKobo(payoutData.amount as string | number);
    const transactionReference: string =
      typeof payoutData.transactionReference === 'string' && payoutData.transactionReference.trim()
        ? toProviderTransactionReference(payoutData.transactionReference.trim(), 'TXN')
        : buildUniqueProviderRef('TXN');
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
    if (!previewWallet.virtualAccountNumber) {
      throw new BadRequestException('Wallet does not have a virtual account number');
    }
    await this.withdrawalLimitService.validatePayoutForTier(
      previewWallet.customer,
      previewWallet.customerId,
      amount,
    );

    await this.walletRiskService.checkWalletFreezeStatus(previewWallet.id, false);

    const { fee: payoutFee, netAmount, feePercentage } = await calculatePayoutFee(amount, this.configService);
    const netAmountKobo = normalizeToKobo(netAmount);
    const netAmountNormalized = netAmountKobo.toFixed(2);

    const { securityInfo: netSecurityInfo, securityInfoHash: netSecurityInfoHash } =
      this.debitWalletMandateService.generatePayoutMandate({
        transactionReference,
        walletId: previewWallet.id,
        amountNormalized: netAmountNormalized,
        bankCode: payoutData.bankCode as string,
        toAccountNumber: payoutData.toAccountNumber as string,
        mandateNonce: payoutData.mandateNonce as string,
      });

    const feeSweepReference = buildStableProviderRef('FEEP', transactionReference);
    let feeSweepMandate: { securityInfo: string; securityInfoHash: string } | null = null;
    let orgVirtualAccount = '';
    let orgBankCode = DEFAULT_PROVIDER_BANK_CODE;
    let orgBankName = DEFAULT_PROVIDER_BANK_NAME;

    if (payoutFee.gt(0)) {
      const orgWallet = await this.organizationWalletService.getAdminWalletRecord();
      orgVirtualAccount =
        orgWallet?.virtualAccountNumber || this.organizationWalletService.getAdminWalletAccountNumber();
      orgBankCode = orgWallet?.virtualBankCode?.trim() || DEFAULT_PROVIDER_BANK_CODE;
      orgBankName = orgWallet?.virtualBankName?.trim() || DEFAULT_PROVIDER_BANK_NAME;
      const payoutFeeNorm = normalizeToKobo(payoutFee).toFixed(2);
      feeSweepMandate = this.debitWalletMandateService.generatePayoutFeeSweepMandate({
        feeSweepReference,
        walletId: previewWallet.id,
        amountNormalized: payoutFeeNorm,
        userVirtualAccount: previewWallet.virtualAccountNumber,
        orgVirtualAccount,
        orgBankCode,
      });
    }

    const normalizedPayoutFeePct = feePercentage.toDecimalPlaces(4, Decimal.ROUND_HALF_EVEN);
    const adminWalletAccountNumber = this.organizationWalletService.getAdminWalletAccountNumber();

    const initiation = await this.databaseService.$transaction(async (tx: Prisma.TransactionClient) => {
      const fromWallet = await tx.wallet.findFirst({
        where: { virtualAccountNumber: payoutData.fromWalletId },
        include: {
          customer: {
            select: {
              isAmlRestricted: true,
              tier: true,
              userId: true,
              id: true,
            },
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

      const toAccount = (payoutData.toAccountNumber as string).trim();
      const bankCode = (payoutData.bankCode as string).trim();
      let bankAccount = await tx.bankAccount.findFirst({
        where: {
          customerId: fromWallet.customerId,
          accountNumber: toAccount,
          bankCode,
        },
      });
      if (!bankAccount) {
        bankAccount = await tx.bankAccount.create({
          data: {
            customerId: fromWallet.customerId,
            accountName: (payoutData.recipientName as string) || 'Unknown',
            accountNumber: toAccount,
            bankCode,
            isDefault: false,
            isVerified: true,
          },
        });
      }

      const payoutTxn = await tx.transaction.create({
        data: {
          walletId: fromWallet.id,
          type: TransactionType.PAYOUT,
          direction: TransactionDirection.DEBIT,
          status: TransactionStatus.PENDING,
          amount: netAmountKobo,
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
            payoutGrossAmount: amount.toString(),
            payoutFeeAmount: payoutFee.toString(),
            payoutNetAmount: netAmountKobo.toString(),
            payoutFeeSweepReference: payoutFee.gt(0) ? feeSweepReference : null,
          },
          securityInfoHash: netSecurityInfoHash,
          destinationAccountNumber: payoutData.toAccountNumber ?? null,
          destinationAccountName: payoutData.recipientName ?? null,
        },
      });

      const payoutRow = await tx.payoutTransaction.create({
        data: {
          walletId: fromWallet.id,
          bankAccountId: bankAccount.id,
          amount,
          fee: payoutFee,
          transactionId: payoutTxn.id,
          status: PayoutStatus.PROCESSING,
        },
      });

      const adminFeeRow = await tx.adminFee.create({
        data: {
          walletId: fromWallet.id,
          customerId: fromWallet.customerId,
          amount: payoutFee,
          feeType: 'payout',
          feePercentage: normalizedPayoutFeePct,
          relatedTransactionId: payoutTxn.id,
          payoutTransactionId: payoutRow.id,
          status: payoutFee.gt(0) ? 'PENDING' : 'COLLECTED',
          grossAmount: amount,
          netAmount: netAmountKobo,
          adminWalletAccountNumber: adminWalletAccountNumber,
          metadata: {
            feeSweepReference: payoutFee.gt(0) ? feeSweepReference : null,
            internalLedger: true,
          },
        },
      });

      if (payoutFee.gt(0) && feeSweepMandate) {
        await tx.transaction.create({
          data: {
            walletId: fromWallet.id,
            type: TransactionType.ADJUSTMENT,
            direction: TransactionDirection.DEBIT,
            status: TransactionStatus.PENDING,
            amount: payoutFee,
            currencyId: fromWallet.currencyId,
            reference: feeSweepReference,
            externalReference: transactionReference,
            groupReference: `TRANSFER-${transactionReference}`,
            securityInfoHash: feeSweepMandate.securityInfoHash,
            destinationAccountNumber: orgVirtualAccount,
            destinationAccountName: 'Organization',
            narration: `Admin payout fee (${transactionReference})`,
            metadata: {
              payoutAdminFeeSweep: true,
              payoutNetTransactionId: payoutTxn.id,
              adminFeeId: adminFeeRow.id,
            },
          },
        });
      }

      return {
        sourceAccountNumber: fromWallet.virtualAccountNumber as string,
        netSecurityInfo,
        feeSecurityInfo: feeSweepMandate?.securityInfo ?? null,
      };
    });

    const markPayoutTxnFailed = async () => {
      await this.databaseService.transaction.update({
        where: { reference: transactionReference },
        data: { status: TransactionStatus.FAILED, providerStatus: 'FAILED', providerCallbackReceivedAt: new Date() },
      });
    };

    const markFeeTxnFailed = async () => {
      if (!payoutFee.gt(0)) return;
      await this.databaseService.transaction.update({
        where: { reference: feeSweepReference },
        data: { status: TransactionStatus.FAILED, providerStatus: 'FAILED', providerCallbackReceivedAt: new Date() },
      });
    };

    // Net to bank first, then admin fee to org VA — avoids collecting a fee when the bank leg never left the wallet.
    try {
      try {
        await this.providerService.processClientTransfer({
          securityInfo: initiation.netSecurityInfo,
          amount: netAmountKobo.toNumber(),
          destinationBankCode: payoutData.bankCode,
          destinationBankName: payoutData.destinationBankName || 'Unknown',
          destinationAccountNumber: payoutData.toAccountNumber,
          destinationAccountName: payoutData.recipientName || 'Unknown',
          sourceAccountNumber: initiation.sourceAccountNumber,
          narration,
          transactionReference,
          useCustomNarration: true,
        });
      } catch (netErr: unknown) {
        await markPayoutTxnFailed();
        await markFeeTxnFailed();
        throw netErr;
      }

      if (payoutFee.gt(0) && initiation.feeSecurityInfo) {
        try {
          await this.providerService.processClientTransfer({
            securityInfo: initiation.feeSecurityInfo,
            amount: normalizeToKobo(payoutFee).toNumber(),
            destinationBankCode: orgBankCode,
            destinationBankName: orgBankName,
            destinationAccountNumber: orgVirtualAccount,
            destinationAccountName: 'Organization',
            sourceAccountNumber: initiation.sourceAccountNumber,
            narration: `Admin payout fee ${feeSweepReference}`,
            transactionReference: feeSweepReference,
            useCustomNarration: true,
          });
        } catch (feeErr: unknown) {
          await markFeeTxnFailed();
          throw feeErr;
        }
      }
    } catch (error: unknown) {
      throw error;
    }

    await this.withdrawalLimitService.recordWithdrawal(previewWallet.customerId, amount);

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
