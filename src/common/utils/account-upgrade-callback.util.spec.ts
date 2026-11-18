import {
  classifyAccountUpgradeOutcome,
  extractAccountUpgradeCallbackFields,
} from './account-upgrade-callback.util.js';

describe('account-upgrade-callback.util', () => {
  describe('classifyAccountUpgradeOutcome', () => {
    it('classifies success from partner success title/message', () => {
      expect(
        classifyAccountUpgradeOutcome(
          'Account Upgraded Successfully',
          'Address has been verified and account upgraded successfully for the account with details below',
        ),
      ).toBe('success');
    });

    it('classifies failure from partner failure title/message', () => {
      expect(
        classifyAccountUpgradeOutcome(
          'Address verification failed',
          'Address verification failed for customer with details below',
        ),
      ).toBe('failure');
    });

    it('prefers failure when both signals could match', () => {
      expect(
        classifyAccountUpgradeOutcome(
          'Address verification failed',
          'Address has been verified previously but failed now',
        ),
      ).toBe('failure');
    });

    it('returns unknown for unrelated copy', () => {
      expect(classifyAccountUpgradeOutcome('Hello', 'World')).toBe('unknown');
      expect(classifyAccountUpgradeOutcome(null, null)).toBe('unknown');
    });
  });

  describe('extractAccountUpgradeCallbackFields', () => {
    it('extracts documented fields from raw payload', () => {
      const fields = extractAccountUpgradeCallbackFields({
        title: 'Account Upgraded Successfully',
        message: 'Address has been verified and account upgraded successfully for the account with details below',
        data: {
          email: 'User@Alat.ng',
          nuban: '0447131004',
          nubanName: 'JANE DOE',
          type: 1,
          nubanStatus: 'Active',
          phoneNumber: '07011223344',
        },
        requestType: 2,
      });

      expect(fields).toEqual({
        title: 'Account Upgraded Successfully',
        message:
          'Address has been verified and account upgraded successfully for the account with details below',
        email: 'user@alat.ng',
        nuban: '0447131004',
        nubanName: 'JANE DOE',
        phoneNumber: '07011223344',
        nubanStatus: 'Active',
        requestType: 2,
      });
    });

    it('tolerates missing data', () => {
      expect(extractAccountUpgradeCallbackFields({})).toEqual({
        title: null,
        message: null,
        email: null,
        nuban: null,
        nubanName: null,
        phoneNumber: null,
        nubanStatus: null,
        requestType: null,
      });
    });
  });
});
