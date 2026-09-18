/**
 * The four-way resolution behind `/agentura/rezept/:mention`. The cases that
 * matter are the ones where getting it wrong is invisible: a system mention
 * must NOT wait on a network round trip (its page rendered fine before recipes
 * had rows), an own row on a system mention is an override rather than a
 * separate page, and a failed list must never read as "not found".
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useRecipeByMention } from './useRecipeByMention';

const list = vi.hoisted(() => vi.fn());
const listPublic = vi.hoisted(() => vi.fn());

vi.mock('@gruenerator/shared/api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getContractsClient: () => ({ userTextForms: { list, listPublic } }),
}));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) =>
    selector({ isAuthenticated: true, locale: 'de-DE' }),
}));

function row(over: Record<string, unknown> = {}) {
  return {
    id: 'row-1',
    kind: 'custom',
    textType: null,
    mention: 'mein-rezept',
    title: 'Mein Rezept',
    examples: [{ content: 'Beispieltext' }],
    styleBlock: 'Schreibe kurz.',
    model: null,
    analyzedAt: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
    sharedWithGroups: [],
    sharedFromGroup: null,
    ownerName: null,
    description: null,
    iconKey: null,
    shareMode: 'private',
    isPublic: false,
    publicOwnership: null,
    ...over,
  };
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  list.mockReset().mockResolvedValue({ status: 200, body: { success: true, forms: [] } });
  listPublic.mockReset().mockResolvedValue({ status: 200, body: { success: true, forms: [] } });
});

describe('useRecipeByMention', () => {
  it('beantwortet ein Systemrezept sofort, ohne auf die Listen zu warten', () => {
    const { result } = renderHook(() => useRecipeByMention('presse'), { wrapper });

    expect(result.current.status).toBe('ready');
    expect(result.current.source).toBe('system');
    expect(result.current.skill?.mention).toBe('presse');
    expect(result.current.form).toBeNull();
  });

  it('reicht eine eigene Zeile auf einer System-Mention als Override durch', async () => {
    list.mockResolvedValue({
      status: 200,
      body: { success: true, forms: [row({ mention: 'presse', kind: 'preset' })] },
    });
    const { result } = renderHook(() => useRecipeByMention('presse'), { wrapper });

    await waitFor(() => expect(result.current.ownOverride).not.toBeNull());
    expect(result.current.source).toBe('system');
    expect(result.current.ownOverride?.mention).toBe('presse');
  });

  it('findet ein eigenes Rezept', async () => {
    list.mockResolvedValue({ status: 200, body: { success: true, forms: [row()] } });
    const { result } = renderHook(() => useRecipeByMention('mein-rezept'), { wrapper });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.source).toBe('own');
    expect(result.current.form?.title).toBe('Mein Rezept');
  });

  it('unterscheidet ein aus einem Projekt geteiltes Rezept vom eigenen', async () => {
    list.mockResolvedValue({
      status: 200,
      body: { success: true, forms: [row({ sharedFromGroup: 'OV Mitte', ownerName: 'Alex' })] },
    });
    const { result } = renderHook(() => useRecipeByMention('mein-rezept'), { wrapper });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.source).toBe('shared');
    expect(result.current.ownOverride).toBeNull();
  });

  it('fällt auf den offenen Katalog zurück', async () => {
    listPublic.mockResolvedValue({
      status: 200,
      body: {
        success: true,
        forms: [
          { ...row({ id: 'pub-1', mention: 'fremd' }), examples: undefined, exampleCount: 3 },
        ],
      },
    });
    const { result } = renderHook(() => useRecipeByMention('fremd'), { wrapper });

    await waitFor(() => expect(result.current.source).toBe('public'));
    expect(result.current.form?.id).toBe('pub-1');
  });

  it('meldet einen Ladefehler als Fehler, nicht als „nicht gefunden“', async () => {
    list.mockResolvedValue({ status: 500, body: { success: false, message: 'Serverfehler' } });
    const { result } = renderHook(() => useRecipeByMention('mein-rezept'), { wrapper });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.source).toBeNull();
    expect(result.current.isError).toBe(true);
  });

  it('ist weder Fehler noch Treffer, wenn es die Mention schlicht nicht gibt', async () => {
    const { result } = renderHook(() => useRecipeByMention('gibtsnicht'), { wrapper });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.source).toBeNull();
    expect(result.current.isError).toBe(false);
  });
});
