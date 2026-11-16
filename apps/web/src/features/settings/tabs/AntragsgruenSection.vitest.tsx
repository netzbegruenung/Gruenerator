/**
 * The Antragsgrün section: hidden where nothing can be created and nothing
 * exists, honest about what "entfernen" does while the Grünerator is still a
 * site admin, and only then forgetting the site.
 */
import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { server } from '../../../test/msw-server';
import { renderWithProviders, screen, waitFor } from '../../../test-utils';

import AntragsgruenSection from './AntragsgruenSection';

const LIST = 'http://localhost/api/auth/antragsgruen-sites';
const ACCESS = `${LIST}/access`;
const SITE_ID = '00000000-0000-4000-8000-000000000001';

const SITE = {
  id: SITE_ID,
  title: 'KMV Köln 2027',
  url: 'https://kv-koeln.antragsgruen.de/kv-koeln',
  usersUrl: 'https://kv-koeln.antragsgruen.de/kv-koeln/admin/users',
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

describe('AntragsgruenSection', () => {
  it('renders nothing where sites cannot be created and none exist', async () => {
    let asked = false;
    server.use(
      http.get(LIST, () => {
        asked = true;
        return HttpResponse.json({ enabled: false, botAccount: null, limit: 3, sites: [] });
      })
    );
    const { container } = renderWithProviders(<AntragsgruenSection />);
    await waitFor(() => expect(asked).toBe(true));
    expect(container).toBeEmptyDOMElement();
  });

  it('marks the feature experimental and points to the chat when there is no site', async () => {
    server.use(list({ sites: [] }));
    renderWithProviders(<AntragsgruenSection />);
    expect(await screen.findByText('Experimentell')).toBeInTheDocument();
    expect(screen.getByText(/Noch keine Seite/)).toBeInTheDocument();
  });

  it('explains how to remove the Grünerator while it is still admin', async () => {
    server.use(
      list({ sites: [SITE] }),
      http.get(ACCESS, () => HttpResponse.json({ access: { [SITE_ID]: 'admin' } }))
    );
    const { user } = renderWithProviders(<AntragsgruenSection />);
    expect(await screen.findByText('Der Grünerator ist dort Admin')).toBeInTheDocument();
    expect(screen.getByText('1 von 3')).toBeInTheDocument();

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
    const { user } = renderWithProviders(<AntragsgruenSection />);
    await user.click(await screen.findByRole('button', { name: 'Aus der Liste entfernen' }));
    expect(screen.queryByText(/bleibt dort Admin/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Entfernen' }));
    await waitFor(() => expect(deleted).toBe(SITE_ID));
  });
});
