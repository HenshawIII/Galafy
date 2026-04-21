import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { KycTier } from '../users/dto/create-user-dto.js';
import { Tier1FaceStatus } from '../../generated/prisma/enums.js';

const DEFAULT_CURRENCY_ID = 'fd5e474d-bb42-4db1-ab74-e8d2a01047e9';

type Tier1AccountStatus = 'PENDING' | 'COMPLETED' | 'FAILED';

@Injectable()
export class ProviderCallbackService {
  private readonly logger = new Logger(ProviderCallbackService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  private isDevMode(): boolean {
    const nodeEnv = (process.env.NODE_ENV ?? 'development').toLowerCase();
    return nodeEnv !== 'production';
  }

  /**
   * Dev-safe policy:
   * In non-production environments, optionally treat "pending" callback status as completed.
   * This helps when sandbox callbacks are dummy and never move to Active.
   *
   * Enable with:
   * - ALAT_DEV_ACCEPT_PENDING_CALLBACK=true
   */
  private shouldAcceptPendingInDev(): boolean {
    if (!this.isDevMode()) return false;
    return (process.env.ALAT_DEV_ACCEPT_PENDING_CALLBACK ?? '').toLowerCase() === 'true';
  }

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
   *  - Drive tier1FaceStatus from callback outcome (COMPLETED on success, FAILED on failure)
   *  - Create wallet record only on successful callback
   *
   * Returns `{ received: true }` to avoid leaking existence.
   */
  async handleAccountCreationCallback(raw: any): Promise<{ received: true }> {
    // Accept provider payloads with extra fields; only depend on the documented subset.
    const providerCustomerId = raw?.data?.customerId?.trim();
    const email = raw?.data?.email?.trim().toLowerCase();
    const phoneNumber = raw?.data?.phoneNumber?.trim();
    const nuban = raw?.data?.nuban?.trim();
    const nubanName = raw?.data?.nubanName?.trim();
    const rawNubanStatus = raw?.data?.nubanStatus;

    // Quick sanity-check log to aid sandbox/debug diagnostics.
    this.logger.log(
      `Account creation callback received: email=${email ?? 'n/a'}, phone=${phoneNumber ?? 'n/a'}, nuban=${nuban ?? 'n/a'}, nubanStatus=${rawNubanStatus ?? 'n/a'}`,
    );

    if (!email || !phoneNumber || !nuban || !nubanName) {
      // Callback payload is malformed; we still avoid throwing to provider systems if possible.
      this.logger.warn(`Account creation callback: missing required fields (email/phone/nuban/nubanName).`);
      return { received: true };
    }

    const mappedStatus = this.mapNubanStatusToTier1AccountStatus(rawNubanStatus);
    const treatPendingAsCompleted = mappedStatus === 'PENDING' && this.shouldAcceptPendingInDev();
    const tier1AccountStatus: Tier1AccountStatus = treatPendingAsCompleted ? 'COMPLETED' : mappedStatus;
    if (treatPendingAsCompleted) {
      this.logger.warn(
        `Account creation callback (DEV POLICY): pending status accepted as COMPLETED for nuban=${nuban}. Disable with ALAT_DEV_ACCEPT_PENDING_CALLBACK=false`,
      );
    }
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

    let shouldSetProviderCustomerId = false;
    if (providerCustomerId) {
      const existingCustomerWithProviderId = await this.databaseService.customer.findFirst({
        where: {
          providerCustomerId,
          id: { not: customer.id },
        },
        select: { id: true },
      });

      if (existingCustomerWithProviderId) {
        this.logger.warn(
          `Account creation callback: provider customerId=${providerCustomerId} already belongs to customer=${existingCustomerWithProviderId.id}. Skipping providerCustomerId update for customer=${customer.id}.`,
        );
      } else {
        shouldSetProviderCustomerId = true;
      }
    }

    // Update tier1 account fields idempotently.
    await this.databaseService.customer.update({
      where: { id: customer.id },
      data: {
        providerCustomerId: shouldSetProviderCustomerId ? providerCustomerId : customer.providerCustomerId,
        tier1AccountStatus,
        tier1FaceStatus: tier1AccountStatus === 'COMPLETED' ? Tier1FaceStatus.COMPLETED : Tier1FaceStatus.FAILED,
        tier1Nuban: nuban,
        tier1NubanName: nubanName,
        tier1AccountCompletedAt: tier1AccountStatus === 'COMPLETED' ? now : null,
        tier1CompletedAt: tier1AccountStatus === 'COMPLETED' ? now : null,
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

