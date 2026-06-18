export type BankAccountNameMatchResult =
  | { ok: true }
  | { ok: false; reason: string };

function normalizeName(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[.,\-']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(value: string): string[] {
  const normalized = normalizeName(value);
  if (!normalized) return [];
  return normalized.split(' ');
}

export function bankAccountNameMatchesTier1(
  tier1NubanName: string | null | undefined,
  accountName: string | null | undefined,
): BankAccountNameMatchResult {
  const tier1 = tier1NubanName?.trim();
  if (!tier1) {
    return { ok: false, reason: 'Tier 1 KYC required before adding a bank account' };
  }

  const account = accountName?.trim();
  if (!account) {
    return { ok: false, reason: 'Account name is required' };
  }

  const tier1Tokens = tokenize(tier1);
  const accountTokens = tokenize(account);

  if (tier1Tokens.length === 0) {
    return { ok: false, reason: 'Tier 1 KYC required before adding a bank account' };
  }

  if (accountTokens.length === 0) {
    return { ok: false, reason: 'Account name is required' };
  }

  const requiredTokens =
    tier1Tokens.length === 1 ? [tier1Tokens[0]] : [tier1Tokens[0], tier1Tokens[tier1Tokens.length - 1]];

  const accountTokenSet = new Set(accountTokens);
  const missing = requiredTokens.filter((token) => !accountTokenSet.has(token));

  if (missing.length > 0) {
    return {
      ok: false,
      reason: 'Bank account name does not match your verified identity',
    };
  }

  return { ok: true };
}

export function assertBankAccountNameMatchesTier1(
  tier1NubanName: string | null | undefined,
  accountName: string | null | undefined,
): void {
  const result = bankAccountNameMatchesTier1(tier1NubanName, accountName);
  if (!result.ok) {
    throw new Error(result.reason);
  }
}
