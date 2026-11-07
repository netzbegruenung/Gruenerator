import { afterAll, describe, expect, it, jest } from '@jest/globals';
import {
  type QueryClient,
  type QueryKey,
  type QueryObserver as QueryObserverType,
} from '@tanstack/react-query';
import { AppState, type AppStateStatus } from 'react-native';

import { type queryClient as queryClientType } from './queryClient';

let client: QueryClient | null = null;

afterAll(() => client?.clear());

describe('queryClient foreground refresh', () => {
  it('refetches stale queries that opt in when the app returns to the foreground, and only those', async () => {
    // The focus listener is registered when the module loads, so the spy has to
    // be in place before it is imported (fresh module registry, same React Query copy).
    jest.resetModules();
    let onChange: ((s: AppStateStatus) => void) | null = null;
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((
      _type: string,
      listener: (s: AppStateStatus) => void
    ) => {
      onChange = listener;
      return { remove: () => {} };
    }) as typeof AppState.addEventListener);
    const { queryClient } = jest.requireActual<{ queryClient: typeof queryClientType }>(
      './queryClient'
    );
    const { QueryObserver } = jest.requireActual<{ QueryObserver: typeof QueryObserverType }>(
      '@tanstack/react-query'
    );
    client = queryClient;
    // What QueryClientProvider does in the app: wire focus/online events to the cache.
    queryClient.mount();

    const optedIn = jest.fn(async () => 1);
    const byDefault = jest.fn(async () => 1);
    const watch = (queryKey: QueryKey, queryFn: () => Promise<number>, optIn: boolean) =>
      new QueryObserver(queryClient, {
        queryKey,
        queryFn,
        staleTime: 0,
        ...(optIn ? { refetchOnWindowFocus: true } : {}),
      }).subscribe(() => {});

    const stops = [watch(['opted-in'], optedIn, true), watch(['default'], byDefault, false)];
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(optedIn).toHaveBeenCalledTimes(1);
    expect(byDefault).toHaveBeenCalledTimes(1);

    const emit = onChange as ((s: AppStateStatus) => void) | null;
    expect(emit).not.toBeNull();
    emit?.('background');
    emit?.('active');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(optedIn).toHaveBeenCalledTimes(2);
    expect(byDefault).toHaveBeenCalledTimes(1);
    stops.forEach((stop) => stop());
    queryClient.unmount();
  });
});
