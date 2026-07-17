import {
  buildSprayPushNotification,
  getSprayHistoryFields,
  getSprayNotificationContext,
  isSprayDebitTransaction,
  parseEventTitleFromSprayNarration,
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

  it('parseEventTitleFromSprayNarration handles modern and legacy formats', () => {
    expect(
      parseEventTitleFromSprayNarration(
        'EventId:42fe5e31-9623-4899-b223-17b1d9c39648 Spray in Birthday Bash',
      ),
    ).toBe('Birthday Bash');
    expect(
      parseEventTitleFromSprayNarration(
        'Spray in event FAM AND FRIENDS , EventId: 42fe5e31-9623-4899-b223-17b1d9c39648',
      ),
    ).toBe('FAM AND FRIENDS');
    expect(parseEventTitleFromSprayNarration('This is messg')).toBeNull();
  });

  it('getSprayHistoryFields prefers metadata and falls back to narration', () => {
    expect(
      getSprayHistoryFields(
        {
          eventSpray: true,
          sprayCompletion: {
            eventId: '42fe5e31-9623-4899-b223-17b1d9c39648',
            eventTitle: 'Night Out',
            note: 'This is messg',
          },
        },
        'This is messg',
      ),
    ).toEqual({
      eventId: '42fe5e31-9623-4899-b223-17b1d9c39648',
      eventTitle: 'Night Out',
      note: 'This is messg',
    });

    expect(
      getSprayHistoryFields(
        null,
        'EventId:42fe5e31-9623-4899-b223-17b1d9c39648 Spray in Open Mic',
      ),
    ).toEqual({
      eventId: '42fe5e31-9623-4899-b223-17b1d9c39648',
      eventTitle: 'Open Mic',
      note: null,
    });

    expect(getSprayHistoryFields(null, 'Wallet payout to 0123456789')).toEqual({
      eventId: null,
      eventTitle: null,
      note: null,
    });
  });

  it('getSprayHistoryFields treats sprayCredit like a spray for note fallback', () => {
    expect(
      getSprayHistoryFields(
        {
          sprayCredit: true,
          linkedSprayDebitRef: 'SPRAY-abc',
        },
        'HI LOVE',
      ),
    ).toEqual({
      eventId: null,
      eventTitle: null,
      note: 'HI LOVE',
    });
  });

  it('getSprayHistoryFields reads sprayCompletion copied onto credit metadata', () => {
    expect(
      getSprayHistoryFields(
        {
          sprayCredit: true,
          eventSpray: true,
          linkedSprayDebitRef: 'SPRAY-abc',
          sprayCompletion: {
            eventId: '42fe5e31-9623-4899-b223-17b1d9c39648',
            eventTitle: 'Night Out',
            note: 'HI LOVE',
          },
        },
        'HI LOVE',
      ),
    ).toEqual({
      eventId: '42fe5e31-9623-4899-b223-17b1d9c39648',
      eventTitle: 'Night Out',
      note: 'HI LOVE',
    });
  });
});
