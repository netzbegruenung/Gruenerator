/* eslint-disable import-x/order -- `@jest/globals` MUST stay the first import:
   babel-plugin-jest-hoist lifts the `jest.mock` calls above the other requires,
   and only a `@jest/globals` require that already precedes them survives. */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { getContractsClient } from '@gruenerator/shared/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useIsFocused } from 'expo-router';

import { useUnreadCount } from './useNotifications';

import type { ReactNode } from 'react';

jest.mock('@gruenerator/shared/api', () => ({
  getContractsClient: jest.fn(),
  getGlobalApiClient: jest.fn(),
}));
jest.mock('expo-router', () => ({ useIsFocused: jest.fn() }));

const mockFocused = useIsFocused as jest.MockedFunction<typeof useIsFocused>;
const getUnreadCount = jest.fn(async () => ({ status: 200, body: { count: 7 } }));
(getContractsClient as jest.Mock).mockReturnValue({ notifications: { getUnreadCount } });

/**
 * Every screen header mounts a profile menu, and each one asks for the badge
 * count. Before it shared a query, each mount fetched on its own and kept its
 * own 60 s timer alive — frozen screens included — so a deep stack polled once
 * per screen. These pin down: one request per mount wave, and polling only from
 * the focused screen.
 */
describe('useUnreadCount', () => {
  let client: QueryClient;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    // No gc timer: one left pending after unmount keeps jest from exiting.
    client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
    getUnreadCount.mockClear();
  });

  afterEach(() => {
    client.clear();
    jest.useRealTimers();
  });

  it('shares one request between all mounted headers', async () => {
    mockFocused.mockReturnValue(true);
    const a = renderHook(() => useUnreadCount(), { wrapper });
    const b = renderHook(() => useUnreadCount(), { wrapper });

    await waitFor(() => expect(a.result.current.count).toBe(7));
    expect(b.result.current.count).toBe(7);
    expect(getUnreadCount).toHaveBeenCalledTimes(1);
  });

  it('polls only from the focused screen', async () => {
    jest.useFakeTimers();
    mockFocused.mockReturnValue(false);
    renderHook(() => useUnreadCount(), { wrapper });
    renderHook(() => useUnreadCount(), { wrapper });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });
    expect(getUnreadCount).toHaveBeenCalledTimes(1);

    await act(async () => {
      await jest.advanceTimersByTimeAsync(3 * 60_000);
    });
    expect(getUnreadCount).toHaveBeenCalledTimes(1);

    // The count is stale by now, so the focused screen's mount refreshes it —
    // and from then on it, alone, keeps polling.
    mockFocused.mockReturnValue(true);
    renderHook(() => useUnreadCount(), { wrapper });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });
    expect(getUnreadCount).toHaveBeenCalledTimes(2);

    await act(async () => {
      await jest.advanceTimersByTimeAsync(60_000);
    });
    expect(getUnreadCount).toHaveBeenCalledTimes(3);
  });
});
