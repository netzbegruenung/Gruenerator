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
const DOCS = `http://localhost/api/docs/${CANVAS}`;

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
    renderWithProviders(
      <ShareVorlageDialog title={template.title} owned={template} open onOpenChange={() => {}} />
    );

    const select = await screen.findByLabelText('Zugriffsmodus');
    await userEvent.selectOptions(select, 'authenticated');

    await waitFor(() => expect(writes).toHaveLength(2));
    expect(writes[0]).toEqual({ path: 'mode', body: { mode: 'authenticated' } });
    expect(writes[1]).toEqual({ path: 'permission', body: { permission: 'viewer' } });
  });

  it('schreibt beim Zurücknehmen auf privat keine Link-Berechtigung', async () => {
    const writes = setupHandlers('public');
    renderWithProviders(
      <ShareVorlageDialog title={template.title} owned={template} open onOpenChange={() => {}} />
    );

    const select = await screen.findByLabelText('Zugriffsmodus');
    await userEvent.selectOptions(select, 'private');

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toEqual({ path: 'mode', body: { mode: 'private' } });
  });

  it('zeigt den Link auf die geteilte Vorlage, nicht auf den Schnappschuss-Canvas', async () => {
    setupHandlers('public');
    renderWithProviders(
      <ShareVorlageDialog title={template.title} owned={template} open onOpenChange={() => {}} />
    );

    const link = await screen.findByDisplayValue(/\/vorlagen\/v\/tpl-1$/);
    expect(link).toBeInTheDocument();
  });

  it('übernimmt eine neue Projekt-Berechtigung sofort, nicht erst nach der Antwort', async () => {
    setupHandlers('public');
    let release = () => {};
    const answered = new Promise<void>((r) => (release = r));
    server.use(
      http.get('http://localhost/api/docs/groups/me', () =>
        HttpResponse.json([{ id: 'g1', name: 'KV Musterstadt', role: 'member' }])
      ),
      http.get(`${DOCS}/groups`, () =>
        HttpResponse.json([
          {
            group_id: 'g1',
            group_name: 'KV Musterstadt',
            permission_level: 'editor',
            shared_at: '',
          },
        ])
      ),
      http.put(`${DOCS}/groups/g1`, async () => {
        await answered;
        return HttpResponse.json({ success: true });
      })
    );
    renderWithProviders(
      <ShareVorlageDialog title={template.title} owned={template} open onOpenChange={() => {}} />
    );

    await screen.findByText('KV Musterstadt');
    const select = screen.getByDisplayValue('Bearbeiten');
    await userEvent.selectOptions(select, 'viewer');

    // Without the optimistic write the controlled select snapped back to
    // „Bearbeiten" until the server answered.
    expect(select).toHaveValue('viewer');
    release();
  });

  it('belegt in Team-Projekten „Bearbeiten“ vor, sonst „Nur lesen“', async () => {
    setupHandlers('public');
    let body: unknown = null;
    server.use(
      http.get('http://localhost/api/docs/groups/me', () =>
        HttpResponse.json([
          { id: 'team', name: 'KV Musterstadt', role: 'member', team: true },
          { id: 'mine', name: 'Mein Projekt', role: 'admin', team: false },
        ])
      ),
      http.post(`${DOCS}/groups`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ success: true });
      })
    );
    renderWithProviders(
      <ShareVorlageDialog title={template.title} owned={template} open onOpenChange={() => {}} />
    );

    const project = await screen.findByDisplayValue('Projekt auswählen...');
    const role = screen.getByLabelText('Mitglieder können');
    await userEvent.selectOptions(project, 'mine');
    expect(role).toHaveValue('viewer');
    await userEvent.selectOptions(project, 'team');
    expect(role).toHaveValue('editor');

    await userEvent.click(screen.getByRole('button', { name: 'Teilen' }));
    await waitFor(() => expect(body).toEqual({ group_id: 'team', permission_level: 'editor' }));
  });

  it('zeigt den Satz des Servers, wenn das Projekt das Teilen ablehnt', async () => {
    setupHandlers('public');
    server.use(
      http.get('http://localhost/api/docs/groups/me', () =>
        HttpResponse.json([{ id: 'team', name: 'KV Musterstadt', role: 'member', team: true }])
      ),
      http.post(`${DOCS}/groups`, () =>
        HttpResponse.json({ error: 'Du kannst in diesem Projekt nichts teilen.' }, { status: 403 })
      )
    );
    renderWithProviders(
      <ShareVorlageDialog title={template.title} owned={template} open onOpenChange={() => {}} />
    );

    await userEvent.selectOptions(await screen.findByDisplayValue('Projekt auswählen...'), 'team');
    await userEvent.click(screen.getByRole('button', { name: 'Teilen' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Du kannst in diesem Projekt nichts teilen.'
    );
  });

  it('hat keine a11y-Verstöße', async () => {
    setupHandlers('public');
    const { container } = renderWithProviders(
      <ShareVorlageDialog title={template.title} owned={template} open onOpenChange={() => {}} />
    );

    await screen.findByLabelText('Zugriffsmodus');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('bietet für eine Vorlage ohne Schnappschuss kein Teilen an', async () => {
    setupHandlers();
    renderWithProviders(
      <ShareVorlageDialog
        title={template.title}
        owned={{ ...template, content_data: {} } as Template}
        open
        onOpenChange={() => {}}
      />
    );

    expect(await screen.findByText(/nur Grünerator-Vorlagen/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Zugriffsmodus')).not.toBeInTheDocument();
  });

  it('reicht fremde Vorlagen nur per Link weiter, ohne Zugriffseinstellungen', async () => {
    renderWithProviders(
      <ShareVorlageDialog
        title="Plakat"
        url="https://www.canva.com/design/x"
        open
        onOpenChange={() => {}}
      />
    );

    expect(await screen.findByDisplayValue('https://www.canva.com/design/x')).toBeInTheDocument();
    expect(screen.queryByLabelText('Zugriffsmodus')).not.toBeInTheDocument();
  });

  it('bietet „Direkt teilen" erst an, wenn der Zugriffsmodus geladen ist', async () => {
    Object.defineProperty(navigator, 'share', {
      value: () => Promise.resolve(),
      configurable: true,
    });
    setupHandlers('private');
    renderWithProviders(
      <ShareVorlageDialog title={template.title} owned={template} open onOpenChange={() => {}} />
    );

    expect(screen.queryByRole('button', { name: /Direkt teilen/ })).not.toBeInTheDocument();
    await screen.findByLabelText('Zugriffsmodus');
    expect(screen.queryByRole('button', { name: /Direkt teilen/ })).not.toBeInTheDocument();
    Reflect.deleteProperty(navigator, 'share');
  });
});
