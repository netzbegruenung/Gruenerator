import { type ReactionSummary } from '@gruenerator/contracts';
import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { useToggleReaction } from '@gruenerator/shared/reactions';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { type ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { server } from '../../test/msw-server';

const ENDPOINT = 'http://localhost/api/auth/reactions/:entityType/:entityId/:emoji';
const QUERY_KEY = ['feed', 'g1'];

interface Feed {
  items: { id: string; reactions: ReactionSummary[] }[];
}

const initial: Feed = {
  items: [
    { id: 's1', reactions: [{ emoji: '👍', count: 1, reacted: false }] },
    { id: 's2', reactions: [] },
  ],
};

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

afterEach(() => {
  server.resetHandlers();
});

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(QUERY_KEY, initial);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(
    () =>
      useToggleReaction<Feed>({
        entityType: 'group_share',
        entityId: 's1',
        queryKey: QUERY_KEY,
        update: (data, apply) => ({
          items: data.items.map((i) =>
            i.id === 's1' ? { ...i, reactions: apply(i.reactions) } : i
          ),
        }),
      }),
    { wrapper }
  );
  const feed = () => queryClient.getQueryData<Feed>(QUERY_KEY);
  return { result, feed };
}

function deferred() {
  let release = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

describe('useToggleReaction (MSW)', () => {
  it('applies the reaction optimistically and sends a PUT with the decoded emoji', async () => {
    const gate = deferred();
    let seen: Record<string, unknown> | null = null;
    server.use(
      http.put(ENDPOINT, async ({ params }) => {
        seen = { ...params };
        await gate.promise;
        return HttpResponse.json({ reactions: [{ emoji: '👍', count: 2, reacted: true }] });
      })
    );
    const { result, feed } = setup();

    act(() => result.current.toggle('👍', false));

    await waitFor(() =>
      expect(feed()?.items[0].reactions).toEqual([{ emoji: '👍', count: 2, reacted: true }])
    );
    expect(feed()?.items[1]).toBe(initial.items[1]);
    await waitFor(() => expect(result.current.isPending).toBe(true));

    gate.release();
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(seen).toEqual({ entityType: 'group_share', entityId: 's1', emoji: '👍' });
  });

  it('sends a DELETE when the viewer already reacted', async () => {
    let method: string | null = null;
    server.use(
      http.delete(ENDPOINT, ({ request }) => {
        method = request.method;
        return HttpResponse.json({ reactions: [] });
      })
    );
    const { result } = setup();

    act(() => result.current.toggle('❤️', true));

    await waitFor(() => expect(method).toBe('DELETE'));
  });

  it('rolls the cache back when the request fails', async () => {
    const gate = deferred();
    server.use(
      http.put(ENDPOINT, async () => {
        await gate.promise;
        return HttpResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
      })
    );
    const { result, feed } = setup();

    act(() => result.current.toggle('🎉', false));
    await waitFor(() => expect(feed()?.items[0].reactions).toHaveLength(2));

    gate.release();
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(feed()).toEqual(initial);
  });

  it('does not try to add an emoji outside the fixed set', () => {
    const { result, feed } = setup();

    act(() => result.current.toggle('💡', false));

    expect(result.current.isPending).toBe(false);
    expect(feed()).toBe(initial);
  });
});
