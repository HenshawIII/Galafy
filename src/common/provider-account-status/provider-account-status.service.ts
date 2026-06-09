import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import { ProviderService } from '../../provider/provider.service.js';
import { resolvePartnershipAccountNumber } from '../utils/customer-account.util.js';
import {
  isProviderOutboundBlocked,
  normalizeProviderAccountStatus,
  PartnerAccountStatusSnapshot,
} from './provider-account-status.util.js';

@Injectable()
export class ProviderAccountStatusService {
  private readonly logger = new Logger(ProviderAccountStatusService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly providerService: ProviderService,
  ) {}

  async fetchPartnerAccountStatus(accountNumber: string): Promise<PartnerAccountStatusSnapshot> {
    const res = await this.providerService.getPartnerAccountKycStatus(accountNumber);
    const data = res.data;
    const resolvedAccountNumber = data?.accountNumber?.trim() || accountNumber;

    return {
      accountNumber: resolvedAccountNumber,
      accountName: data?.accountName?.trim() || null,
      accountTier: data?.accountTier?.trim() || null,
      accountStatus: normalizeProviderAccountStatus(data?.accountStatus),
      restrictionStatus: data?.restrictionStatus?.trim() || null,
    };
  }

  async fetchPartnerAccountStatusForCustomer(customerId: string): Promise<PartnerAccountStatusSnapshot> {
    const customer = await this.databaseService.customer.findUnique({
      where: { id: customerId },
      select: {
        tier1Nuban: true,
        wallets: {
          select: { virtualAccountNumber: true, isDefault: true },
        },
      },
    });

    if (!customer) {
      throw new ForbiddenException('Customer not found');
    }

    const accountNumber = resolvePartnershipAccountNumber(customer);
    return this.fetchPartnerAccountStatus(accountNumber);
  }

  async assertProviderAllowsOutbound(customerId: string): Promise<void> {
    try {
      const status = await this.fetchPartnerAccountStatusForCustomer(customerId);
      if (isProviderOutboundBlocked(status.accountStatus)) {
        throw new ForbiddenException(
          'Your wallet account is inactive at the bank. Outbound transfers are not available until your account is restored. Contact support.',
        );
      }
    } catch (error: unknown) {
      if (error instanceof ForbiddenException) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Provider account status check failed (fail-open): customerId=${customerId} message=${message}`,
      );
    }
  }
}
