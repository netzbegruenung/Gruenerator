import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeAll, describe, expect, it } from 'vitest';

import { server } from '../../../test/msw-server';
import { renderWithProviders } from '../../../test-utils';
import ReportsTabLabel from '../components/ReportsTabLabel';

import ReportsTab from './ReportsTab';

const LIST = 'http://localhost/api/auth/admin/reports';
const RESOLVE = 'http://localhost/api/auth/admin/reports/resolve';

const group = {
  kind: 'studio_asset',
  targetId: 'a-1',
  reportCount: 3,
  reasons: [
    { reason: 'offensive', count: 2 },
    { reason: 'other', count: 1 },
  ],
  latestAt: '2026-10-14T10:00:00.000Z',
  notes: [{ note: 'Das ist unpassend', createdAt: '2026-10-14T10:00:00.000Z' }],
  status: 'open',
  excerpt: null,
  groupId: null,
  threadId: null,
  target: {
    id: 'a-1',
    title: 'Herz',
    src: 'https://example.org/herz.png',
    thumbUrl: null,
    kind: 'sticker',
    moderation: 'hidden',
    ownerId: 'u-2',
    ownerName: 'Eva',
    trashed: false,
  },
};

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

describe('ReportsTab', () => {
  it('renders a studio asset group and resolves via the endpoint', async () => {
    let body: unknown = null;
    server.use(
      http.get(LIST, () => HttpResponse.json({ reports: [group] })),
      http.get(`${LIST}/stats`, () => HttpResponse.json({ open: 1 })),
      http.post(RESOLVE, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ resolved: 3, moderation: 'ok' });
      })
    );
    const { user } = renderWithProviders(<ReportsTab />);

    expect(await screen.findByText('Herz')).toBeInTheDocument();
    expect(screen.getByText(/von Eva/)).toBeInTheDocument();
    expect(screen.getByText(/3 Meldungen/)).toBeInTheDocument();
    expect(screen.getByText('Beleidigend oder hasserfüllt (2)')).toBeInTheDocument();
    expect(screen.getByText('Ausgeblendet')).toBeInTheDocument();
    expect(screen.getByText('„Das ist unpassend“')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Verwerfen' }));

    await waitFor(() =>
      expect(body).toEqual({ kind: 'studio_asset', targetId: 'a-1', action: 'dismiss' })
    );
  });

  it('still offers every action on an asset the owner moved to the Papierkorb', async () => {
    server.use(
      http.get(LIST, () =>
        HttpResponse.json({ reports: [{ ...group, target: { ...group.target, trashed: true } }] })
      )
    );
    renderWithProviders(<ReportsTab />);

    expect(await screen.findByText('Im Papierkorb')).toBeInTheDocument();
    for (const name of ['Entfernen', 'Wiederherstellen', 'Verwerfen']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('shows a removed asset from its file, not from the blocked thumbnail', async () => {
    const thumbUrl = 'http://localhost/api/thumbs/media/t/v/w200.webp';
    server.use(
      http.get(LIST, () =>
        HttpResponse.json({
          reports: [{ ...group, target: { ...group.target, moderation: 'removed', thumbUrl } }],
        })
      )
    );
    const { container } = renderWithProviders(<ReportsTab />);

    expect(await screen.findByText('Entfernt')).toBeInTheDocument();
    expect(container.querySelector('img')?.getAttribute('src')).toBe(group.target.src);
  });

  it('asks for confirmation before removing', async () => {
    let body: unknown = null;
    server.use(
      http.get(LIST, () => HttpResponse.json({ reports: [group] })),
      http.post(RESOLVE, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ resolved: 3, moderation: 'removed' });
      })
    );
    const { user } = renderWithProviders(<ReportsTab />);

    await user.click(await screen.findByRole('button', { name: 'Entfernen' }));
    expect(body).toBeNull();
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Entfernen' }));

    await waitFor(() =>
      expect(body).toEqual({ kind: 'studio_asset', targetId: 'a-1', action: 'remove' })
    );
  });

  it('tells screen readers that the tab count means open reports', async () => {
    server.use(http.get(`${LIST}/stats`, () => HttpResponse.json({ open: 2 })));
    const { container } = renderWithProviders(<ReportsTabLabel />);
    await waitFor(() => expect(container).toHaveTextContent('Meldungen(2 offen)'));
  });
});
