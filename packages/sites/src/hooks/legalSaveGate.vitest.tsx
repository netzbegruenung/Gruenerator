import { type SiteLegalDraft } from '@gruenerator/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({ updateSite: vi.fn() }));
vi.mock('./useSite', () => ({ useSite: () => ({ updateSite: hoisted.updateSite }) }));

import { settleLegalSave } from './legalSaveGate';
import { useLegalAutosave } from './useLegalAutosave';

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

const legal = (name: string): SiteLegalDraft => ({
  name,
  street: 'Weg 1',
  postal_code: '10115',
  city: 'Berlin',
  email: 'a@example.org',
});

function deferred() {
  let resolve: () => void = () => {};
  let reject: (e: Error) => void = () => {};
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('Impressum save ordering', () => {
  beforeEach(() => {
    hoisted.updateSite.mockReset();
  });

  it('never has two PUTs in flight and ends on the newest value', async () => {
    const first = deferred();
    const second = deferred();
    const server: string[] = [];
    hoisted.updateSite
      .mockImplementationOnce(async (a: { data: { legal: SiteLegalDraft } }) => {
        await first.promise;
        server.push(a.data.legal.name ?? '');
      })
      .mockImplementationOnce(async (a: { data: { legal: SiteLegalDraft } }) => {
        await second.promise;
        server.push(a.data.legal.name ?? '');
      });
    const { result, rerender } = renderHook(({ l }) => useLegalAutosave('s1', l), {
      initialProps: { l: legal('Alt') },
      wrapper,
    });

    rerender({ l: legal('A') });
    let settled: Promise<{ ok: boolean }> = Promise.resolve({ ok: false });
    act(() => {
      settled = settleLegalSave('s1');
    });
    rerender({ l: legal('B') });
    act(() => {
      settled = settleLegalSave('s1');
    });
    expect(hoisted.updateSite).toHaveBeenCalledTimes(1);

    await act(async () => {
      first.resolve();
      await Promise.resolve();
    });
    expect(hoisted.updateSite).toHaveBeenCalledTimes(2);
    expect(
      (hoisted.updateSite.mock.calls[1]![0] as { data: { legal: SiteLegalDraft } }).data.legal.name
    ).toBe('B');
    expect(result.current.status).toBe('saving');

    await act(async () => {
      second.resolve();
      expect((await settled).ok).toBe(true);
    });
    expect(server).toEqual(['A', 'B']);
    expect(result.current.status).toBe('saved');
  });

  it('keeps blocking while the last save failed, until a later one succeeds', async () => {
    hoisted.updateSite.mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce({});
    const { result, rerender } = renderHook(({ l }) => useLegalAutosave('s1', l), {
      initialProps: { l: legal('Alt') },
      wrapper,
    });
    rerender({ l: legal('A') });
    let r = { ok: true, pending: false };
    await act(async () => {
      r = await settleLegalSave('s1');
    });
    expect(r.ok).toBe(false);
    expect(result.current.status).toBe('error');
    await act(async () => {
      r = await settleLegalSave('s1');
    });
    expect(r.ok).toBe(true);
  });
});
