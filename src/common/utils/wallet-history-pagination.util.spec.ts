import { sliceWalletHistoryPageNewestFirst } from './wallet-history-pagination.util.js';

describe('sliceWalletHistoryPageNewestFirst', () => {
  const rows = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  it('page 1 returns the newest items first', () => {
    expect(sliceWalletHistoryPageNewestFirst(rows, 1, 4)).toEqual([10, 9, 8, 7]);
  });

  it('page 2 returns the next older batch newest-first', () => {
    expect(sliceWalletHistoryPageNewestFirst(rows, 2, 4)).toEqual([6, 5, 4, 3]);
  });

  it('last page returns remaining oldest items newest-first', () => {
    expect(sliceWalletHistoryPageNewestFirst(rows, 3, 4)).toEqual([2, 1]);
  });

  it('single page when fewer rows than limit', () => {
    expect(sliceWalletHistoryPageNewestFirst([1, 2, 3], 1, 20)).toEqual([3, 2, 1]);
  });

  it('returns empty array for empty input', () => {
    expect(sliceWalletHistoryPageNewestFirst([], 1, 20)).toEqual([]);
  });
});
