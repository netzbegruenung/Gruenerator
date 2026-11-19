/* eslint-disable import-x/order -- `@jest/globals` MUST stay the first import:
   babel-plugin-jest-hoist lifts the `jest.mock` calls above the other requires,
   and only a `@jest/globals` require that already precedes them survives. */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { getContractsClient } from '@gruenerator/shared/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';

import { useLinkedThreadId } from './useLinkedThreadId';

import type { ReactNode } from 'react';

jest.mock('@gruenerator/shared/api', () => ({ getContractsClient: jest.fn() }));

const THREAD_ID = '3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e';
const resolveShared = jest.fn(async ({ params }: { params: { slugOrId: string } }) =>
  params.slugOrId.endsWith('ab12cd')
    ? { status: 200, body: { id: THREAD_ID } }
    : { status: 404, body: { error: 'Thread not found' } }
);
(getContractsClient as jest.Mock).mockReturnValue({ chatThreadSharing: { resolveShared } });

/**
 * The Tagesbriefing notification links `/chat/<slug>`. Handed to the history
 * as-is, the slug loaded no messages and the briefing opened as an empty chat.
 */
describe('useLinkedThreadId', () => {
  let client: QueryClient;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    client = new QueryClient({
      defaultOptions: { queries: { gcTime: Infinity, retry: false } },
    });
    resolveShared.mockClear();
  });

  it('resolves a slug from a link to the thread id', async () => {
    const { result } = await renderHook(() => useLinkedThreadId('dein-tag-19-nov-ab12cd'), {
      wrapper,
    });
    expect(result.current).toBeUndefined();
    await waitFor(() => expect(result.current).toBe(THREAD_ID));
  });

  it('passes a thread id through without a request', async () => {
    const { result } = await renderHook(() => useLinkedThreadId(THREAD_ID), { wrapper });
    expect(result.current).toBe(THREAD_ID);
    expect(resolveShared).not.toHaveBeenCalled();
  });

  it('yields null for a thread that is gone', async () => {
    const { result } = await renderHook(() => useLinkedThreadId('dein-tag-18-nov-zz99zz'), {
      wrapper,
    });
    await waitFor(() => expect(result.current).toBeNull());
  });
});
