/**
 * Slice chronologically sorted rows (oldest first) for newest-first pagination.
 * Page 1 returns the latest `pageSize` transactions, each page ordered newest → oldest.
 */
export function sliceWalletHistoryPageNewestFirst<T>(rows: T[], page: number, pageSize: number): T[] {
  const total = rows.length;
  if (total === 0) {
    return [];
  }

  const limit = pageSize > 0 ? pageSize : 20;
  const p = page > 0 ? page : 1;
  const endIndex = Math.max(0, total - (p - 1) * limit);
  const startIndex = Math.max(0, endIndex - limit);
  return rows.slice(startIndex, endIndex).reverse();
}
