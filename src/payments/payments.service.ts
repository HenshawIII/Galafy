import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { ProviderService } from '../provider/provider.service.js';
import {
  GetWalletByIdDto,
  GetOrganizationTransactionsDto,
  WalletToWalletRequeryDto,
  ReverseTransactionDto,
  CloseWalletDto,
  RestrictByAccountIdDto,
  BankAccountNameEnquiryDto,
  InterBankTransferDto,
  TransactionStatusRequeryDto,
} from './dto/payments.dto.js';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly providerService: ProviderService,
  ) {}

  /**
   * Get wallet by ID from provider
   */
  async getWalletById(getWalletByIdDto: GetWalletByIdDto) {
    try {
      const walletData = await this.providerService.getWalletById(getWalletByIdDto.walletId);

      // Optionally sync with local database
      const localWallet = await this.databaseService.wallet.findUnique({
        where: { providerWalletId: getWalletByIdDto.walletId },
        include: { customer: { include: { user: true } } },
      });

      return {
        ...walletData,
        localWallet,
      };
    } catch (error) {
      this.logger.error(`Failed to get wallet by ID: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get organization wallet transactions
   */
  async getOrganizationTransactions(query: GetOrganizationTransactionsDto) {
    try {
      const transactions = await this.providerService.getOrganizationWalletTransactions(
        query.page,
        query.pageSize,
      );

      return transactions;
    } catch (error) {
      this.logger.error(`Failed to get organization transactions: ${error.message}`);
      throw error;
    }
  }

  /**
   * Requery wallet to wallet transaction status
   */
  async walletToWalletRequery(requeryDto: WalletToWalletRequeryDto) {
    try {
      const result = await this.providerService.walletToWalletRequery(requeryDto.transactionReference);

      // Optionally update local transaction status if we have it
      const localTransaction = await this.databaseService.transaction.findUnique({
        where: { reference: requeryDto.transactionReference },
      });

      if (localTransaction && result.success) {
        // Update transaction status based on result
        await this.databaseService.transaction.update({
          where: { id: localTransaction.id },
          data: {
            status: result.code === '200' ? 'SUCCESS' : 'FAILED',
          },
        });
      }

      return result;
    } catch (error) {
      this.logger.error(`Failed to requery wallet to wallet transaction: ${error.message}`);
      throw error;
    }
  }

  /**
   * Reverse a transaction
   */
  async reverseTransaction(reverseDto: ReverseTransactionDto) {
    try {
      // Check if transaction exists locally
      const localTransaction = await this.databaseService.transaction.findUnique({
        where: { reference: reverseDto.transactionReference },
        include: { wallet: true },
      });

      if (!localTransaction) {
        throw new NotFoundException('Transaction not found');
      }

      const result = await this.providerService.reverseTransaction(reverseDto.transactionReference);

      if (result.success) {
        // Update local transaction status
        await this.databaseService.transaction.update({
          where: { id: localTransaction.id },
          data: {
            status: 'REVERSED',
          },
        });

        // Optionally create a reversal transaction record
        // This depends on your business logic
      }

      return result;
    } catch (error) {
      this.logger.error(`Failed to reverse transaction: ${error.message}`);
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(`Failed to reverse transaction: ${error.message}`);
    }
  }

  /**
   * Close a wallet
   */
  async closeWallet(closeWalletDto: CloseWalletDto) {
    try {
      // Find wallet by account number
      const localWallet = await this.databaseService.wallet.findFirst({
        where: { virtualAccountNumber: closeWalletDto.accountNumber },
        include: { customer: { include: { user: true } } },
      });

      if (!localWallet) {
        throw new NotFoundException('Wallet not found');
      }

      const result = await this.providerService.closeWallet(
        closeWalletDto.accountNumber,
        closeWalletDto.accountClosureReasonId,
        closeWalletDto.tellerId,
        closeWalletDto.closeOrDelete,
        closeWalletDto.customerOrAccount,
      );

      // Note: You might want to mark the wallet as closed in your database
      // This depends on your business requirements

      return result;
    } catch (error) {
      this.logger.error(`Failed to close wallet: ${error.message}`);
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(`Failed to close wallet: ${error.message}`);
    }
  }

  /**
   * Restrict wallet by account ID
   */
  async restrictByAccountId(restrictDto: RestrictByAccountIdDto) {
    try {
      // Find wallet by account ID (assuming accountId maps to virtualAccountNumber or providerWalletId)
      const localWallet = await this.databaseService.wallet.findFirst({
        where: {
          OR: [
            { virtualAccountNumber: restrictDto.accountId },
            { providerWalletId: restrictDto.accountId },
          ],
        },
        include: { customer: { include: { user: true } } },
      });

      if (!localWallet) {
        throw new NotFoundException('Wallet not found');
      }

      const result = await this.providerService.restrictByAccountId(
        restrictDto.accountId,
        restrictDto.restrictionType,
      );

      // Optionally update local wallet restriction
      if (result.success && localWallet.providerWalletId) {
        await this.databaseService.wallet.update({
          where: { id: localWallet.id },
          data: {
            walletRestrictionId: restrictDto.restrictionType,
          },
        });
      }

      return result;
    } catch (error) {
      this.logger.error(`Failed to restrict wallet: ${error.message}`);
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(`Failed to restrict wallet: ${error.message}`);
    }
  }

  // ==================== PAYOUT OPERATIONS ====================

  /**
   * Get banks available for payouts
   */
  async getBanks() {
    try {
      const banks = await this.providerService.getBanks();
      return banks;
    } catch (error) {
      this.logger.error(`Failed to get banks: ${error.message}`);
      throw error;
    }
  }

  /**
   * Bank account name enquiry
   */
  async bankAccountNameEnquiry(enquiryDto: BankAccountNameEnquiryDto) {
    try {
      const result = await this.providerService.bankAccountNameEnquiry(
        enquiryDto.bankCode,
        enquiryDto.accountNumber,
      );

      return result;
    } catch (error) {
      this.logger.error(`Failed to perform name enquiry: ${error.message}`);
      throw new BadRequestException(`Name enquiry failed: ${error.message}`);
    }
  }

  /**
   * Inter bank transfer (payout)
   */
  async interBankTransfer(transferDto: InterBankTransferDto) {
    try {
      // Find the source wallet by account number
      const sourceWallet = await this.databaseService.wallet.findFirst({
        where: { virtualAccountNumber: transferDto.sourceAccountNumber },
        include: { customer: { include: { user: true } } },
      });

      if (!sourceWallet) {
        throw new NotFoundException('Source wallet not found');
      }

      // Call provider to initiate transfer
      const result = await this.providerService.interBankTransfer({
        destinationBankCode: transferDto.destinationBankCode,
        destinationAccountNumber: transferDto.destinationAccountNumber,
        destinationAccountName: transferDto.destinationAccountName,
        sourceAccountNumber: transferDto.sourceAccountNumber,
        sourceAccountName: transferDto.sourceAccountName,
        remarks: transferDto.remarks,
        amount: transferDto.amount,
        currencyId: transferDto.currencyId,
        customerTransactionReference: transferDto.customerTransactionReference,
        webhookUrl: transferDto.webhookUrl,
      });

      // Create payout transaction record in local database
      // First, find or create bank account record
      let bankAccount = await this.databaseService.bankAccount.findFirst({
        where: {
          customerId: sourceWallet.customerId,
          accountNumber: transferDto.destinationAccountNumber,
          bankCode: transferDto.destinationBankCode,
        },
      });

      if (!bankAccount) {
        bankAccount = await this.databaseService.bankAccount.create({
          data: {
            customerId: sourceWallet.customerId,
            accountName: transferDto.destinationAccountName,
            accountNumber: transferDto.destinationAccountNumber,
            bankCode: transferDto.destinationBankCode,
            bankName: transferDto.destinationBankCode, // You might want to look this up
            isVerified: true, // Verified via name enquiry
          },
        });
      }

      // Create transaction record
      const transaction = await this.databaseService.transaction.create({
        data: {
          walletId: sourceWallet.id,
          type: 'PAYOUT',
          direction: 'DEBIT',
          status: 'PENDING',
          amount: transferDto.amount,
          currencyId: transferDto.currencyId,
          reference: transferDto.customerTransactionReference,
          externalReference: result.transactionRef,
          narration: transferDto.remarks,
        },
      });

      // Create payout transaction record
      const payoutTransaction = await this.databaseService.payoutTransaction.create({
        data: {
          walletId: sourceWallet.id,
          bankAccountId: bankAccount.id,
          amount: transferDto.amount,
          fee: 0, // You might want to calculate fees
          status: 'PENDING',
          transactionId: transaction.id,
          providerTransactionRef: result.transactionRef,
        },
      });

      return {
        ...result,
        payoutTransactionId: payoutTransaction.id,
        transactionId: transaction.id,
      };
    } catch (error) {
      this.logger.error(`Failed to initiate inter bank transfer: ${error.message}`);
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(`Inter bank transfer failed: ${error.message}`);
    }
  }

  /**
   * Transaction status re-query
   */
  async transactionStatusRequery(requeryDto: TransactionStatusRequeryDto) {
    try {
      // Find local payout transaction by provider reference
      const payoutTransaction = await this.databaseService.payoutTransaction.findUnique({
        where: { providerTransactionRef: requeryDto.transactionRef },
        include: {
          transaction: true,
          wallet: { include: { customer: { include: { user: true } } } },
        },
      });

      const result = await this.providerService.transactionStatusRequery(requeryDto.transactionRef);

      // Update local transaction status based on result
      if (payoutTransaction) {
        let status: 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED' | 'REVERSED' = 'PENDING';
        let payoutStatus: 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED' | 'REJECTED' | 'REVERSED' =
          'PENDING';

        // Map provider status to our enums
        if (result.status === 'success' || result.status === 'completed') {
          status = 'SUCCESS';
          payoutStatus = 'SUCCESS';
        } else if (result.status === 'failed' || result.status === 'error') {
          status = 'FAILED';
          payoutStatus = 'FAILED';
        } else if (result.status === 'processing' || result.status === 'pending') {
          status = 'PROCESSING';
          payoutStatus = 'PROCESSING';
        } else if (result.status === 'reversed') {
          status = 'REVERSED';
          payoutStatus = 'REVERSED';
        }

        await this.databaseService.transaction.update({
          where: { id: payoutTransaction.transactionId },
          data: { status },
        });

        await this.databaseService.payoutTransaction.update({
          where: { id: payoutTransaction.id },
          data: { status: payoutStatus },
        });
      }

      return {
        ...result,
        localTransaction: payoutTransaction,
      };
    } catch (error) {
      this.logger.error(`Failed to requery transaction status: ${error.message}`);
      throw new BadRequestException(`Transaction status requery failed: ${error.message}`);
    }
  }
}
