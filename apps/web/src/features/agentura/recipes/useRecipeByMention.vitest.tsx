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

/**
 * The auth gate is the real `['authStatus']` query, not a stubbed store — that
 * is the whole point of the clock this hook reads. `seedAuth: false` leaves it
 * pending, which is what a hard load looks like before the probe answers.
 */
function makeWrapper(seedAuth = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  if (seedAuth) client.setQueryData(['authStatus'], { isAuthenticated: true });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  list.mockReset().mockResolvedValue({ status: 200, body: { success: true, forms: [] } });
  listPublic.mockReset().mockResolvedValue({ status: 200, body: { success: true, forms: [] } });
});

describe('useRecipeByMention', () => {
  it('beantwortet ein Systemrezept sofort, ohne auf die Listen zu warten', () => {
    const { result } = renderHook(() => useRecipeByMention('presse'), { wrapper: makeWrapper() });

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
    const { result } = renderHook(() => useRecipeByMention('presse'), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.ownOverride).not.toBeNull());
    expect(result.current.source).toBe('system');
    expect(result.current.ownOverride?.mention).toBe('presse');
  });

  it('findet ein eigenes Rezept', async () => {
    list.mockResolvedValue({ status: 200, body: { success: true, forms: [row()] } });
    const { result } = renderHook(() => useRecipeByMention('mein-rezept'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.source).toBe('own');
    expect(result.current.form?.title).toBe('Mein Rezept');
  });

  it('unterscheidet ein aus einem Projekt geteiltes Rezept vom eigenen', async () => {
    list.mockResolvedValue({
      status: 200,
      body: { success: true, forms: [row({ sharedFromGroup: 'OV Mitte', ownerName: 'Alex' })] },
    });
    const { result } = renderHook(() => useRecipeByMention('mein-rezept'), {
      wrapper: makeWrapper(),
    });

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
    const { result } = renderHook(() => useRecipeByMention('fremd'), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.source).toBe('public'));
    expect(result.current.form?.id).toBe('pub-1');
  });

  it('meldet einen Ladefehler als Fehler, nicht als „nicht gefunden“', async () => {
    list.mockResolvedValue({ status: 500, body: { success: false, message: 'Serverfehler' } });
    const { result } = renderHook(() => useRecipeByMention('mein-rezept'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.source).toBeNull();
    expect(result.current.isError).toBe(true);
  });

  it('ist weder Fehler noch Treffer, wenn es die Mention schlicht nicht gibt', async () => {
    const { result } = renderHook(() => useRecipeByMention('gibtsnicht'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.source).toBeNull();
    expect(result.current.isError).toBe(false);
  });
  it('wartet auf die Auth-Antwort, statt das eigene Rezept für fehlend zu erklären', async () => {
    // Genau der harte Ladefall: `RequireAuth` lässt die Seite aus dem warmen
    // Cache durch, die Sonde antwortet aber erst gleich. Solange darf hier
    // nichts „nicht gefunden" sagen.
    list.mockResolvedValue({ status: 200, body: { success: true, forms: [row()] } });
    const { result } = renderHook(() => useRecipeByMention('mein-rezept'), {
      wrapper: makeWrapper(false),
    });

    expect(result.current.status).toBe('loading');
    expect(result.current.source).toBeNull();
    expect(result.current.isError).toBe(false);
    await waitFor(() => expect(list).not.toHaveBeenCalled());
  });

  it('holt ein eigenes Rezept, sobald die Auth-Antwort da ist', async () => {
    list.mockResolvedValue({ status: 200, body: { success: true, forms: [row()] } });
    const { result } = renderHook(() => useRecipeByMention('mein-rezept'), {
      wrapper: makeWrapper(true),
    });

    await waitFor(() => expect(result.current.source).toBe('own'));
    expect(result.current.form?.title).toBe('Mein Rezept');
  });

  it('fragt für ein Systemrezept den offenen Katalog gar nicht erst ab', async () => {
    const { result } = renderHook(() => useRecipeByMention('presse'), {
      wrapper: makeWrapper(true),
    });

    expect(result.current.source).toBe('system');
    await waitFor(() => expect(list).toHaveBeenCalled());
    expect(listPublic).not.toHaveBeenCalled();
  });

  it('findet eine Zeile auch bei abweichender Groß-/Kleinschreibung in der Adresse', async () => {
    list.mockResolvedValue({ status: 200, body: { success: true, forms: [row()] } });
    const { result } = renderHook(() => useRecipeByMention('Mein-Rezept'), {
      wrapper: makeWrapper(true),
    });

    await waitFor(() => expect(result.current.source).toBe('own'));
  });
});
