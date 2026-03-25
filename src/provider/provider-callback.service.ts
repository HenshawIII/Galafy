import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { KycTier } from '../users/dto/create-user-dto.js';

const DEFAULT_CURRENCY_ID = 'fd5e474d-bb42-4db1-ab74-e8d2a01047e9';

type Tier1AccountStatus = 'PENDING' | 'COMPLETED' | 'FAILED';

@Injectable()
export class ProviderCallbackService {
  private readonly logger = new Logger(ProviderCallbackService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  private mapNubanStatusToTier1AccountStatus(nubanStatus: string | null | undefined): Tier1AccountStatus {
    const normalized = (nubanStatus ?? '').toLowerCase().trim();

    // Provider docs commonly return "Active" when wallet provisioning is successful.
    if (normalized === 'active') return 'COMPLETED';
    if (normalized === 'pending') return 'PENDING';

    // Unknown statuses are treated as failure for now to prevent stuck accounts.
    return 'FAILED';
  }

  /**
   * Provider calls this when the account (nuban) is created.
   * We must:
   *  - Map payload to Customer using `phoneNumber + email`
   *  - Idempotently update tier1 account fields
   *  - Create wallet record only on successful callback
   *
   * Returns `{ received: true }` to avoid leaking existence.
   */
  async handleAccountCreationCallback(raw: any): Promise<{ received: true }> {
    // Accept provider payloads with extra fields; only depend on the documented subset.
    const email = raw?.data?.email?.trim().toLowerCase();
    const phoneNumber = raw?.data?.phoneNumber?.trim();
    const nuban = raw?.data?.nuban?.trim();
    const nubanName = raw?.data?.nubanName?.trim();

    if (!email || !phoneNumber || !nuban || !nubanName) {
      // Callback payload is malformed; we still avoid throwing to provider systems if possible.
      this.logger.warn(`Account creation callback: missing required fields (email/phone/nuban/nubanName).`);
      return { received: true };
    }

    const tier1AccountStatus = this.mapNubanStatusToTier1AccountStatus(raw?.data?.nubanStatus);
    const now = new Date();

    // Map by phone + email (not providerCustomerId) as per your docs.
    const customer = await this.databaseService.customer.findFirst({
      where: {
        mobileNumber: phoneNumber,
        emailAddress: { equals: email, mode: 'insensitive' },
      },
    });

    if (!customer) {
      // Don't leak whether we have the customer; provider may retry.
      this.logger.warn(
        `Account creation callback: no local customer found for phone=${phoneNumber}, email=${email}`,
      );
      return { received: true };
    }

    // Update tier1 account fields idempotently.
    await this.databaseService.customer.update({
      where: { id: customer.id },
      data: {
        tier1AccountStatus,
        tier1Nuban: nuban,
        tier1NubanName: nubanName,
        tier1AccountCompletedAt: tier1AccountStatus === 'COMPLETED' ? now : null,
      },
    });

    // Create/update wallet only when tier1 is successful.
    if (tier1AccountStatus !== 'COMPLETED') return { received: true };

    // If Tier1 didn't succeed for the customer, avoid creating a wallet.
    // (Wallet creation is logically downstream of successful Tier1.)
    if (customer.tier !== KycTier.Tier_1) {
      this.logger.warn(
        `Account creation callback: customer tier is not Tier_1 (customer=${customer.id}, tier=${customer.tier}). Skipping wallet creation.`,
      );
      return { received: true };
    }

    // Idempotently upsert by (customerId + virtualAccountNumber).
    // We don't have providerWalletId yet because the callback doesn't include it.
    const existingWallet = await this.databaseService.wallet.findFirst({
      where: { customerId: customer.id, virtualAccountNumber: nuban },
    });

    if (existingWallet) {
      // Update local wallet fields with callback-provided data.
      await this.databaseService.wallet.update({
        where: { id: existingWallet.id },
        data: {
          name: nubanName,
          mobNum: phoneNumber,
          virtualAccountNumber: nuban,
          // Bank code/name not present in callback docs; keep as-is (usually null).
          virtualBankCode: existingWallet.virtualBankCode,
          virtualBankName: existingWallet.virtualBankName,
          isDefault: existingWallet.isDefault ?? true,
        },
      });
      return { received: true };
    }

    await this.databaseService.wallet.create({
      data: {
        customerId: customer.id,
        currencyId: DEFAULT_CURRENCY_ID,
        availableBalance: 0,
        ledgerBalance: 0,
        isInternal: false,
        isDefault: true,
        name: nubanName,
        mobNum: phoneNumber,
        virtualAccountNumber: nuban,
        // Callback docs do not include bankCode/bankName; wallet fields remain optional.
      },
    });

    return { received: true };
  }
}

