/* eslint-disable import-x/order -- `@jest/globals` MUST stay the first import:
   babel-plugin-jest-hoist lifts the `jest.mock` calls above the other requires,
   and only a `@jest/globals` require that already precedes them survives. */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { getContractsClient } from '@gruenerator/shared/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useIsFocused } from 'expo-router';

import { useNotifications, useUnreadCount } from './useNotifications';

import type { ReactNode } from 'react';

jest.mock('@gruenerator/shared/api', () => ({
  getContractsClient: jest.fn(),
}));
jest.mock('expo-router', () => ({ useIsFocused: jest.fn() }));

const mockFocused = useIsFocused as jest.MockedFunction<typeof useIsFocused>;
const getUnreadCount = jest.fn(async () => ({ status: 200, body: { count: 7 } }));
const row = {
  id: 'n1',
  type: 'daily_briefing',
  title: 'Dein Tag',
  body: null,
  metadata: {},
  action_url: null,
  group_key: 'daily-briefing-2026-11-19',
  is_read: false,
  read_at: null,
  created_at: '2026-11-19T06:00:00.000Z',
};
const list = jest.fn(async () => ({ status: 200, body: [row] }));
const markAsRead = jest.fn(async (_args: unknown) => ({ status: 200, body: { success: true } }));
const markAllAsRead = jest.fn(async (_args: unknown) => ({ status: 200, body: { success: true } }));
const dismiss = jest.fn(async (_args: unknown) => ({ status: 200, body: { success: true } }));
(getContractsClient as jest.Mock).mockReturnValue({
  notifications: { getUnreadCount, list, markAsRead, markAllAsRead, dismiss },
});

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
    const a = await renderHook(() => useUnreadCount(), { wrapper });
    const b = await renderHook(() => useUnreadCount(), { wrapper });

    await waitFor(() => expect(a.result.current.count).toBe(7));
    expect(b.result.current.count).toBe(7);
    expect(getUnreadCount).toHaveBeenCalledTimes(1);
  });

  it('polls only from the focused screen', async () => {
    jest.useFakeTimers();
    mockFocused.mockReturnValue(false);
    await renderHook(() => useUnreadCount(), { wrapper });
    await renderHook(() => useUnreadCount(), { wrapper });
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
    await renderHook(() => useUnreadCount(), { wrapper });
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

/**
 * The contract declares `body: z.object({})` on these mutations. Raw axios calls
 * without a body reached Express 5 as `req.body === undefined`, ts-rest answered
 * 400, and the app swallowed it: "entfernen" reloaded the list (the row came
 * back) and "Alle gelesen" changed nothing.
 */
describe('useNotifications mutations', () => {
  let client: QueryClient;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
    jest.clearAllMocks();
  });

  afterEach(() => client.clear());

  it('dismisses through the contract with a body and refreshes the badge', async () => {
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const { result } = await renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(result.current.notifications).toHaveLength(1));

    await act(async () => {
      await result.current.dismiss('n1');
    });

    expect(dismiss).toHaveBeenCalledWith({ params: { id: 'n1' }, body: {} });
    expect(result.current.notifications).toHaveLength(0);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['notifications', 'unread-count'] });
  });

  it('reloads the list when the server refuses the dismissal', async () => {
    dismiss.mockResolvedValueOnce({ status: 400, body: { success: false } } as never);
    const { result } = await renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(result.current.notifications).toHaveLength(1));

    await act(async () => {
      await result.current.dismiss('n1');
    });

    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    expect(result.current.notifications).toHaveLength(1);
  });

  it('marks one and all as read through the contract with a body', async () => {
    const { result } = await renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(result.current.notifications).toHaveLength(1));

    await act(async () => {
      await result.current.markAsRead('n1');
    });
    expect(markAsRead).toHaveBeenCalledWith({ params: { id: 'n1' }, body: {} });

    await act(async () => {
      await result.current.markAllAsRead();
    });
    expect(markAllAsRead).toHaveBeenCalledWith({ body: {} });
    expect(result.current.notifications[0]?.is_read).toBe(true);
  });

  it('keeps the row unread when the server refuses "Alle gelesen"', async () => {
    markAllAsRead.mockResolvedValueOnce({ status: 400, body: { success: false } } as never);
    const { result } = await renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(result.current.notifications).toHaveLength(1));

    await act(async () => {
      await result.current.markAllAsRead();
    });
    expect(result.current.notifications[0]?.is_read).toBe(false);
  });
});
