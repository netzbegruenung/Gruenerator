/**
 * Sharepics werden wie Dokumente per Link mit einzelnen Personen geteilt —
 * aber nur mit Anmeldung, nie öffentlich. Der Server lehnt „Öffentlich“ für
 * ein Sharepic ab; der Dialog bietet es deshalb gar nicht erst an.
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';

import { ShareCanvasDialog } from './ShareCanvasDialog';

import { server } from '@/test/msw-server';
import { axe, renderWithProviders } from '@/test-utils';

const CANVAS = 'canvas-7';
const DOCS = `http://localhost/api/docs/${CANVAS}`;

afterEach(() => {
  server.resetHandlers();
});

function setupHandlers(shareMode = 'private') {
  const writes: Array<{ path: string; body: Record<string, unknown> }> = [];
  server.use(
    http.get(`${DOCS}/permissions`, () => HttpResponse.json([])),
    http.get(`${DOCS}/groups`, () => HttpResponse.json([])),
    http.get('http://localhost/api/docs/groups/me', () => HttpResponse.json([])),
    http.get(`${DOCS}/share`, () =>
      HttpResponse.json({
        share_mode: shareMode,
        share_permission: 'editor',
        is_public: shareMode === 'public',
      })
    ),
    http.put(`${DOCS}/share/mode`, async ({ request }) => {
      writes.push({ path: 'mode', body: (await request.json()) as Record<string, unknown> });
      return HttpResponse.json({ success: true });
    })
  );
  return writes;
}

const renderDialog = () =>
  renderWithProviders(<ShareCanvasDialog canvasId={CANVAS} open onOpenChange={() => {}} />);

describe('ShareCanvasDialog', () => {
  it('bietet nur „Privat“ und „Mit Anmeldung“ an', async () => {
    setupHandlers();
    renderDialog();

    const select = await screen.findByLabelText('Zugriffsmodus');
    const values = within(select)
      .getAllByRole('option')
      .map((o) => (o as HTMLOptionElement).value);
    expect(values).toEqual(['private', 'authenticated']);
  });

  it('schaltet den Link mit Anmeldung frei und zeigt ihn an', async () => {
    const writes = setupHandlers();
    renderDialog();

    const select = await screen.findByLabelText('Zugriffsmodus');
    await userEvent.selectOptions(select, 'authenticated');

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toEqual({ path: 'mode', body: { mode: 'authenticated' } });
  });

  it('zeigt den Link eines geteilten Sharepics auf die Studio-Seite', async () => {
    setupHandlers('authenticated');
    renderDialog();

    expect(
      await screen.findByDisplayValue(`${window.location.origin}/studio/canvas/${CANVAS}`)
    ).toBeInTheDocument();
  });

  it('lässt ein schon öffentliches Sharepic sichtbar öffentlich, damit es zurückgenommen werden kann', async () => {
    setupHandlers('public');
    renderDialog();

    const select = await screen.findByLabelText('Zugriffsmodus');
    expect((select as HTMLSelectElement).value).toBe('public');
  });

  it('hat keine axe-Verstöße', async () => {
    setupHandlers('authenticated');
    const { baseElement } = renderDialog();
    await screen.findByLabelText('Zugriffsmodus');
    expect(await axe(baseElement)).toHaveNoViolations();
  });
});
