export type AccountRestrictionKind = 'aml' | 'balance' | 'risk_soft' | 'risk_hard';

export type AccountRestrictionEmailCopy = {
  subject: string;
  textIntro: string;
  htmlIntro: string;
  warningTitle: string;
  warningBody: string;
  bullets: string[];
  signOffTeam: string;
};

export function getAccountRestrictionEmailCopy(kind: AccountRestrictionKind): AccountRestrictionEmailCopy {
  switch (kind) {
    case 'balance':
      return {
        subject: 'Important: Balance Limit Reached - Galafy',
        textIntro:
          'Your Galafy account has reached the maximum wallet balance allowed for your current KYC tier. Outbound transfers are restricted until your balance is within your tier limit or you upgrade your KYC tier.',
        htmlIntro:
          'We are writing to inform you that your <strong>Galafy account has reached its maximum wallet balance</strong> for your current KYC tier. <strong>Outbound transfers are restricted</strong> until your balance is within the allowed limit or you complete a higher KYC tier.',
        warningTitle: 'Balance limit restriction',
        warningBody:
          'Your wallet balance exceeds the maximum cumulative balance allowed for your KYC tier. You can still receive funds, but payouts and other outbound transfers are blocked.',
        bullets: [
          'Outbound transfers and payouts are temporarily unavailable',
          'Inbound transfers and funding may still be accepted',
          'Reduce your balance or upgrade your KYC tier to restore outbound access',
        ],
        signOffTeam: 'The Galafy Team',
      };
    case 'risk_soft':
      return {
        subject: 'Important: Wallet Activity Restricted - Galafy',
        textIntro:
          'Your Galafy wallet has been temporarily restricted because recent activity triggered our automated security risk controls. Outbound transfers, including payouts, are blocked while we review activity patterns.',
        htmlIntro:
          'We are writing to inform you that your <strong>Galafy wallet has been temporarily restricted</strong> because recent activity triggered our automated security risk controls.',
        warningTitle: 'Temporary wallet restriction',
        warningBody:
          'Your wallet risk score exceeded our soft-freeze threshold. This is an automated security measure to protect your account.',
        bullets: [
          'Payouts and outbound transfers are temporarily blocked',
          'Inbound transfers may still be processed',
          'Restrictions may be lifted automatically when activity returns to normal',
        ],
        signOffTeam: 'The Galafy Security Team',
      };
    case 'risk_hard':
      return {
        subject: 'Important: Wallet Restricted - Galafy',
        textIntro:
          'Your Galafy wallet has been restricted due to a high automated security risk score. Most wallet activity, including payouts, is blocked until our team reviews your account.',
        htmlIntro:
          'We are writing to inform you that your <strong>Galafy wallet has been restricted</strong> due to a high automated security risk score.',
        warningTitle: 'Wallet security restriction',
        warningBody:
          'Your wallet risk score exceeded our hard-freeze threshold. Outbound transfers and payouts are blocked until the restriction is reviewed.',
        bullets: [
          'Payouts and outbound transfers are blocked',
          'Your wallet is under automated security review',
          'Contact support if you believe this is an error',
        ],
        signOffTeam: 'The Galafy Security Team',
      };
    case 'aml':
    default:
      return {
        subject: 'Important: Your Account Has Been Restricted - Galafy',
        textIntro:
          'Your Galafy account has been restricted due to compliance and security reasons.',
        htmlIntro:
          'We are writing to inform you that your <strong>Galafy account has been restricted</strong> due to compliance and security reasons.',
        warningTitle: 'Account restriction',
        warningBody:
          'Your account has been flagged for review under our Anti-Money Laundering (AML) compliance policies.',
        bullets: [
          'Certain account features may be temporarily unavailable',
          'Withdrawal and transaction capabilities may be limited',
          'Your account is under review by our compliance team',
        ],
        signOffTeam: 'The Galafy Compliance Team',
      };
  }
}
