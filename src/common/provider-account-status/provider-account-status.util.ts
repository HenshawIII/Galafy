export type NormalizedProviderAccountStatus = 'ACTIVE' | 'INACTIVE' | null;

export type PartnerAccountStatusSnapshot = {
  accountNumber: string;
  accountName: string | null;
  accountTier: string | null;
  accountStatus: NormalizedProviderAccountStatus;
  restrictionStatus: string | null;
};

export function normalizeProviderAccountStatus(raw: string | null | undefined): NormalizedProviderAccountStatus {
  const normalized = raw?.trim().toUpperCase();
  if (!normalized) {
    return null;
  }
  if (normalized === 'ACTIVE') {
    return 'ACTIVE';
  }
  if (normalized === 'INACTIVE') {
    return 'INACTIVE';
  }
  return null;
}

export function isProviderOutboundBlocked(accountStatus: NormalizedProviderAccountStatus): boolean {
  return accountStatus !== 'ACTIVE';
}
