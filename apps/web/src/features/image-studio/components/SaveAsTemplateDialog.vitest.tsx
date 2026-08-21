/**
 * Die beiden Knöpfe unterscheiden sich ausschliesslich im `visibility`-Feld —
 * ein vertauschter Wert wäre unsichtbar (beide Wege legen eine Vorlage an),
 * würde aber ein privates Sharepic in die öffentliche Prüfung schicken.
 */
import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { server } from '../../../test/msw-server';

import { SaveAsTemplateDialog } from './SaveAsTemplateDialog';

import { renderWithProviders } from '@/test-utils';

vi.mock('../renderSharepicToImage', () => ({
  renderSharepicToImage: () => Promise.resolve('data:image/png;base64,AAA'),
}));

vi.mock('../services/mediaUploadService', () => ({
  uploadBlobToMediaLibrary: () => Promise.resolve('https://media.example/preview.png'),
}));

const FROM_CANVAS = 'http://localhost/api/auth/user-templates/from-canvas';

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));

  // The dialog turns its rendered data: URL into a Blob via fetch(). MSW cannot
  // pass a data: URL through under `onUnhandledRequest: 'error'`, so serve those
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

  it('reicht auf Wunsch zur Prüfung ein', async () => {
    const captured = setupHandlers();
    renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Zur Galerie einreichen' }));

    await waitFor(() => expect(captured.current).not.toBeNull());
    expect(captured.current).toMatchObject({ visibility: 'submit' });
    expect(await screen.findByText(/wird geprüft/)).toBeInTheDocument();
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
