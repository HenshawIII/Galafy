import { classifyTransactionNotification } from './provider-notification-classifier.util.js';

describe('provider-notification-classifier.util', () => {
  it('classifies COMM NIP debit', () => {
    expect(
      classifyTransactionNotification({
        transactionType: 'Debit',
        narration: 'COMM ALAT NIP TRANSFER TO Withdrawal',
      }),
    ).toBe('nip_commission');
  });

  it('classifies VAT NIP debit', () => {
    expect(
      classifyTransactionNotification({
        transactionType: 'Debit',
        narration: 'VAT ALAT NIP TRANSFER TO Withdrawal',
      }),
    ).toBe('nip_vat');
  });

  it('classifies NIP reversal credit', () => {
    expect(
      classifyTransactionNotification({
        transactionType: 'Credit',
        narration: 'ALAT NIP TRANSFER REVERSAL TO Withdrawal',
      }),
    ).toBe('nip_reversal');
  });

  it('classifies plain credit as bank inflow', () => {
    expect(
      classifyTransactionNotification({
        transactionType: 'Credit',
        narration: 'Transfer from John Doe',
      }),
    ).toBe('bank_inflow');
  });

  it('classifies unknown debit as unclassified', () => {
    expect(
      classifyTransactionNotification({
        transactionType: 'Debit',
        narration: 'Some other debit',
      }),
    ).toBe('unclassified_debit');
  });

  it('classifies inflow admin fee debit without treating as unclassified', () => {
    expect(
      classifyTransactionNotification({
        transactionType: 'Debit',
        narration: 'Admin funding fee FEE-784e8f5e060732d56e',
      }),
    ).toBe('inflow_admin_fee');
  });
});
