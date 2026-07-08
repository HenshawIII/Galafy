import {
  buildSprayPushNotification,
  getSprayNotificationContext,
  isSprayDebitTransaction,
} from './spray-notification.util.js';

describe('spray-notification.util', () => {
  it('buildSprayPushNotification uses spray-specific types', () => {
    const payload = buildSprayPushNotification({
      kind: 'SPRAY_SENT',
      amountFormatted: '1000.00',
      transactionReference: 'SPRAY-abc',
      eventId: 'event-1',
      eventTitle: 'Birthday Party',
    });

    expect(payload.data.type).toBe('SPRAY_SENT');
    expect(payload.data.legacyType).toBeUndefined();
    expect(payload.data.eventId).toBe('event-1');
    expect(payload.notification.title).toBe('Spray sent');
  });

  it('buildSprayPushNotification marks failed sprays distinctly', () => {
    const payload = buildSprayPushNotification({
      kind: 'SPRAY_FAILED',
      amountFormatted: '500.00',
      transactionReference: 'SPRAY-fail',
      eventTitle: 'Live Event',
    });

    expect(payload.data.type).toBe('SPRAY_FAILED');
    expect(payload.notification.title).toBe('Spray failed');
  });

  it('isSprayDebitTransaction detects spray metadata', () => {
    expect(
      isSprayDebitTransaction({
        type: 'PAYOUT',
        metadata: { eventSpray: true },
      }),
    ).toBe(true);
    expect(
      isSprayDebitTransaction({
        type: 'SPRAY',
        metadata: {},
      }),
    ).toBe(true);
    expect(
      isSprayDebitTransaction({
        type: 'PAYOUT',
        metadata: {},
      }),
    ).toBe(false);
  });

  it('getSprayNotificationContext reads sprayCompletion metadata', () => {
    expect(
      getSprayNotificationContext({
        sprayCompletion: {
          eventId: 'evt-1',
          eventTitle: 'Wedding',
        },
      }),
    ).toEqual({
      eventId: 'evt-1',
      eventTitle: 'Wedding',
    });
  });
});
