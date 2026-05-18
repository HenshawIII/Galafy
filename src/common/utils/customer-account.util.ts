import { BadRequestException } from '@nestjs/common';

type WalletLike = { virtualAccountNumber?: string | null; isDefault?: boolean | null };

type CustomerWithAccountSources = {
  tier1Nuban?: string | null;
  wallets?: WalletLike[];
};

/**
 * Partnership virtual account for ALAT account-upgrade APIs.
 * Priority: tier1Nuban (from account-creation callback) then default wallet VA.
 */
export function resolvePartnershipAccountNumber(customer: CustomerWithAccountSources): string {
  const fromNuban = customer.tier1Nuban?.trim();
  if (fromNuban) return fromNuban;

  const wallets = customer.wallets ?? [];
  const defaultWallet = wallets.find((w) => w.isDefault && w.virtualAccountNumber?.trim());
  const anyWallet = wallets.find((w) => w.virtualAccountNumber?.trim());
  const accountNumber = (defaultWallet ?? anyWallet)?.virtualAccountNumber?.trim();
  if (accountNumber) return accountNumber;

  throw new BadRequestException(
    'Wallet account not found. Complete Tier 1 account setup before upgrading.',
  );
}
