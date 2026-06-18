import { isHostReceiverRole } from './event-role.util.js';

describe('isHostReceiverRole', () => {
  it('accepts HOST and legacy CELEBRANT/PERFORMER roles', () => {
    expect(isHostReceiverRole('HOST')).toBe(true);
    expect(isHostReceiverRole('CELEBRANT')).toBe(true);
    expect(isHostReceiverRole('PERFORMER')).toBe(true);
  });

  it('rejects GIFTER, ATTENDEE, and empty values', () => {
    expect(isHostReceiverRole('GIFTER')).toBe(false);
    expect(isHostReceiverRole('ATTENDEE')).toBe(false);
    expect(isHostReceiverRole(null)).toBe(false);
    expect(isHostReceiverRole(undefined)).toBe(false);
  });
});
