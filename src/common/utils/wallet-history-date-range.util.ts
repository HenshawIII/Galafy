/** Format a Date as YYYY-MM-DD (UTC calendar date), matching history range parsing. */
export function formatUtcDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function resolveWalletHistoryDateRange(
  startDate: string | undefined,
  endDate: string | undefined,
  walletCreatedAt: Date,
): { startDate: string; endDate: string } {
  const resolvedEnd = endDate?.trim() || formatUtcDateOnly(new Date());
  const resolvedStart = startDate?.trim() || formatUtcDateOnly(walletCreatedAt);

  if (resolvedStart > resolvedEnd) {
    return { startDate: resolvedEnd, endDate: resolvedEnd };
  }

  return { startDate: resolvedStart, endDate: resolvedEnd };
}
