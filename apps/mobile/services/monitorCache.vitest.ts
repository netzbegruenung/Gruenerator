import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __resetAsyncStorage } from '../test/stubs/async-storage';

import { clearPersistedMonitorQueries, persistMonitorQueries } from './monitorCache';

const KEY = 'gruenerator.monitorQueries.v1';
const DAY = 24 * 60 * 60 * 1000;

const stored = async () => {
  const raw = await AsyncStorage.getItem(KEY);
  return raw ? (JSON.parse(raw) as { queries: { queryKey: unknown[] }[] }) : null;
};

/** Lets the fire-and-forget restore (an awaited AsyncStorage read) finish. */
const settle = () => vi.advanceTimersByTimeAsync(0);

describe('monitorCache', () => {
  beforeEach(() => {
    __resetAsyncStorage();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('stores successful monitor queries after the burst, and nothing else', async () => {
    const client = new QueryClient();
    persistMonitorQueries(client);
    await settle();

    client.setQueryData(['monitor', 'polls', 'eu-greens'], { rows: [1] });
    client.setQueryData(['notebookCollections'], ['private']);
    expect(await stored()).toBeNull();

    await vi.advanceTimersByTimeAsync(1000);
    const state = await stored();
    expect(state?.queries.map((q) => q.queryKey)).toEqual([['monitor', 'polls', 'eu-greens']]);
  });

  it('restores entries younger than a day and drops older ones', async () => {
    const now = Date.now();
    const writer = new QueryClient();
    writer.setQueryData(['monitor', 'fresh'], 'today', { updatedAt: now - DAY + 60_000 });
    writer.setQueryData(['monitor', 'old'], 'yesterday', { updatedAt: now - DAY - 60_000 });
    const { dehydrate } = await import('@tanstack/react-query');
    await AsyncStorage.setItem(KEY, JSON.stringify(dehydrate(writer)));

    const client = new QueryClient();
    persistMonitorQueries(client);
    await settle();

    expect(client.getQueryData(['monitor', 'fresh'])).toBe('today');
    expect(client.getQueryData(['monitor', 'old'])).toBeUndefined();
    // Restored, not fresh: it refetches as soon as a card mounts.
    expect(client.getQueryState(['monitor', 'fresh'])?.dataUpdatedAt).toBe(now - DAY + 60_000);
  });

  it('starts empty from an unreadable entry', async () => {
    await AsyncStorage.setItem(KEY, '{not json');
    const client = new QueryClient();
    persistMonitorQueries(client);
    await settle();
    expect(client.getQueryCache().getAll()).toHaveLength(0);
  });

  it('forgets the stored entry on logout', async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify({ mutations: [], queries: [] }));
    await clearPersistedMonitorQueries();
    expect(await stored()).toBeNull();
  });
});
