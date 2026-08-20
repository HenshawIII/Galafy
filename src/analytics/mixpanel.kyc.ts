export function kycTierNumber(tier: string | null | undefined): number {
  if (tier === 'Tier_1') return 1;
  if (tier === 'Tier_2') return 2;
  if (tier === 'Tier_3') return 3;
  return 0;
}
