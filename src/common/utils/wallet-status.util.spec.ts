import { pickPrimaryWallet, resolveWalletStatus } from './wallet-status.util.js';

describe('wallet-status.util', () => {
  it('returns blocked when no wallet', () => {
    expect(resolveWalletStatus(null, null)).toBe('blocked');
  });

  it('returns blocked for AML or balance restriction', () => {
    expect(
      resolveWalletStatus({ isAmlRestricted: true, isBalanceRestricted: false }, { riskStatus: 'NORMAL' }),
    ).toBe('blocked');
    expect(
      resolveWalletStatus({ isAmlRestricted: false, isBalanceRestricted: true }, { riskStatus: 'NORMAL' }),
    ).toBe('blocked');
  });

  it('returns blocked for wallet freeze', () => {
    expect(
      resolveWalletStatus({ isAmlRestricted: false, isBalanceRestricted: false }, { riskStatus: 'HARD_FREEZE' }),
    ).toBe('blocked');
  });

  it('returns active when unrestricted', () => {
    expect(
      resolveWalletStatus({ isAmlRestricted: false, isBalanceRestricted: false }, { riskStatus: 'NORMAL' }),
    ).toBe('active');
  });

  it('picks default wallet', () => {
    const wallets = [
      { isDefault: false, createdAt: new Date('2020-01-01'), riskStatus: 'NORMAL' },
      { isDefault: true, createdAt: new Date('2021-01-01'), riskStatus: 'NORMAL' },
    ];
    expect(pickPrimaryWallet(wallets)?.isDefault).toBe(true);
  });
});
