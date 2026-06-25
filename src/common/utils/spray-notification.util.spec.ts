import {
  isEventSprayNarration,
  isInternalSprayTransferNarration,
  parseEventIdFromSprayNarration,
} from './spray-notification.util.js';

describe('spray-notification.util', () => {
  const eventId = '42fe5e31-9623-4899-b223-17b1d9c39648';
  const sprayNarration = `Spray in event FAM AND FRIENDS , EventId: ${eventId}`;

  it('detects event spray narration', () => {
    expect(isEventSprayNarration(sprayNarration)).toBe(true);
    expect(isEventSprayNarration('Transfer from John')).toBe(false);
  });

  it('parses event id from spray narration', () => {
    expect(parseEventIdFromSprayNarration(sprayNarration)).toBe(eventId);
    expect(parseEventIdFromSprayNarration('Spray in event only')).toBeNull();
  });

  it('treats event spray and wallet transfer as internal spray transfer', () => {
    expect(isInternalSprayTransferNarration(sprayNarration)).toBe(true);
    expect(isInternalSprayTransferNarration('Wallet transfer to 0446920038')).toBe(true);
    expect(isInternalSprayTransferNarration('Transfer from bank')).toBe(false);
  });
});
