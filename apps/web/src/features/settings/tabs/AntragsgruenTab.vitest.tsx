/**
 * The Antragsgrün section: hidden where nothing can be created and nothing
 * exists, honest about what "entfernen" does while the Grünerator is still a
 * site admin, and only then forgetting the site. Connecting an existing site
 * shows the server's reason when it refuses.
 */
import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { server } from '../../../test/msw-server';
import { renderWithProviders, screen, waitFor } from '../../../test-utils';

import AntragsgruenTab from './AntragsgruenTab';

const LIST = 'http://localhost/api/auth/antragsgruen-sites';
const ACCESS = `${LIST}/access`;
const SITE_ID = '00000000-0000-4000-8000-000000000001';

const SITE = {
  id: SITE_ID,
  title: 'KMV Köln 2027',
  url: 'https://kv-koeln.antragsgruen.de/kv-koeln',
  usersUrl: 'https://kv-koeln.antragsgruen.de/kv-koeln/admin/users',
  kind: 'created',
  createdAt: '2026-11-16T10:00:00.000Z',
};

function list(body: object) {
  return http.get(LIST, () =>
    HttpResponse.json({ enabled: true, botAccount: 'bot@gruenerator.de', limit: 3, ...body })
  );
}

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

afterEach(() => {
  server.resetHandlers();
});

describe('AntragsgruenTab', () => {
  it('marks the feature experimental and points to the chat when there is no site', async () => {
    server.use(list({ sites: [] }));
    renderWithProviders(<AntragsgruenTab />);
    expect(await screen.findByText('Experimentell')).toBeInTheDocument();
    expect(screen.getByText(/Noch keine Seite/)).toBeInTheDocument();
  });

  it('explains how to remove the Grünerator while it is still admin', async () => {
    server.use(
      list({ sites: [SITE] }),
      http.get(ACCESS, () => HttpResponse.json({ access: { [SITE_ID]: 'admin' } }))
    );
    const { user } = renderWithProviders(<AntragsgruenTab />);
    expect(await screen.findByText('Der Grünerator ist dort Admin')).toBeInTheDocument();
    expect(screen.getByText('1 von 3 Seiten')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Zugriff entziehen' }));
    expect(
      screen.getByRole('link', { name: 'Personenverwaltung deiner Seite öffnen' })
    ).toHaveAttribute('href', SITE.usersUrl);
    expect(screen.getByText('bot@gruenerator.de')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Nur aus der Liste entfernen' }));
    expect(screen.getByText(/bleibt dort Admin, bis du es austrägst/)).toBeInTheDocument();
  });

  it('forgets a site the Grünerator no longer has access to', async () => {
    let deleted: string | null = null;
    server.use(
      list({ sites: [SITE] }),
      http.get(ACCESS, () => HttpResponse.json({ access: { [SITE_ID]: 'removed' } })),
      http.delete(`${LIST}/:id`, ({ params }) => {
        deleted = String(params.id);
        return HttpResponse.json({ success: true });
      })
    );
    const { user } = renderWithProviders(<AntragsgruenTab />);
    await user.click(await screen.findByRole('button', { name: 'Aus der Liste entfernen' }));
    expect(screen.queryByText(/bleibt dort Admin/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Entfernen' }));
    await waitFor(() => expect(deleted).toBe(SITE_ID));
  });

  it('connects an existing site and shows why antragsgruen.de refused', async () => {
    const posted: unknown[] = [];
    let sites: object[] = [];
    server.use(
      http.get(LIST, () =>
        HttpResponse.json({ enabled: true, botAccount: 'bot@gruenerator.de', limit: 3, sites })
      ),
      http.get(ACCESS, () => HttpResponse.json({ access: { [SITE_ID]: 'admin' } })),
      http.post(LIST, async ({ request }) => {
        posted.push(await request.json());
        if (posted.length === 1) {
          return HttpResponse.json(
            { error: 'Dein Grünerator-Konto (a@b.de) ist auf dieser Seite nicht Admin.' },
            { status: 400 }
          );
        }
        const site = { ...SITE, kind: 'connected' };
        sites = [site];
        return HttpResponse.json(site, { status: 201 });
      })
    );
    const { user } = renderWithProviders(<AntragsgruenTab />);
    await user.click(await screen.findByRole('button', { name: 'Bestehende Seite verbinden' }));
    await user.type(
      screen.getByLabelText('Adresse der Antragsgrün-Seite'),
      'kv-koeln.antragsgruen.de/kv-koeln'
    );
    // Ohne https:// darf der Browser das Absenden nicht blockieren.
    await user.click(screen.getByRole('button', { name: 'Verbinden' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/nicht Admin/);

    await user.click(screen.getByRole('button', { name: 'Verbinden' }));
    expect(await screen.findByText(/verbunden am/)).toBeInTheDocument();
    expect(posted).toEqual([
      { url: 'kv-koeln.antragsgruen.de/kv-koeln' },
      { url: 'kv-koeln.antragsgruen.de/kv-koeln' },
    ]);
    // A connected site does not count against the limit for created sites.
    expect(screen.queryByText(/von 3 Seiten/)).not.toBeInTheDocument();
  });

  it('offers no connecting where the feature is off', async () => {
    server.use(
      http.get(LIST, () =>
        HttpResponse.json({ enabled: false, botAccount: null, limit: 3, sites: [SITE] })
      ),
      http.get(ACCESS, () => HttpResponse.json({ access: { [SITE_ID]: 'admin' } }))
    );
    renderWithProviders(<AntragsgruenTab />);
    expect(await screen.findByText('KMV Köln 2027')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Bestehende Seite verbinden' })
    ).not.toBeInTheDocument();
  });
});
