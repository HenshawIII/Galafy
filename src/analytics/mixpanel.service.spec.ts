import { Test } from '@nestjs/testing';
import { MixpanelService } from './mixpanel.service.js';
import { MIXPANEL_CLIENT, createMixpanelClientFromEnv } from './mixpanel.client.js';
import { MixpanelEvent } from './mixpanel.events.js';
import { toAmountNumber } from './mixpanel.amount.js';
import { kycTierNumber } from './mixpanel.kyc.js';

function mockFn<T extends (...args: unknown[]) => unknown>(impl?: T) {
  const fn = (...args: Parameters<T>) => {
    fn.calls.push(args);
    return impl?.(...args);
  };
  fn.calls = [] as Parameters<T>[];
  return fn as T & { calls: Parameters<T>[] };
}

describe('MixpanelService', () => {
  it('does not call Mixpanel when client is null', async () => {
    const module = await Test.createTestingModule({
      providers: [MixpanelService, { provide: MIXPANEL_CLIENT, useValue: null }],
    }).compile();

    const service = module.get(MixpanelService);
    expect(() => {
      service.track('u1', MixpanelEvent.LoggedIn, { auth_method: 'email' });
      service.identify('u1', { is_verified: true });
      service.setOnce('u1', { $email: 'a@b.com' });
    }).not.toThrow();
  });

  it('tracks with distinct_id, source, and env', async () => {
    const track = mockFn();
    const set = mockFn();
    const setOnce = mockFn();
    const module = await Test.createTestingModule({
      providers: [
        MixpanelService,
        {
          provide: MIXPANEL_CLIENT,
          useValue: { track, people: { set, set_once: setOnce } },
        },
      ],
    }).compile();

    const service = module.get(MixpanelService);
    service.track('user-1', MixpanelEvent.SignedUp, { auth_method: 'email' });

    expect(track.calls[0][0]).toBe(MixpanelEvent.SignedUp);
    expect(track.calls[0][1]).toMatchObject({
      distinct_id: 'user-1',
      source: 'api',
      auth_method: 'email',
    });
  });

  it('swallows SDK throw from track', async () => {
    const module = await Test.createTestingModule({
      providers: [
        MixpanelService,
        {
          provide: MIXPANEL_CLIENT,
          useValue: {
            track: () => {
              throw new Error('network');
            },
            people: { set: mockFn(), set_once: mockFn() },
          },
        },
      ],
    }).compile();

    const service = module.get(MixpanelService);
    expect(() => service.track('user-1', MixpanelEvent.LoggedIn)).not.toThrow();
  });

  it('identify and setOnce call people APIs', async () => {
    const set = mockFn();
    const setOnce = mockFn();
    const module = await Test.createTestingModule({
      providers: [
        MixpanelService,
        {
          provide: MIXPANEL_CLIENT,
          useValue: { track: mockFn(), people: { set, set_once: setOnce } },
        },
      ],
    }).compile();

    const service = module.get(MixpanelService);
    service.identify('user-1', { kyc_tier: 1 });
    service.setOnce('user-1', { $email: 'a@b.com' });
    expect(set.calls[0][0]).toBe('user-1');
    expect(set.calls[0][1]).toEqual({ kyc_tier: 1 });
    expect(setOnce.calls[0][0]).toBe('user-1');
    expect(setOnce.calls[0][1]).toEqual({ $email: 'a@b.com' });
  });
});

describe('createMixpanelClientFromEnv', () => {
  const original = process.env.MIXPANEL_TOKEN;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.MIXPANEL_TOKEN;
    } else {
      process.env.MIXPANEL_TOKEN = original;
    }
  });

  it('returns null when MIXPANEL_TOKEN is empty', () => {
    process.env.MIXPANEL_TOKEN = '';
    expect(createMixpanelClientFromEnv()).toBeNull();
  });
});

describe('mixpanel helpers', () => {
  it('toAmountNumber formats decimals', () => {
    expect(toAmountNumber('10.5')).toBe(10.5);
    expect(toAmountNumber(3)).toBe(3);
    expect(toAmountNumber({ toFixed: () => '12.00' })).toBe(12);
  });

  it('kycTierNumber maps enums', () => {
    expect(kycTierNumber('Tier_0')).toBe(0);
    expect(kycTierNumber('Tier_1')).toBe(1);
    expect(kycTierNumber('Tier_3')).toBe(3);
  });
});
