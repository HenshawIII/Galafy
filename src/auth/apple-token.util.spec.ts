import { getAppleAudiences } from './apple-token.util.js';

describe('getAppleAudiences', () => {
  const previousId = process.env.APPLE_CLIENT_ID;
  const previousIds = process.env.APPLE_CLIENT_IDS;

  afterEach(() => {
    if (previousId === undefined) {
      delete process.env.APPLE_CLIENT_ID;
    } else {
      process.env.APPLE_CLIENT_ID = previousId;
    }

    if (previousIds === undefined) {
      delete process.env.APPLE_CLIENT_IDS;
    } else {
      process.env.APPLE_CLIENT_IDS = previousIds;
    }
  });

  it('includes the primary client id and extra audiences', () => {
    process.env.APPLE_CLIENT_ID = 'com.galafy.co';
    process.env.APPLE_CLIENT_IDS = 'com.galafy.co.android, com.galafy.co';

    expect(getAppleAudiences()).toEqual(['com.galafy.co', 'com.galafy.co.android']);
  });

  it('returns an empty list when Apple env is unset', () => {
    delete process.env.APPLE_CLIENT_ID;
    delete process.env.APPLE_CLIENT_IDS;

    expect(getAppleAudiences()).toEqual([]);
  });
});
