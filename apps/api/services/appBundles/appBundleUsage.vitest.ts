import { beforeEach, describe, expect, it, vi } from 'vitest';

// Exact sets stand in for HyperLogLogs: the estimate is redis' business, the
// keys and the union over days are ours.
const sets = new Map<string, Set<string>>();
const add = (key: string, value: string) => {
  const set = sets.get(key) ?? new Set<string>();
  set.add(value);
  sets.set(key, set);
};
const pfAdd = vi.fn();

vi.mock('../../utils/redis/client.js', () => ({
  redisClient: {
    multi: () => {
      const chain = {
        sAdd: (key: string, value: string) => (add(key, value), chain),
        pfAdd: (key: string, value: string) => (pfAdd(key, value), add(key, value), chain),
        expire: () => chain,
        exec: () => Promise.resolve([]),
      };
      return chain;
    },
    sMembers: (key: string) => Promise.resolve([...(sets.get(key) ?? [])]),
    pfCount: (keys: string | string[]) => {
      const union = new Set<string>();
      for (const key of [keys].flat()) for (const v of sets.get(key) ?? []) union.add(v);
      return Promise.resolve(union.size);
    },
  },
}));

const { getAppBundleUsage, parseAppBundle, recordAppBundleUse } =
  await import('./appBundleUsage.js');

const UPDATE = '0f3b1c2a-9d4e-4f5a-8b6c-7d8e9f0a1b2c';
const headers = {
  'x-app-platform': 'ios',
  'x-app-version': '1.6.0',
  'x-app-update': UPDATE,
  'x-app-update-date': '2026-10-20',
};

describe('parseAppBundle', () => {
  it('reads an OTA bundle', () => {
    expect(parseAppBundle(headers)).toEqual({
      platform: 'ios',
      appVersion: '1.6.0',
      updateId: UPDATE,
      updateDate: '2026-10-20',
    });
  });

  it('reads the store bundle', () => {
    expect(parseAppBundle({ ...headers, 'x-app-update': 'embedded' })).toEqual({
      platform: 'ios',
      appVersion: '1.6.0',
      updateId: null,
      updateDate: null,
    });
  });

  it('ignores requests that name no bundle, e.g. from the web app', () => {
    expect(parseAppBundle({ 'x-app-platform': 'ios', 'x-app-version': '1.6.0' })).toBeNull();
  });

  // The values end up in redis keys; nothing free-form may get there.
  it.each([
    ['platform', { 'x-app-platform': 'web' }],
    ['version', { 'x-app-version': '1.6.0|x' }],
    ['update id', { 'x-app-update': 'not-a-uuid' }],
  ])('rejects a malformed %s', (_, patch) => {
    expect(parseAppBundle({ ...headers, ...patch })).toBeNull();
  });

  it('drops a malformed build day but keeps the bundle', () => {
    expect(parseAppBundle({ ...headers, 'x-app-update-date': 'gestern' })?.updateDate).toBeNull();
  });
});

describe('app bundle usage', () => {
  beforeEach(() => {
    sets.clear();
    pfAdd.mockClear();
  });

  const ota = parseAppBundle(headers)!;
  const store = parseAppBundle({ ...headers, 'x-app-update': 'embedded' })!;
  const day = (d: number) => new Date(`2026-10-${d}T12:00:00Z`);

  it('writes each account once per bundle and day', () => {
    recordAppBundleUse(ota, 'u1', day(10));
    recordAppBundleUse(ota, 'u1', day(10));
    recordAppBundleUse(ota, 'u1', day(11));
    expect(pfAdd).toHaveBeenCalledTimes(2);
  });

  it('counts today, the union of the last seven days, and when a bundle was seen', async () => {
    recordAppBundleUse(store, 'u1', day(12));
    recordAppBundleUse(store, 'u2', day(12));
    recordAppBundleUse(ota, 'u1', day(18));
    recordAppBundleUse(ota, 'u2', day(20));
    recordAppBundleUse(ota, 'u1', day(22));

    expect(await getAppBundleUsage(day(22))).toEqual([
      {
        ...ota,
        usersToday: 1,
        usersLast7Days: 2,
        firstSeen: '2026-10-18',
        lastSeen: '2026-10-22',
      },
      {
        ...store,
        usersToday: 0,
        usersLast7Days: 0,
        firstSeen: '2026-10-12',
        lastSeen: '2026-10-12',
      },
    ]);
  });
});
