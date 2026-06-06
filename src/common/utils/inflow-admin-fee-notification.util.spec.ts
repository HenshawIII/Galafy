import {
  isInflowAdminFeeDebitNarration,
  parseFeeSweepReferenceFromNotification,
  parseFeeSweepReferenceFromText,
} from './inflow-admin-fee-notification.util.js';

describe('inflow-admin-fee-notification.util', () => {
  it('detects admin funding fee narration', () => {
    expect(isInflowAdminFeeDebitNarration('Admin funding fee FEE-784e8f5e060732d56e')).toBe(true);
    expect(isInflowAdminFeeDebitNarration('COMM ALAT NIP TRANSFER TO Withdrawal')).toBe(false);
  });

  it('parses FEE reference from narration', () => {
    expect(parseFeeSweepReferenceFromText('Admin funding fee FEE-abc123def456')).toBe('FEE-abc123def456');
  });

  it('parses FEE reference from raw payload fields', () => {
    expect(
      parseFeeSweepReferenceFromNotification({
        narration: 'Admin funding fee FEE-deadbeef',
        reference: 'NOTIF-xyz',
      }),
    ).toBe('FEE-deadbeef');
  });
});
