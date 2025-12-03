import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../database/database.service.js';
import { ProviderService } from '../provider/provider.service.js';
import {
  CreateWalletDto,
  GetWalletByIdDto,
  GetWalletByAccountNumberDto,
  GetWalletHistoryDto,
  WalletToWalletTransferDto,
  FastWalletTransferDto,
} from './dto/index.js';
import { KycTier } from '../users/dto/create-user-dto.js';
import { Decimal } from '@prisma/client/runtime/library';
import { TransactionType, TransactionDirection, TransactionStatus } from '../../generated/prisma/enums.js';

@Injectable()
export class WalletmoduleService {
  private readonly logger = new Logger(WalletmoduleService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly providerService: ProviderService,
  ) {}

  /**
   * Create a new wallet for a customer
   * Customers must be at least Tier 1 to create a wallet
   */
  async createWallet(customerId: string, createWalletDto: CreateWalletDto) {
    // Verify customer exists and has required tier
    const customer = await this.databaseService.customer.findUnique({
      where: { id: customerId },
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

    // Generate wallet ID (UUID) - Prisma will auto-generate with @default(uuid())
    // We'll create the wallet first, then use its ID for provider
    const tempWallet = await this.databaseService.wallet.create({
      data: {
        customerId,
        currencyId: createWalletDto.currencyId || "fd5e474d-bb42-4db1-ab74-e8d2a01047e9",
        walletGroupId: createWalletDto.walletGroupId || undefined,
        walletRestrictionId: createWalletDto.walletRestrictionId || undefined,
        walletClassificationId: createWalletDto.walletClassificationId || undefined,
        availableBalance: 0,
        ledgerBalance: 0,
        overdraft: createWalletDto.overdraft || 0,
        isInternal: createWalletDto.isInternal || false,
        isDefault: createWalletDto.isDefault || false,
        name: createWalletDto.name || customer.firstName + ' ' + customer.lastName,
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
      availableBalance: createWalletDto.availableBalance || 1000000,
      ledgerBalance: createWalletDto.ledgerBalance || 1000000,
      overdraft: createWalletDto.overdraft || 0,
      isInternal: createWalletDto.isInternal || false,
      isDefault: createWalletDto.isDefault || true,
      name: createWalletDto.name || customer.firstName + ' ' + customer.lastName,
      mobNum: createWalletDto.mobNum || customer.mobileNumber || undefined,
    };

    let providerResponse;
    try {
      providerResponse = await this.providerService.createWallet(providerRequest);
    } catch (error) {
      // Delete the temporary wallet if provider call fails
      await this.databaseService.wallet.delete({ where: { id: walletId } });
      this.logger.error(`Failed to create wallet with provider: ${error.message}`);
      throw new BadRequestException(error.message || 'Failed to create wallet with provider service');
    }

    // Update wallet with provider response
    const wallet = await this.databaseService.wallet.update({
      where: { id: walletId },
      data: {
        providerWalletId: providerResponse.walletId,
        availableBalance: providerResponse.virtualAccount ? 1000000 : (createWalletDto.availableBalance || 1000000),
        ledgerBalance: providerResponse.virtualAccount ? 1000000 : (createWalletDto.ledgerBalance || 1000000),
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
   * Get all wallets for a customer
   */
  async getCustomerWallets(customerId: string) {
    const customer = await this.databaseService.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const wallets = await this.databaseService.wallet.findMany({
      where: { customerId },
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

    return wallets;
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

    // Check sufficient balance
    if (Number(fromWallet.availableBalance) < transferDto.amount) {
      throw new BadRequestException('Insufficient balance');
    }

    // Generate internal reference if not provided
    const internalReference = transferDto.reference || `SPRAY-${randomUUID()}`;
    const groupReference = `GRP-${randomUUID()}`; // Group reference to link both transactions

    // Execute transfer with provider using account numbers
    const providerResponse = await this.providerService.walletToWalletTransfer({
      fromWalletId: fromWallet.virtualAccountNumber,
      toWalletId: toWallet.virtualAccountNumber,
      amount: transferDto.amount,
      currencyId: transferDto.currencyId || fromWallet.currencyId,
      description: transferDto.description,
      reference: internalReference,
    });

    if (!providerResponse.success) {
      throw new BadRequestException(providerResponse.message || 'Transfer failed');
    }

    // Update wallet balances (we'll sync with provider later, but update optimistically)
    const fromAvailableBalance = Number(fromWallet.availableBalance) - transferDto.amount;
    const fromLedgerBalance = Number(fromWallet.ledgerBalance) - transferDto.amount;
    const toAvailableBalance = Number(toWallet.availableBalance) + transferDto.amount;
    const toLedgerBalance = Number(toWallet.ledgerBalance) + transferDto.amount;

    // Create Transaction records for both wallets
    // DEBIT transaction for sender
    const debitTransaction = await this.databaseService.transaction.create({
      data: {
        walletId: fromWallet.id,
        type: TransactionType.SPRAY,
        direction: TransactionDirection.DEBIT,
        status: TransactionStatus.SUCCESS,
        amount: transferDto.amount,
        currencyId: transferDto.currencyId || fromWallet.currencyId,
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
        amount: transferDto.amount,
        currencyId: transferDto.currencyId || fromWallet.currencyId,
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
        totalAmount: transferDto.amount,
        note: transferDto.description,
        metadata: {
          creditTransactionId: creditTransaction.id,
          providerResponse: providerResponse.data,
        },
      },
    });

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

    return {
      success: true,
      message: providerResponse.message,
      fromWalletId: fromWallet.id,
      toWalletId: toWallet.id,
      amount: transferDto.amount,
      transactionId: debitTransaction.id,
      sprayId: spray.id,
      reference: internalReference,
      groupReference: groupReference,
      data: providerResponse.data,
    };
  }

  /**
   * Fast wallet transfer (to external account)
   */
  async fastWalletTransfer(transferDto: FastWalletTransferDto) {
    const fromWallet = await this.databaseService.wallet.findUnique({
      where: { id: transferDto.fromWalletId },
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

    // Check sufficient balance
    if (Number(fromWallet.availableBalance) < transferDto.amount) {
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
    const sourceAccountName =
      fromWallet.name ||
      `${fromWallet.customer.firstName} ${fromWallet.customer.lastName}` ||
      `${fromWallet.customer.user.firstName} ${fromWallet.customer.user.lastName}`;

    // Generate transaction reference if not provided
    const transactionReference =
      transferDto.reference || `FAST-TXN-${randomUUID()}`;

    // Execute inter-bank transfer with provider
    const providerResponse = await this.providerService.interBankTransfer({
      destinationBankCode: transferDto.bankCode,
      destinationAccountNumber: transferDto.toAccountNumber,
      destinationAccountName: destinationAccountName,
      sourceAccountNumber: fromWallet.virtualAccountNumber,
      sourceAccountName: sourceAccountName,
      remarks: transferDto.description || 'Fast wallet transfer',
      amount: transferDto.amount,
      currencyId: transferDto.currencyId || fromWallet.currencyId,
      customerTransactionReference: transactionReference,
    });

    // Update wallet balance
    const newAvailableBalance = Number(fromWallet.availableBalance) - transferDto.amount;
    const newLedgerBalance = Number(fromWallet.ledgerBalance) - transferDto.amount;

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
   * Get wallet transaction history
   */
  async getWalletHistory(walletId: string, page?: number, pageSize?: number) {
    const wallet = await this.databaseService.wallet.findUnique({
      where: { id: walletId },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    if (!wallet.providerWalletId) {
      throw new BadRequestException('Wallet does not have a provider wallet ID');
    }

    // Get history from provider
    const history = await this.providerService.getWalletHistory(
      wallet.providerWalletId,
      page,
      pageSize,
    );

    return history;
  }
}
