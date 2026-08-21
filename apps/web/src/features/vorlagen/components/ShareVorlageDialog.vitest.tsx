/**
 * Eine Vorlage ist ein eingefrorener Schnappschuss: wer dem Link folgt, darf
 * kopieren, niemals bearbeiten.
 *
 * Der generische Dokument-Endpunkt behält beim Wechsel auf „Mit Anmeldung" die
 * bisherige Link-Berechtigung, und die ist standardmäßig `editor` — jede*r
 * Angemeldete mit dem Link hätte damit Schreibrecht am Original. Der Dialog
 * setzt deshalb sofort `viewer` hinterher. Das ist unsichtbar, solange niemand
 * es prüft, also wird hier der tatsächlich gesendete Rumpf beobachtet.
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';

import { type Template } from '../types';

import { ShareVorlageDialog } from './ShareVorlageDialog';

import { server } from '@/test/msw-server';
import { axe, renderWithProviders } from '@/test-utils';

const CANVAS = 'canvas-7';
const DOCS = `http://localhost:3000/api/docs/${CANVAS}`;

const template = {
  id: 'tpl-1',
  title: 'Meine Vorlage',
  template_type: 'gruenerator',
  content_data: { canvasId: CANVAS },
} as Template;

afterEach(() => {
  server.resetHandlers();
});

/** Stubs the four reads and records every share write in order. */
function setupHandlers(shareMode = 'private') {
  const writes: Array<{ path: string; body: Record<string, unknown> }> = [];
  server.use(
    http.get(`${DOCS}/permissions`, () => HttpResponse.json([])),
    http.get(`${DOCS}/groups`, () => HttpResponse.json([])),
    http.get('http://localhost:3000/api/docs/groups/me', () => HttpResponse.json([])),
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
    }),
    http.put(`${DOCS}/share/permission`, async ({ request }) => {
      writes.push({ path: 'permission', body: (await request.json()) as Record<string, unknown> });
      return HttpResponse.json({ success: true });
    })
  );
  return writes;
}

describe('ShareVorlageDialog', () => {
  it('pinnt die Link-Berechtigung auf viewer, sobald ein Link entsteht', async () => {
    const writes = setupHandlers();
    renderWithProviders(<ShareVorlageDialog template={template} open onOpenChange={() => {}} />);

    const select = await screen.findByLabelText('Zugriffsmodus');
    await userEvent.selectOptions(select, 'authenticated');

    await waitFor(() => expect(writes).toHaveLength(2));
    expect(writes[0]).toEqual({ path: 'mode', body: { mode: 'authenticated' } });
    expect(writes[1]).toEqual({ path: 'permission', body: { permission: 'viewer' } });
  });

  it('schreibt beim Zurücknehmen auf privat keine Link-Berechtigung', async () => {
    const writes = setupHandlers('public');
    renderWithProviders(<ShareVorlageDialog template={template} open onOpenChange={() => {}} />);

    const select = await screen.findByLabelText('Zugriffsmodus');
    await userEvent.selectOptions(select, 'private');

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toEqual({ path: 'mode', body: { mode: 'private' } });
  });

  it('zeigt den Link auf die geteilte Vorlage, nicht auf den Schnappschuss-Canvas', async () => {
    setupHandlers('public');
    renderWithProviders(<ShareVorlageDialog template={template} open onOpenChange={() => {}} />);

    const link = await screen.findByDisplayValue(/\/vorlagen\/v\/tpl-1$/);
    expect(link).toBeInTheDocument();
  });

  it('hat keine a11y-Verstöße', async () => {
    setupHandlers('public');
    const { container } = renderWithProviders(
      <ShareVorlageDialog template={template} open onOpenChange={() => {}} />
    );

    await screen.findByLabelText('Zugriffsmodus');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('bietet für eine Vorlage ohne Schnappschuss kein Teilen an', async () => {
    setupHandlers();
    renderWithProviders(
      <ShareVorlageDialog
        template={{ ...template, content_data: {} } as Template}
        open
        onOpenChange={() => {}}
      />
    );

    expect(await screen.findByText(/nur Grünerator-Vorlagen/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Zugriffsmodus')).not.toBeInTheDocument();
  });
});
