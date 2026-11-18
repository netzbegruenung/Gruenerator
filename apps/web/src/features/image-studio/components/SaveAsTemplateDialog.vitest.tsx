/**
 * Gespeichert wird immer privat — die Galerie-Einreichung lebt in Meine
 * Vorlagen. Direkt nach dem Speichern bietet der Dialog das Teilen der neuen
 * Vorlage an; dafür muss er sie als eigene erkennen.
 */
import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { server } from '../../../test/msw-server';

import { SaveAsTemplateDialog } from './SaveAsTemplateDialog';

import { renderWithProviders } from '@/test-utils';

const { renderSharepicToImage } = vi.hoisted(() => ({
  renderSharepicToImage: vi.fn(() => Promise.resolve('data:image/png;base64,AAA')),
}));
vi.mock('../renderSharepicToImage', () => ({ renderSharepicToImage }));

// The share step recognises the new Vorlage as the viewer's own via this list.
vi.mock('@/features/auth/hooks/useProfileData', () => ({
  useUserTemplates: () => ({
    query: {
      data: [{ id: 'tpl-9', title: 'Mein Sharepic', content_data: { canvasId: 'snap-9' } }],
      isFetching: false,
    },
  }),
}));

vi.mock('../services/mediaUploadService', () => ({
  uploadBlobToMediaLibrary: () => Promise.resolve('https://media.example/preview.png'),
}));

const FROM_CANVAS = 'http://localhost/api/auth/user-templates/from-canvas';

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));

  // The dialog turns its rendered data: URL into a Blob via fetch(). MSW cannot
  // pass a data: URL through under `onUnhandledFrame: 'error'`, so serve those
  // here and leave every http(s) request to MSW.
  const realFetch = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith('data:')) {
      // String body, not a jsdom Blob — undici's Response reads `.stream()`,
      // which jsdom's Blob does not implement.
      return Promise.resolve(new Response('img', { headers: { 'content-type': 'image/png' } }));
    }
    return realFetch(input, init);
  }) as typeof globalThis.fetch;
});

afterEach(() => {
  server.resetHandlers();
  vi.restoreAllMocks();
});

/** Captures the POST body and stubs the live-state read. */
function setupHandlers(): { current: Record<string, unknown> | null } {
  const captured: { current: Record<string, unknown> | null } = { current: null };
  server.use(
    http.get('http://localhost/api/canvas/:id/state', () =>
      HttpResponse.json({ state: { headline: 'Hallo' } })
    ),
    http.post(FROM_CANVAS, async ({ request }) => {
      captured.current = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json(
        { success: true, data: { id: 'tpl-9' }, message: 'ok' },
        { status: 201 }
      );
    })
  );
  return captured;
}

function renderDialog(open = true) {
  return renderWithProviders(
    <SaveAsTemplateDialog
      canvasId="canvas-1"
      canvasType="dreizeilen"
      initialState={{ headline: 'Hallo' }}
      defaultTitle="Mein Sharepic"
      open={open}
      onOpenChange={() => {}}
    />
  );
}

describe('SaveAsTemplateDialog', () => {
  it('speichert privat, ohne die Galerie zu behelligen', async () => {
    const captured = setupHandlers();
    renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Für mich speichern' }));

    await waitFor(() => expect(captured.current).not.toBeNull());
    expect(captured.current).toMatchObject({
      canvasId: 'canvas-1',
      title: 'Mein Sharepic',
      visibility: 'private',
    });
    expect(await screen.findByText('Vorlage gespeichert.')).toBeInTheDocument();
  });

  it('bietet keine Galerie-Einreichung an', () => {
    setupHandlers();
    renderDialog();

    expect(screen.queryByRole('button', { name: /Galerie/ })).not.toBeInTheDocument();
  });

  it('zeigt nach dem Speichern die Teilen-Einstellungen der neuen Vorlage', async () => {
    setupHandlers();
    const DOCS = 'http://localhost/api/docs/snap-9';
    server.use(
      http.get(`${DOCS}/permissions`, () => HttpResponse.json([])),
      http.get(`${DOCS}/groups`, () => HttpResponse.json([])),
      http.get('http://localhost/api/docs/groups/me', () => HttpResponse.json([])),
      http.get(`${DOCS}/share`, () =>
        HttpResponse.json({ share_mode: 'private', share_permission: 'viewer', is_public: false })
      )
    );
    renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Für mich speichern' }));

    expect(await screen.findByText('Vorlage gespeichert.')).toBeInTheDocument();
    expect(await screen.findByLabelText('Zugriffsmodus')).toBeInTheDocument();
  });

  it('rendert das Vorschaubild im Format des Canvas', async () => {
    const captured = setupHandlers();
    renderWithProviders(
      <SaveAsTemplateDialog
        canvasId="canvas-1"
        canvasType="freeform"
        initialState={{}}
        formatId="post-portrait-tall"
        open
        onOpenChange={() => {}}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Für mich speichern' }));

    await waitFor(() => expect(captured.current).not.toBeNull());
    expect(renderSharepicToImage).toHaveBeenLastCalledWith('freeform', expect.anything(), {
      formatId: 'post-portrait-tall',
    });
  });

  it('legt für jede Seite eines Karussells ein Vorschaubild an', async () => {
    const captured = setupHandlers();
    server.use(
      http.get('http://localhost/api/canvas/:id/state', () =>
        HttpResponse.json({
          state: { headline: 'Eins' },
          source: 'yjs',
          version: 1,
          pages: [{ headline: 'Eins' }, { headline: 'Zwei' }],
        })
      )
    );
    renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Für mich speichern' }));

    await waitFor(() => expect(captured.current).not.toBeNull());
    expect(renderSharepicToImage).toHaveBeenCalledWith(
      'dreizeilen',
      { headline: 'Zwei' },
      expect.anything()
    );
    expect(captured.current?.images).toHaveLength(2);
  });

  it('zeigt beim erneuten Öffnen wieder das Formular, nicht die alte Erfolgsmeldung', async () => {
    setupHandlers();
    const { rerender } = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Für mich speichern' }));
    expect(await screen.findByText('Vorlage gespeichert.')).toBeInTheDocument();

    rerender(
      <SaveAsTemplateDialog
        canvasId="canvas-1"
        canvasType="dreizeilen"
        initialState={{ headline: 'Hallo' }}
        defaultTitle="Mein Sharepic"
        open={false}
        onOpenChange={() => {}}
      />
    );
    rerender(
      <SaveAsTemplateDialog
        canvasId="canvas-1"
        canvasType="dreizeilen"
        initialState={{ headline: 'Hallo' }}
        defaultTitle="Mein Sharepic"
        open
        onOpenChange={() => {}}
      />
    );

    expect(await screen.findByRole('button', { name: 'Für mich speichern' })).toBeInTheDocument();
    expect(screen.queryByText('Vorlage gespeichert.')).not.toBeInTheDocument();
  });
});
