import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import { config } from 'dotenv';
config();

/**
 * Service to manage the central Admin/Organization wallet
 * This is a SINGLE wallet shared across all users for fee collection
 * The ORGANIZATION_WALLET env variable contains the virtual account number directly
 */
@Injectable()
export class OrganizationWalletService {
  private readonly logger = new Logger(OrganizationWalletService.name);
  private readonly adminWalletAccountNumber: string;
  private cachedWallet: any = null;
  private cacheTimestamp: number = 0;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache

  constructor(private readonly databaseService: DatabaseService) {
    // ORGANIZATION_WALLET is the virtual account number itself - no lookup needed
    this.adminWalletAccountNumber = process.env.ORGANIZATION_WALLET || '';

    if (!this.adminWalletAccountNumber) {
      this.logger.warn('ORGANIZATION_WALLET environment variable is not set. Admin wallet operations will fail.');
    } else {
      this.logger.log(`Admin wallet account number configured: ${this.adminWalletAccountNumber}`);
    }
  }

  /**
   * Get the admin wallet virtual account number
   * This is the account number itself from the environment variable
   *
   * @returns The admin wallet virtual account number (string)
   */
  getAdminWalletAccountNumber(): string {
    if (!this.adminWalletAccountNumber) {
      throw new NotFoundException(
        'Admin wallet account number is not configured. Please set ORGANIZATION_WALLET in environment variables.',
      );
    }
    return this.adminWalletAccountNumber;
  }

  /**
   * Get the admin wallet record from database (if it exists)
   * This is used for creating Transaction records and updating balances in our ledger
   * The wallet may not exist in our database - it's managed by the provider
   *
   * @returns The admin wallet record if found, null otherwise
   */
  async getAdminWalletRecord() {
    if (!this.adminWalletAccountNumber) {
      throw new NotFoundException('Admin wallet account number is not configured.');
    }

    // Return cached wallet if still valid
    const now = Date.now();
    if (this.cachedWallet && now - this.cacheTimestamp < this.CACHE_TTL) {
      return this.cachedWallet;
    }

    // Try to find wallet in our database
    const wallet = await this.databaseService.wallet.findFirst({
      where: { virtualAccountNumber: this.adminWalletAccountNumber },
      include: {
        customer: true,
      },
    });

    // Update cache (even if null)
    this.cachedWallet = wallet;
    this.cacheTimestamp = now;

    // if (!wallet) {
    //   this.logger.warn(
    //     `Admin wallet record not found in database for account: ${this.adminWalletAccountNumber}. ` +
    //     `This is okay - the wallet is managed by the provider. We'll use the account number directly for transfers.`,
    //   );
    // } else {
    //   this.logger.log(`Admin wallet record found: ${wallet.id} (Account: ${this.adminWalletAccountNumber})`);
    // }

    return wallet;
  }

  /**
   * Get organization wallet (alias for getAdminWalletRecord for backward compatibility)
   * @deprecated Use getAdminWalletAccountNumber() for account number or getAdminWalletRecord() for DB record
   */
  async getOrganizationWallet() {
    return this.getAdminWalletRecord();
  }

  /**
   * Clear the cached wallet (useful for testing or after wallet updates)
   */
  clearCache() {
    this.cachedWallet = null;
    this.cacheTimestamp = 0;
    this.logger.log('Admin wallet cache cleared');
  }
}
