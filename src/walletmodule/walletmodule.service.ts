import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../database/database.service.js';
import { ProviderService } from '../provider/provider.service.js';
import { CacheService } from '../cache/cache.service.js';
import {
  CreateWalletDto,
  GetWalletByIdDto,
  GetWalletByAccountNumberDto,
  GetWalletHistoryDto,
  WalletToWalletTransferDto,
  FastWalletTransferDto,
  UpdateBankAccountDto,
} from './dto/index.js';
import { InitiatePayoutDto } from './dto/payout-security.dto.js';
import { PayoutSecurityService } from './services/payout-security.service.js';
import { KycTier } from '../users/dto/create-user-dto.js';
import { Decimal } from '@prisma/client/runtime/library';
import { Prisma } from '@prisma/client';
import { TransactionType, TransactionDirection, TransactionStatus } from '../../generated/prisma/enums.js';
import { normalizeToKobo } from '../common/utils/money.util.js';
import { calculatePayoutFee } from '../common/utils/fee.util.js';
import { OrganizationWalletService } from '../common/services/organization-wallet.service.js';
import { WalletRiskService } from '../common/services/wallet-risk.service.js';
import { AmlLoggingService } from '../common/services/aml-logging.service.js';
import { DeviceAbuseDetectionService, DeviceInfo } from '../common/services/device-abuse-detection.service.js';
import { EmailService } from '../users/email.service.js';
import { ConfigService } from '../config/config.service.js';
import { WithdrawalLimitService } from './services/withdrawal-limit.service.js';
import { ForbiddenException } from '@nestjs/common';

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
    private readonly deviceAbuseDetectionService: DeviceAbuseDetectionService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
    private readonly withdrawalLimitService: WithdrawalLimitService,
  ) {}

  /**
   * Create a new wallet for a customer
   * Customers must be at least Tier 1 to create a wallet
   */
  /**
   * Create wallet by userId
   */
  async createWalletByUserId(
    userId: string,
    createWalletDto: CreateWalletDto,
    deviceInfo?: DeviceInfo,
  ) {
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

    if (!customer.providerCustomerId) {
      throw new BadRequestException('Customer does not have a provider customer ID');
    }

    // Check if customer is at least Tier 1
    if (customer.tier === KycTier.Tier_0) {
      throw new BadRequestException('Customer must be at least Tier 1 to create a wallet');
    }

    // Detect device/IP abuse before creating wallet
    let abuseResult;
    if (deviceInfo) {
      abuseResult = await this.deviceAbuseDetectionService.detectAbuse(
        userId,
        customer.id,
        deviceInfo,
      );

      // Log warning if abuse detected (but don't block - let compliance review)
      if (abuseResult.isAbuse) {
        this.logger.warn(
          `⚠️ Wallet creation flagged for abuse detection: User ${userId}, ` +
            `Reasons: ${abuseResult.reasons.join(', ')}`,
        );
      }
    }

    // Generate wallet ID (UUID) - Prisma will auto-generate with @default(uuid())
    // We'll create the wallet first, then use its ID for provider
    const tempWallet = await this.databaseService.wallet.create({
      data: {
        customerId: customer.id,
        currencyId: createWalletDto.currencyId || "fd5e474d-bb42-4db1-ab74-e8d2a01047e9",
        walletGroupId: createWalletDto.walletGroupId || undefined,
        walletRestrictionId: createWalletDto.walletRestrictionId || undefined,
        walletClassificationId: createWalletDto.walletClassificationId || undefined,
        availableBalance: 0,
        ledgerBalance: 0,
        overdraft: createWalletDto.overdraft || 0,
        isInternal: createWalletDto.isInternal || false,
        isDefault: createWalletDto.isDefault || false,
        name: createWalletDto.name || (customer.firstName && customer.lastName 
          ? `${customer.firstName} ${customer.lastName}` 
          : customer.firstName || customer.lastName || 'Wallet'),
        mobNum: createWalletDto.mobNum || customer.mobileNumber || undefined,
      },
    });
    const walletId = tempWallet.id;

    // Create wallet with provider
    const providerRequest = {
      id: walletId,
      customerId: customer.providerCustomerId,
      currencyId: createWalletDto.currencyId || "fd5e474d-bb42-4db1-ab74-e8d2a01047e9",
      walletGroupId: createWalletDto.walletGroupId || undefined,
      walletRestrictionId: createWalletDto.walletRestrictionId || undefined,
      walletClassificationId: createWalletDto.walletClassificationId || undefined,
      availableBalance: createWalletDto.availableBalance || 0,
      ledgerBalance: createWalletDto.ledgerBalance || 0,
      overdraft: createWalletDto.overdraft || 0,
      isInternal: createWalletDto.isInternal || false,
      isDefault: createWalletDto.isDefault || true,
      name: createWalletDto.name || (customer.firstName && customer.lastName 
        ? `${customer.firstName} ${customer.lastName}` 
        : customer.firstName || customer.lastName || 'Wallet'),
      mobNum: createWalletDto.mobNum || customer.mobileNumber || undefined,
    };

    let providerResponse;
    try {
      providerResponse = await this.providerService.createWallet(providerRequest);
    } catch (error) {
      // Delete the temporary wallet if provider call fals
      await this.databaseService.wallet.delete({ where: { id: walletId } });
      this.logger.error(`Failed to create wallet with provider: ${error.message}`);
      throw new BadRequestException(error.message || 'Failed to create wallet with provider service');
    }

    // Update wallet with provider response
    const wallet = await this.databaseService.wallet.update({
      where: { id: walletId },
      data: {
        providerWalletId: providerResponse.walletId,
        availableBalance: providerResponse.virtualAccount ? 0 : (createWalletDto.availableBalance || 0),
        ledgerBalance: providerResponse.virtualAccount ? 0 : (createWalletDto.ledgerBalance || 0),
        mobNum: providerResponse.mobNum || createWalletDto.mobNum,
        virtualAccountNumber: providerResponse.virtualAccount?.accountNumber,
        virtualBankCode: providerResponse.virtualAccount?.bankCode,
        virtualBankName: providerResponse.virtualAccount?.bankName,
        walletClassificationId: providerResponse.walletClassificationId || createWalletDto.walletClassificationId,
      },
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

    // Record wallet creation event with device information
    if (deviceInfo) {
      await this.deviceAbuseDetectionService.recordWalletCreation(
        wallet.id,
        userId,
        customer.id,
        deviceInfo,
        abuseResult,
      );
    }

    return wallet;
  }

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

    // If not found, query provider
    try {
      const providerWallet = await this.providerService.getWalletByAccountNumber(accountNumber);
      
      // Try to find wallet by provider wallet ID
      const localWallet = await this.databaseService.wallet.findUnique({
        where: { providerWalletId: providerWallet.walletId },
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

      if (localWallet) {
        // Update balances from provider
        await this.databaseService.wallet.update({
          where: { id: localWallet.id },
          data: {
            availableBalance: providerWallet.availableBalance,
            ledgerBalance: providerWallet.ledgerBalance,
          },
        });

        return {
          ...localWallet,
          availableBalance: providerWallet.availableBalance,
          ledgerBalance: providerWallet.ledgerBalance,
        };
      }

      // Return provider data if local wallet not found
      return providerWallet;
    } catch (error) {
      this.logger.error(`Failed to get wallet from provider: ${error.message}`);
      throw new NotFoundException('Wallet not found');
    }
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
   * Wallet to wallet transfer
   */
  async walletToWalletTransfer(transferDto: WalletToWalletTransferDto) {
    // Verify both wallets exist by account number
    const fromWallet = await this.databaseService.wallet.findFirst({
      where: { virtualAccountNumber: transferDto.fromWalletId },
    });

    if (!fromWallet) {
      throw new NotFoundException('Source wallet not found');
    }

    if (!fromWallet.virtualAccountNumber) {
      throw new BadRequestException('Source wallet does not have a virtual account number');
    }

    const toWallet = await this.databaseService.wallet.findFirst({
      where: { virtualAccountNumber: transferDto.toWalletId },
    });

    if (!toWallet) {
      throw new NotFoundException('Destination wallet not found');
    }

    if (!toWallet.virtualAccountNumber) {
      throw new BadRequestException('Destination wallet does not have a virtual account number');
    }

    // Convert amount from string to Decimal and normalize to kobo precision
    const amount = normalizeToKobo(transferDto.amount);

    // Check wallet freeze status (hard freeze blocks all transactions)
    await this.walletRiskService.checkWalletFreezeStatus(fromWallet.id, true);

    // Check sufficient balance using Decimal comparison
    if (fromWallet.availableBalance.lt(amount)) {
      throw new BadRequestException('Insufficient balance');
    }

    // Generate internal reference if not provided
    const internalReference = transferDto.reference || `SPRAY-${randomUUID()}`;
    const groupReference = `GRP-${randomUUID()}`; // Group reference to link both transactions

    // Execute transfer with provider using account numbers
    const providerResponse = await this.providerService.walletToWalletTransfer({
      fromWalletId: fromWallet.virtualAccountNumber,
      toWalletId: toWallet.virtualAccountNumber,
      amount: amount.toNumber(), // Convert to number for provider API
      currencyId: transferDto.currencyId || fromWallet.currencyId || "fd5e474d-bb42-4db1-ab74-e8d2a01047e9",
      description: transferDto.description,
      reference: internalReference,
    });

    if (!providerResponse.success) {
      throw new BadRequestException(providerResponse.message || 'Transfer failed');
    }

    // Update wallet balances using Decimal methods
    const fromAvailableBalance = normalizeToKobo(fromWallet.availableBalance.minus(amount));
    const fromLedgerBalance = normalizeToKobo(fromWallet.ledgerBalance.minus(amount));
    const toAvailableBalance = normalizeToKobo(toWallet.availableBalance.plus(amount));
    const toLedgerBalance = normalizeToKobo(toWallet.ledgerBalance.plus(amount));

    // Create Transaction records for both wallets
    // DEBIT transaction for sender
    const debitTransaction = await this.databaseService.transaction.create({
      data: {
        walletId: fromWallet.id,
        type: TransactionType.SPRAY,
        direction: TransactionDirection.DEBIT,
        status: TransactionStatus.SUCCESS,
        amount,
        currencyId: transferDto.currencyId || fromWallet.currencyId || "fd5e474d-bb42-4db1-ab74-e8d2a01047e9",
        reference: internalReference,
        externalReference: null, // Wallet-to-wallet (sprays) only use internal reference
        groupReference: groupReference,
        narration: transferDto.description || 'Wallet to wallet transfer',
      },
    });

    // CREDIT transaction for receiver
    const creditTransaction = await this.databaseService.transaction.create({
      data: {
        walletId: toWallet.id,
        type: TransactionType.SPRAY,
        direction: TransactionDirection.CREDIT,
        status: TransactionStatus.SUCCESS,
        amount,
        currencyId: transferDto.currencyId || fromWallet.currencyId || "fd5e474d-bb42-4db1-ab74-e8d2a01047e9",
        reference: `SPRAY-CREDIT-${randomUUID()}`, // Unique reference for credit side
        externalReference: null,
        groupReference: groupReference, // Same group reference to link transactions
        narration: transferDto.description || 'Wallet to wallet transfer',
      },
    });

    // Create Spray record linked to the DEBIT transaction
    const spray = await this.databaseService.spray.create({
      data: {
        eventId: null, // Can be set if this is part of an event
        sprayerWalletId: fromWallet.id,
        receiverWalletId: toWallet.id,
        transactionId: debitTransaction.id, // Link to the debit transaction
        transactionGroupReference: groupReference,
        totalAmount: amount,
        note: transferDto.description,
        metadata: {
          creditTransactionId: creditTransaction.id,
          providerResponse: providerResponse.data,
        },
      },
    });

    // Log spray transaction
    this.logger.log(
      `💰 SPRAY TRANSACTION: Amount=${amount.toString()}, ` +
      `From=${fromWallet.virtualAccountNumber} (${fromWallet.id}), ` +
      `To=${toWallet.virtualAccountNumber} (${toWallet.id}), ` +
      `DebitTxId=${debitTransaction.id}, CreditTxId=${creditTransaction.id}, ` +
      `SprayId=${spray.id}, GroupRef=${groupReference}, ` +
      `Reference=${internalReference}, Description="${transferDto.description || 'Wallet to wallet transfer'}"`,
    );

    // Update wallet balances
    await Promise.all([
      this.databaseService.wallet.update({
        where: { id: fromWallet.id },
        data: {
          availableBalance: new Decimal(fromAvailableBalance),
          ledgerBalance: new Decimal(fromLedgerBalance),
        },
      }),
      this.databaseService.wallet.update({
        where: { id: toWallet.id },
        data: {
          availableBalance: new Decimal(toAvailableBalance),
          ledgerBalance: new Decimal(toLedgerBalance),
        },
      }),
    ]);

    const result = {
      success: true,
      message: providerResponse.message,
      fromWalletId: fromWallet.virtualAccountNumber,
      toWalletId: toWallet.virtualAccountNumber,
      amount: transferDto.amount,
      transactionId: debitTransaction.id,
      sprayId: spray.id,
      reference: internalReference,
      groupReference: groupReference,
      data: providerResponse.data,
    };

    // Recalculate risk scores for both wallets (outside transaction to avoid blocking)
    this.walletRiskService.updateWalletRiskScore(fromWallet.id).catch((error) => {
      this.logger.error(`Failed to update risk score for sender wallet: ${error.message}`);
    });
    this.walletRiskService.updateWalletRiskScore(toWallet.id).catch((error) => {
      this.logger.error(`Failed to update risk score for receiver wallet: ${error.message}`);
    });

    return result;
  }

  /**
   * Wallet payout (to external account) - Legacy method (kept for backward compatibility)
   * @deprecated Use initiatePayout and confirmPayout instead
   */
  async walletpayout(transferDto: FastWalletTransferDto) {
    const fromWallet = await this.databaseService.wallet.findFirst({
      where: { virtualAccountNumber: transferDto.fromWalletId },
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

    if (!fromWallet.virtualAccountNumber) {
      throw new BadRequestException('Wallet does not have a virtual account number');
    }

    // Convert amount from string to Decimal and normalize to kobo precision
    const amount = normalizeToKobo(transferDto.amount);

    // Check sufficient balance using Decimal comparison
    if (fromWallet.availableBalance.lt(amount)) {
      throw new BadRequestException('Insufficient balance');
    }

    // Get destination account name if not provided (via name enquiry)
    let destinationAccountName = transferDto.recipientName;
    if (!destinationAccountName) {
      try {
        const nameEnquiry = await this.providerService.bankAccountNameEnquiry(
          transferDto.bankCode,
          transferDto.toAccountNumber,
        );
        destinationAccountName = nameEnquiry.accountName;
      } catch (error) {
        this.logger.warn(`Name enquiry failed: ${error.message}. Proceeding without account name.`);
        destinationAccountName = 'Unknown';
      }
    }

    // Get source account name
    const customerName = fromWallet.customer.firstName && fromWallet.customer.lastName
      ? `${fromWallet.customer.firstName} ${fromWallet.customer.lastName}`
      : null;
    const userName = fromWallet.customer.user.firstName && fromWallet.customer.user.lastName
      ? `${fromWallet.customer.user.firstName} ${fromWallet.customer.user.lastName}`
      : null;
    const sourceAccountName = fromWallet.name || customerName || userName || 'Unknown';

    // Generate transaction reference if not provided (max 36 characters)
    // Use UUID directly (36 chars) to meet provider requirement
    const transactionReference =
      transferDto.reference || randomUUID();

    // Execute inter-bank transfer with provider
    const providerResponse = await this.providerService.interBankTransfer({
      destinationBankCode: transferDto.bankCode,
      destinationAccountNumber: transferDto.toAccountNumber,
      destinationAccountName: destinationAccountName,
      sourceAccountNumber: fromWallet.virtualAccountNumber,
      sourceAccountName: sourceAccountName,
      remarks: transferDto.description || 'Fast wallet transfer',
      amount: amount.toNumber(), // Convert to number for provider API
      currencyId: transferDto.currencyId || fromWallet.currencyId || "fd5e474d-bb42-4db1-ab74-e8d2a01047e9",
      customerTransactionReference: transactionReference,
    });

    // Update wallet balance using Decimal methods
    const newAvailableBalance = normalizeToKobo(fromWallet.availableBalance.minus(amount));
    const newLedgerBalance = normalizeToKobo(fromWallet.ledgerBalance.minus(amount));

    await this.databaseService.wallet.update({
      where: { id: fromWallet.id },
      data: {
        availableBalance: new Decimal(newAvailableBalance),
        ledgerBalance: new Decimal(newLedgerBalance),
      },
    });

    return {
      success: true,
      message: providerResponse.message,
      transactionRef: providerResponse.transactionRef,
      fromWalletId: fromWallet.id,
      toAccountNumber: transferDto.toAccountNumber,
      amount: transferDto.amount,
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

    // Get source account name
    const customerName = fromWallet.customer.firstName && fromWallet.customer.lastName
      ? `${fromWallet.customer.firstName} ${fromWallet.customer.lastName}`
      : null;
    const userName = fromWallet.customer.user.firstName && fromWallet.customer.user.lastName
      ? `${fromWallet.customer.user.firstName} ${fromWallet.customer.user.lastName}`
      : null;
    const sourceAccountName = fromWallet.name || customerName || userName || 'Unknown';

    // Prepare payout data to store temporarily
    const payoutData = {
      fromWalletId: initiateDto.fromWalletId,
      bankCode: initiateDto.bankCode,
      toAccountNumber: initiateDto.toAccountNumber,
      amount: amount.toString(),
      description: initiateDto.description,
      recipientName: destinationAccountName,
      currencyId: initiateDto.currencyId || fromWallet.currencyId || "fd5e474d-bb42-4db1-ab74-e8d2a01047e9",
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
   * Confirm payout - Step 2: Verify OTP and PIN, execute payout
   * Implements fee-based payout: 3% fee to organization wallet, 97% to customer
   */
  async confirmPayout(userId: string, otp: string, pin: string) {
    // Verify OTP
    await this.payoutSecurityService.verifyOtp(userId, otp);

    // Verify PIN
    const isPinValid = await this.payoutSecurityService.verifyPayoutPin(userId, pin);
    if (!isPinValid) {
      throw new UnauthorizedException('Invalid PIN');
    }

    // Retrieve pending payout data
    const payoutData = await this.payoutSecurityService.getAndClearPendingPayout(userId);
    if (!payoutData) {
      throw new BadRequestException('No pending payout found. Please initiate a payout first.');
    }

    // Convert amount from string to Decimal and normalize to kobo precision
    const grossAmount = normalizeToKobo(payoutData.amount as string | number);

    // Calculate payout fee (3%)
    const { fee, netAmount, feePercentage } = await calculatePayoutFee(grossAmount, this.configService);

    // Use database transaction for atomicity
    const result = await this.databaseService.$transaction(
      async (tx: Prisma.TransactionClient) => {
        // Find user wallet
        const fromWallet = await tx.wallet.findFirst({
          where: { virtualAccountNumber: payoutData.fromWalletId },
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

        if (!fromWallet.virtualAccountNumber) {
          throw new BadRequestException('Wallet does not have a virtual account number');
        }

        // Lock user wallet
        await tx.$queryRaw`
          SELECT id FROM "Wallet" WHERE id = ${fromWallet.id} FOR UPDATE
        `;

        // Re-fetch with lock to get latest balance
        const lockedUserWallet = await tx.wallet.findUnique({
          where: { id: fromWallet.id },
          select: { id: true, availableBalance: true, ledgerBalance: true, currencyId: true },
        });

        if (!lockedUserWallet) {
          throw new NotFoundException('User wallet not found after lock');
        }

        // Check AML restriction
        if (fromWallet.customer.isAmlRestricted) {
          throw new ForbiddenException(
            'User account is restricted due to AML compliance. Contact support.',
          );
        }

        // Only Tier_2 and Tier_3 users are allowed to withdraw
        if (fromWallet.customer.tier === KycTier.Tier_0 || fromWallet.customer.tier === KycTier.Tier_1) {
          throw new ForbiddenException(
            'Withdrawals are only available for Tier 2 and Tier 3 users. Please complete your KYC verification to upgrade your tier.',
          );
        }

        // Check withdrawal limit for Tier 2 and Tier 3 users
        let requiresApproval = false;
        if (fromWallet.customer.tier === KycTier.Tier_2 || fromWallet.customer.tier === KycTier.Tier_3) {
          const limitCheck = await this.withdrawalLimitService.checkDailyLimit(
            fromWallet.customer.id,
            grossAmount,
          );

          if (!limitCheck.allowed) {
            // Instead of throwing error, create a pending approval request
            requiresApproval = true;
            
            // Get destination account name if not provided
            let destinationAccountName = payoutData.recipientName as string;
            if (!destinationAccountName) {
              try {
                const nameEnquiry = await this.providerService.bankAccountNameEnquiry(
                  payoutData.bankCode as string,
                  payoutData.toAccountNumber as string,
                );
                destinationAccountName = nameEnquiry.accountName;
              } catch (error) {
                this.logger.warn(`Name enquiry failed: ${error.message}. Using 'Unknown'.`);
                destinationAccountName = 'Unknown';
              }
            }

            // Find or create bank account record
            let bankAccount = await tx.bankAccount.findFirst({
              where: {
                customerId: fromWallet.customerId,
                accountNumber: payoutData.toAccountNumber as string,
                bankCode: payoutData.bankCode as string,
              },
            });

            if (!bankAccount) {
              bankAccount = await tx.bankAccount.create({
                data: {
                  customerId: fromWallet.customerId,
                  accountName: destinationAccountName,
                  accountNumber: payoutData.toAccountNumber as string,
                  bankCode: payoutData.bankCode as string,
                  isVerified: true,
                },
              });
            }

            // Create a placeholder transaction for the pending approval
            const placeholderTransaction = await tx.transaction.create({
              data: {
                walletId: fromWallet.id,
                type: TransactionType.PAYOUT,
                direction: TransactionDirection.DEBIT,
                status: TransactionStatus.PENDING,
                amount: grossAmount,
                currencyId: fromWallet.currencyId,
                reference: `PAYOUT-PENDING-${randomUUID()}`,
                externalReference: null,
                narration: `Payout to ${payoutData.toAccountNumber}: ${payoutData.description || 'Wallet payout'} (Pending Approval)`,
                metadata: {
                  fee: fee.toString(),
                  netAmount: netAmount.toString(),
                  feePercentage: feePercentage.toString(),
                  feeType: 'payout',
                  destinationAccount: payoutData.toAccountNumber,
                  destinationBank: payoutData.bankCode,
                  requiresApproval: true,
                  approvalReason: 'Exceeds daily withdrawal limit',
                },
              },
            });

            // Create PayoutTransaction with requiresApproval flag
            const pendingPayoutTransaction = await tx.payoutTransaction.create({
              data: {
                walletId: fromWallet.id,
                bankAccountId: bankAccount.id,
                amount: grossAmount,
                fee,
                status: 'PENDING',
                transactionId: placeholderTransaction.id,
                requiresApproval: true,
                approvalReason: 'Exceeds daily withdrawal limit',
                providerPayload: {
                  payoutData: payoutData,
                  limitCheck: {
                    currentLimit: limitCheck.currentLimit.toString(),
                    used: limitCheck.used.toString(),
                    remaining: limitCheck.remaining.toString(),
                  },
                },
              },
            });

            // Return early - no wallet debit, no provider calls
            return {
              success: true,
              message: 'Withdrawal request submitted for admin approval. You will be notified once it is reviewed.',
              requiresApproval: true,
              payoutTransactionId: pendingPayoutTransaction.id,
              transactionId: placeholderTransaction.id,
            };
          }
        }

        // Re-check balance (in case it changed)
        if (lockedUserWallet.availableBalance.lt(grossAmount)) {
          throw new BadRequestException('Insufficient balance');
        }

        // Check wallet freeze status (soft freeze blocks payouts, hard freeze blocks all)
        // For payouts, we check with blockAllTransactions=false to allow soft freeze to block
        const wallet = await tx.wallet.findUnique({
          where: { id: fromWallet.id },
          select: { riskStatus: true, riskScore: true },
        });

        if (wallet?.riskStatus === 'HARD_FREEZE') {
          // Log AML transaction block (non-blocking)
          try {
            this.amlLoggingService.logTransactionBlocked(
              fromWallet.id,
              'N/A', // Transaction ID not yet created
              'PAYOUT',
              'DEBIT',
              grossAmount,
              `Hard freeze - Risk score: ${wallet.riskScore?.toString() || 'N/A'}`,
              wallet.riskStatus,
              wallet.riskScore?.toNumber(),
              fromWallet.customerId,
              userId,
              {
                destinationAccount: payoutData.toAccountNumber,
                destinationBank: payoutData.bankCode,
              },
            );
          } catch (logError) {
            // Log the logging error but don't block transaction
            this.logger.error(`AML logging failed for hard freeze: ${logError.message}`);
          }

          throw new BadRequestException(
            `Wallet is hard frozen due to high risk score (${wallet.riskScore?.toString() || 'N/A'}). ` +
            `All transactions are blocked. Please contact support.`,
          );
        }

        if (wallet?.riskStatus === 'SOFT_FREEZE') {
          // Log AML transaction block (non-blocking)
          try {
            this.amlLoggingService.logTransactionBlocked(
              fromWallet.id,
              'N/A', // Transaction ID not yet created
              'PAYOUT',
              'DEBIT',
              grossAmount,
              `Soft freeze - Risk score: ${wallet.riskScore?.toString() || 'N/A'}`,
              wallet.riskStatus,
              wallet.riskScore?.toNumber(),
              fromWallet.customerId,
              userId,
              {
                destinationAccount: payoutData.toAccountNumber,
                destinationBank: payoutData.bankCode,
              },
            );
          } catch (logError) {
            // Log the logging error but don't block transaction
            this.logger.error(`AML logging failed for soft freeze: ${logError.message}`);
          }

          throw new BadRequestException(
            `Wallet is soft frozen due to elevated risk score (${wallet.riskScore?.toString() || 'N/A'}). ` +
            `Payouts are blocked. Please contact support.`,
          );
        }

        // Process payout using helper method (normal flow - within limit)
        return await this.processPayoutTransaction(
          tx,
          fromWallet,
          payoutData,
          grossAmount,
          fee,
          netAmount,
          feePercentage,
        );
      },
      {
        timeout: 15000, // 15 second timeout for payout transaction
      },
    );

    // Handle post-payout actions only for successful payouts (not approval-required)
    // Use type guard: check if 'requiresApproval' exists in result to narrow the union type
    if (result.success && !('requiresApproval' in result)) {
      // TypeScript now knows this is a successful payout with fromWalletId, toAccountNumber, etc.
      const successfulResult = result as {
        success: boolean;
        message: string;
        transactionRef: string;
        fromWalletId: string;
        toAccountNumber: string;
        bankCode: string;
        bankName: string | null;
        amount: string;
        fee: string;
        netAmount: string;
        payoutTransactionId: string;
      };

      // Recalculate risk score after payout (outside transaction to avoid blocking)
      this.walletRiskService.updateWalletRiskScore(successfulResult.fromWalletId).catch((error) => {
        this.logger.error(`Failed to update risk score after payout: ${error.message}`);
      });

      // Send email notification for withdrawal request (PENDING status)
      // Fetch wallet with user info and bank account for email
      const walletWithUser = await this.databaseService.wallet.findUnique({
        where: { id: successfulResult.fromWalletId },
        include: {
          customer: {
            include: {
              user: true,
              bankAccounts: {
                where: {
                  accountNumber: successfulResult.toAccountNumber,
                },
                take: 1,
              },
            },
          },
        },
      });

      if (walletWithUser?.customer?.user?.email) {
        const firstName = walletWithUser.customer.user.firstName || walletWithUser.customer.firstName || undefined;
        const bankAccount = walletWithUser.customer.bankAccounts?.[0];
        const bankName = bankAccount?.accountName ? undefined : undefined; // Could look up from bankCode if needed
        
        this.emailService.sendWithdrawalStatusAlert(
          walletWithUser.customer.user.email,
          successfulResult.amount,
          'PENDING',
          successfulResult.toAccountNumber,
          successfulResult.transactionRef,
          'Your withdrawal request has been submitted and is being processed.',
          firstName,
          bankName,
          new Date(),
        ).catch((error) => {
          this.logger.error(`Failed to send withdrawal request email: ${error.message}`);
        });
      }
    } else if (result.success && 'requiresApproval' in result) {
      // For approval-required withdrawals, we could send a different email notification
      // but for now, we'll skip the risk score update and email since it's pending approval
      const approvalResult = result as {
        success: boolean;
        message: string;
        requiresApproval: boolean;
        payoutTransactionId: string;
        transactionId: string;
      };
      this.logger.log(`Withdrawal requires approval. Skipping risk score update and email notification. PayoutTransactionId: ${approvalResult.payoutTransactionId}`);
    }

    return result;
  }

  /**
   * Process payout transaction - helper method for executing payout
   * This method handles the actual payout processing: wallet debit, provider calls, transaction creation
   * Can be called from confirmPayout (normal flow) or approveWithdrawal (admin approval flow)
   */
  async processPayoutTransaction(
    tx: Prisma.TransactionClient,
    fromWallet: any,
    payoutData: any,
    grossAmount: Decimal,
    fee: Decimal,
    netAmount: Decimal,
    feePercentage: Decimal,
  ) {
    // Get admin wallet account number (for tracking purposes)
    const adminWalletAccountNumber = this.organizationWalletService.getAdminWalletAccountNumber();

    // Generate transaction references
    const userTransactionRef = `PAYOUT-${randomUUID()}`;
    const providerTransactionRef = randomUUID();

    // Step 1: Transfer full amount from user wallet to organization wallet (wallet-to-wallet)
    // Execute with provider - use account number directly
    const userToOrgProviderResponse = await this.providerService.walletToWalletTransfer({
      fromWalletId: fromWallet.virtualAccountNumber,
      toWalletId: adminWalletAccountNumber, // Use account number directly from env
      amount: grossAmount.toNumber(),
      currencyId: fromWallet.currencyId || "fd5e474d-bb42-4db1-ab74-e8d2a01047e9",
      description: `Payout fee transfer: ${payoutData.description || 'Wallet payout'}`,
      reference: userTransactionRef,
    });

    if (!userToOrgProviderResponse.success) {
      throw new BadRequestException(
        `Failed to transfer to organization wallet: ${userToOrgProviderResponse.message}`,
      );
    }

    // Log PAYOUT LEG 1: User wallet → Organization wallet
    this.logger.log(
      `💸 PAYOUT LEG 1 (User→Org): Amount=${grossAmount.toString()}, ` +
      `From=${fromWallet.virtualAccountNumber} (${fromWallet.id}), ` +
      `To=${adminWalletAccountNumber}, ` +
      `Reference=${userTransactionRef}, ` +
      `ProviderResponse=${JSON.stringify(userToOrgProviderResponse.data)}`,
    );

    // Lock user wallet for balance update
    await tx.$queryRaw`
      SELECT id FROM "Wallet" WHERE id = ${fromWallet.id} FOR UPDATE
    `;

    // Re-fetch with lock to get latest balance
    const lockedUserWallet = await tx.wallet.findUnique({
      where: { id: fromWallet.id },
      select: { id: true, availableBalance: true, ledgerBalance: true, currencyId: true },
    });

    if (!lockedUserWallet) {
      throw new NotFoundException('User wallet not found after lock');
    }

    // Re-check balance (in case it changed)
    if (lockedUserWallet.availableBalance.lt(grossAmount)) {
      throw new BadRequestException('Insufficient balance');
    }

    // Create DEBIT transaction for user wallet (full amount)
    // Transaction table only tracks user-facing transactions
    const userDebitTransaction = await tx.transaction.create({
      data: {
        walletId: fromWallet.id,
        type: TransactionType.PAYOUT,
        direction: TransactionDirection.DEBIT,
        status: TransactionStatus.SUCCESS,
        amount: grossAmount,
        currencyId: fromWallet.currencyId,
        reference: userTransactionRef,
        externalReference: null,
        narration: `Payout to ${payoutData.toAccountNumber}: ${payoutData.description || 'Wallet payout'}`,
        metadata: {
          fee: fee.toString(),
          netAmount: netAmount.toString(),
          feePercentage: feePercentage.toString(),
          feeType: 'payout',
          destinationAccount: payoutData.toAccountNumber,
          destinationBank: payoutData.bankCode,
        },
      },
    });

    // Step 2: Transfer 97% (netAmount) from organization wallet to external bank
    // Get destination account name if not provided
    let destinationAccountName = payoutData.recipientName as string;
    if (!destinationAccountName) {
      try {
        const nameEnquiry = await this.providerService.bankAccountNameEnquiry(
          payoutData.bankCode as string,
          payoutData.toAccountNumber as string,
        );
        destinationAccountName = nameEnquiry.accountName;
      } catch (error) {
        this.logger.warn(`Name enquiry failed: ${error.message}. Using 'Unknown'.`);
        destinationAccountName = 'Unknown';
      }
    }

    // Get source account name
    const customerName = fromWallet.customer.firstName && fromWallet.customer.lastName
      ? `${fromWallet.customer.firstName} ${fromWallet.customer.lastName}`
      : null;
    const userName = fromWallet.customer.user.firstName && fromWallet.customer.user.lastName
      ? `${fromWallet.customer.user.firstName} ${fromWallet.customer.user.lastName}`
      : null;
    const sourceAccountName = fromWallet.name || customerName || userName || 'Unknown';

    // Step 2: Transfer 97% (netAmount) from organization wallet to external bank
    // Execute inter-bank transfer from organization wallet
    // Use admin wallet account number directly from env
    const orgToBankProviderResponse = await this.providerService.interBankTransfer({
      destinationBankCode: payoutData.bankCode as string,
      destinationAccountNumber: payoutData.toAccountNumber as string,
      destinationAccountName: destinationAccountName,
      sourceAccountNumber: adminWalletAccountNumber, // Use account number directly from env
      sourceAccountName: sourceAccountName,
      remarks: (payoutData.description as string) || 'Wallet payout',
      amount: netAmount.toNumber(), // Transfer net amount (97%)
      currencyId: payoutData.currencyId as string,
      customerTransactionReference: providerTransactionRef,
    });

    // Log PAYOUT LEG 2: Organization wallet → External bank
    this.logger.log(
      `💸 PAYOUT LEG 2 (Org→Bank): NetAmount=${netAmount.toString()}, ` +
      `GrossAmount=${grossAmount.toString()}, Fee=${fee.toString()}, ` +
      `From=${adminWalletAccountNumber}, ` +
      `To=${payoutData.toAccountNumber} (${payoutData.bankCode}), ` +
      `RecipientName="${destinationAccountName}", ` +
      `ProviderRef=${providerTransactionRef}, ` +
      `UserTxId=${userDebitTransaction.id}, ` +
      `ProviderResponse=${JSON.stringify(orgToBankProviderResponse)}`,
    );

    // Update user wallet balance (deduct full amount)
    const newUserAvailableBalance = normalizeToKobo(lockedUserWallet.availableBalance.minus(grossAmount));
    const newUserLedgerBalance = normalizeToKobo(lockedUserWallet.ledgerBalance.minus(grossAmount));

    // Update user wallet
    await tx.wallet.update({
      where: { id: fromWallet.id },
      data: {
        availableBalance: newUserAvailableBalance,
        ledgerBalance: newUserLedgerBalance,
      },
    });

    // Find or create bank account record
    let bankAccount = await tx.bankAccount.findFirst({
      where: {
        customerId: fromWallet.customerId,
        accountNumber: payoutData.toAccountNumber as string,
        bankCode: payoutData.bankCode as string,
      },
    });

    if (!bankAccount) {
      bankAccount = await tx.bankAccount.create({
        data: {
          customerId: fromWallet.customerId,
          accountName: destinationAccountName,
          accountNumber: payoutData.toAccountNumber as string,
          bankCode: payoutData.bankCode as string,
          isVerified: true,
        },
      });
    }

    // Create PayoutTransaction record
    const payoutTransaction = await tx.payoutTransaction.create({
      data: {
        walletId: fromWallet.id,
        bankAccountId: bankAccount.id,
        amount: grossAmount, // Full amount requested
        fee, // 3% fee
        status: 'PENDING', // Will be updated by webhook
        transactionId: userDebitTransaction.id, // Link to user debit transaction
        providerTransactionRef, // Link to provider transaction
        providerPayload: {
          userToOrgTransfer: userToOrgProviderResponse.data,
          orgToBankTransfer: orgToBankProviderResponse,
          netAmount: netAmount.toString(),
        },
      },
    });

    // Create AdminFee record (separate table for fee tracking)
    // Normalize feePercentage to ensure it fits in DECIMAL(5,4) - max value is 9.9999
    // feePercentage should be between 0 and 1 (e.g., 0.03 for 3%), so we ensure it's properly formatted
    const normalizedFeePercentage = feePercentage.toDecimalPlaces(4, Decimal.ROUND_HALF_EVEN);
    
    // Validate that feePercentage is within bounds (should be < 10 for DECIMAL(5,4))
    if (normalizedFeePercentage.gte(new Decimal('10'))) {
      this.logger.error(
        `Fee percentage ${normalizedFeePercentage.toString()} exceeds maximum allowed value (9.9999). ` +
        `This might indicate an incorrectly configured env variable. Expected decimal (e.g., 0.03 for 3%), not percentage (e.g., 3).`,
      );
      throw new BadRequestException(
        `Invalid fee percentage: ${normalizedFeePercentage.toString()}. ` +
        `Fee percentage must be less than 10. Please check ADMIN_PAYOUT_FEE environment variable.`,
      );
    }

    await tx.adminFee.create({
      data: {
        walletId: fromWallet.id,
        customerId: fromWallet.customerId,
        amount: fee, // 3% fee
        feeType: 'payout',
        feePercentage: normalizedFeePercentage,
        relatedTransactionId: userDebitTransaction.id, // Link to user's payout transaction
        payoutTransactionId: payoutTransaction.id, // Link to payout transaction
        status: 'COLLECTED',
        grossAmount: grossAmount,
        netAmount: netAmount,
        adminWalletAccountNumber: adminWalletAccountNumber,
        metadata: {
          destinationAccount: payoutData.toAccountNumber,
          destinationBank: payoutData.bankCode,
          recipientName: destinationAccountName,
          providerTransactionRef: providerTransactionRef,
          userToOrgTransfer: userToOrgProviderResponse.data,
          orgToBankTransfer: orgToBankProviderResponse,
        },
      },
    });

    // Record withdrawal for Tier 2 and Tier 3 users (outside transaction to avoid blocking)
    if (fromWallet.customer.tier === KycTier.Tier_2 || fromWallet.customer.tier === KycTier.Tier_3) {
      this.withdrawalLimitService.recordWithdrawal(fromWallet.customer.id, grossAmount).catch((error) => {
        this.logger.error(`Failed to record withdrawal for customer ${fromWallet.customer.id}: ${error.message}`);
      });
    }

    // Get bank name from bank code
    let bankName: string | null = null;
    try {
      const banks = await this.providerService.getBanks();
      
      // Helper function to normalize bank codes for comparison (remove leading zeros)
      const normalizeBankCode = (code: string | number | null | undefined): string => {
        if (code === null || code === undefined) return '';
        return String(code).trim().replace(/^0+/, '') || '0';
      };

      const payoutBankCode = normalizeBankCode(payoutData.bankCode);
      
      // Find matching bank using normalized comparison
      const bank = banks.find(b => {
        const bankCode = normalizeBankCode(b.bankcode);
        return bankCode === payoutBankCode;
      });
      
      bankName = bank?.bankname || null;
    } catch (error: any) {
      this.logger.warn(`Failed to fetch bank name for code ${payoutData.bankCode}: ${error.message}`);
      // Continue without bank name - not critical
    }

    // Log complete payout transaction
    this.logger.log(
      `✅ PAYOUT CONFIRMED: GrossAmount=${grossAmount.toString()}, ` +
      `Fee=${fee.toString()}, NetAmount=${netAmount.toString()}, ` +
      `WalletId=${fromWallet.id}, ` +
      `ToAccount=${payoutData.toAccountNumber}, ` +
      `BankCode=${payoutData.bankCode}, ` +
      `PayoutTxId=${payoutTransaction.id}, ` +
      `UserTxId=${userDebitTransaction.id}, ` +
      `ProviderRef=${providerTransactionRef}`,
    );

    return {
      success: true,
      message: orgToBankProviderResponse.message || 'Payout initiated successfully',
      transactionRef: providerTransactionRef,
      fromWalletId: fromWallet.id,
      toAccountNumber: payoutData.toAccountNumber,
      bankCode: payoutData.bankCode,
      bankName: bankName,
      amount: grossAmount.toString(),
      fee: fee.toString(),
      netAmount: netAmount.toString(),
      payoutTransactionId: payoutTransaction.id,
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

    // Get history from provider using account number
    // Request more records if filtering is needed to ensure we have enough results after filtering
    const providerPageSize = (query || status || type || minAmount !== undefined || maxAmount !== undefined) 
      ? (pageSize || 20) * 3 // Request 3x more to account for filtering
      : pageSize || 20;

    const history = await this.providerService.getWalletHistoryByAccountNumber(
      wallet.virtualAccountNumber,
      fromDate,
      toDate,
      page,
      providerPageSize,
    );

    // Get database transactions to match status and type if filters are provided
    let dbTransactions: Map<string, { status: string; type: string }> = new Map();
    // For SPRAY type, we also need groupReference to match credit transactions
    let sprayTransactions: Array<{ reference: string | null; externalReference: string | null; groupReference: string | null; status: string; type: string; amount: any; createdAt: Date }> = [];
    if ((status && status !== 'all') || (type && type !== 'all')) {
      const transactions = await this.databaseService.transaction.findMany({
        where: {
          walletId: wallet.id,
          createdAt: {
            gte: new Date(fromDate),
            lte: new Date(toDate + 'T23:59:59.999Z'),
          },
        },
        select: {
          reference: true,
          externalReference: true,
          groupReference: true,
          status: true,
          type: true,
          amount: true,
          createdAt: true,
        },
      });
      
      // Store spray transactions separately for special handling
      if (type && type.toLowerCase() === 'spray') {
        sprayTransactions = transactions.filter(tx => tx.type === 'SPRAY');
      }
      
      // Create a map of reference -> {status, type} for quick lookup
      // Check both reference and externalReference to match provider's transactionReference
      transactions.forEach((tx) => {
        const txData = { status: tx.status, type: tx.type };
        if (tx.reference) {
          dbTransactions.set(tx.reference, txData);
        }
        if (tx.externalReference) {
          dbTransactions.set(tx.externalReference, txData);
        }
      });
    }

    // Apply filters
    let filteredTransactions = history.transactions || [];

    // Search filter (case-insensitive search in description)
    if (query && query.trim()) {
      const searchQuery = query.trim().toLowerCase();
      filteredTransactions = filteredTransactions.filter((tx) =>
        tx.description?.toLowerCase().includes(searchQuery) ||
        tx.reference?.toLowerCase().includes(searchQuery),
      );
    }

    // Status filter
    if (status && status !== 'all') {
      filteredTransactions = filteredTransactions.filter((tx) => {
        const txData = dbTransactions.get(tx.reference || '');
        if (!txData) return false; // Skip if we can't find transaction in database
        
        const statusMap: Record<string, string> = {
          successful: 'SUCCESS',
          pending: 'PENDING',
          failed: 'FAILED',
        };
        return txData.status === statusMap[status.toLowerCase()];
      });
    }

    // Type filter
    if (type && type !== 'all') {
      const typeMap: Record<string, string> = {
        inflow: 'INFLOW',
        spray: 'SPRAY',
        payout: 'PAYOUT',
        refund: 'REFUND',
        adjustment: 'ADJUSTMENT',
      };
      const targetType = typeMap[type.toLowerCase()];
      
      if (type.toLowerCase() === 'spray') {
        // Special handling for SPRAY type to include both debit and credit transactions
        // Credit spray transactions may have different references from the provider,
        // so we need to match them using fuzzy matching (amount + timestamp)
        filteredTransactions = filteredTransactions.filter((tx) => {
          // First try direct reference match
          let txData = dbTransactions.get(tx.reference || '');
          
          // If no direct match, try to find a matching spray transaction
          // by checking if any spray transaction has a matching reference or externalReference
          if (!txData) {
            const matchingSpray = sprayTransactions.find(
              (st) => 
                (st.reference && st.reference === tx.reference) ||
                (st.externalReference && st.externalReference === tx.reference)
            );
            
            if (matchingSpray) {
              txData = { status: matchingSpray.status, type: matchingSpray.type };
            } else {
              // If still no match, try fuzzy matching by amount and timestamp
              // This handles cases where provider reference doesn't match our reference
              // This is especially important for credit spray transactions which may have different references
              const providerAmount = new Decimal(tx.amount || 0);
              const providerTimestamp = tx.timestamp ? new Date(tx.timestamp) : null;
              
              const fuzzyMatch = sprayTransactions.find((st) => {
                // Amount must match exactly
                if (!st.amount) return false;
                const amountMatch = new Decimal(st.amount).equals(providerAmount);
                if (!amountMatch) return false;
                
                // Timestamp must be very close (within 2 minutes) to ensure we're matching the right transaction
                if (providerTimestamp) {
                  const timeDiff = Math.abs(providerTimestamp.getTime() - st.createdAt.getTime());
                  // Allow 2 minute window for matching (accounts for slight timing differences)
                  return timeDiff <= 2 * 60 * 1000;
                }
                // If no timestamp, only match by amount (less reliable, but better than nothing)
                return true;
              });
              
              if (fuzzyMatch) {
                txData = { status: fuzzyMatch.status, type: fuzzyMatch.type };
              }
            }
          }
          
          if (!txData) return false;
          return txData.type === 'SPRAY';
        });
      } else {
        // For other types, use existing logic
        filteredTransactions = filteredTransactions.filter((tx) => {
          const txData = dbTransactions.get(tx.reference || '');
          if (!txData) return false; // Skip if we can't find transaction in database
          return txData.type === targetType;
        });
      }
    }

    // Amount range filter
    if (minAmount !== undefined) {
      filteredTransactions = filteredTransactions.filter((tx) => tx.amount >= minAmount);
    }
    if (maxAmount !== undefined) {
      filteredTransactions = filteredTransactions.filter((tx) => tx.amount <= maxAmount);
    }

    // Re-paginate after filtering
    const totalFiltered = filteredTransactions.length;
    const startIndex = ((page || 1) - 1) * (pageSize || 20);
    const endIndex = startIndex + (pageSize || 20);
    const paginatedTransactions = filteredTransactions.slice(startIndex, endIndex);

    const result = {
      transactions: paginatedTransactions,
      total: totalFiltered,
      page: page || 1,
      limit: pageSize || 20,
      totalPages: Math.ceil(totalFiltered / (pageSize || 20)),
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
      this.emailService.sendBankAccountChangeAlert(
        customer.user.email,
        oldAccountNumber || 'N/A',
        updateDto.accountNumber,
        updateDto.bankCode,
        'pending',
        customer.user.firstName || customer.firstName || undefined,
        new Date(),
      ).catch((error) => {
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
