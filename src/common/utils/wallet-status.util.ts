export type WalletStatus = 'active' | 'blocked';

type CustomerRestrictionFields = {
  isAmlRestricted?: boolean;
  isBalanceRestricted?: boolean;
} | null;

type WalletRow = {
  riskStatus?: string | null;
  isDefault?: boolean;
  createdAt?: Date;
};

const FREEZE_STATUSES = new Set(['SOFT_FREEZE', 'HARD_FREEZE']);

export function pickPrimaryWallet(wallets: WalletRow[] | null | undefined): WalletRow | null {
  if (!wallets?.length) {
    return null;
  }
  const defaultWallet = wallets.find((w) => w.isDefault === true);
  if (defaultWallet) {
    return defaultWallet;
  }
  return [...wallets].sort((a, b) => {
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return aTime - bTime;
  })[0];
}

export function resolveInternalWalletStatus(
  customer: CustomerRestrictionFields,
  wallet: WalletRow | null,
): WalletStatus {
  return resolveWalletStatus(customer, wallet);
}

export function resolveWalletStatus(customer: CustomerRestrictionFields, wallet: WalletRow | null): WalletStatus {
  if (!wallet) {
    return 'blocked';
  }
  if (customer?.isAmlRestricted || customer?.isBalanceRestricted) {
    return 'blocked';
  }
  const risk = wallet.riskStatus?.trim().toUpperCase();
  if (risk && FREEZE_STATUSES.has(risk)) {
    return 'blocked';
  }
  return 'active';
}
