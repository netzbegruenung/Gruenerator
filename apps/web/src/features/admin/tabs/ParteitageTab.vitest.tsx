import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { http, HttpResponse } from 'msw';
import { beforeAll, describe, expect, it } from 'vitest';

import { server } from '../../../test/msw-server';
import { axe, renderWithProviders, screen, userEvent, waitFor, within } from '../../../test-utils';

import ParteitageTab from './ParteitageTab';

const base = 'http://localhost/api';

const convention = {
  id: 'c-1',
  slug: 'essen-2026',
  title: 'LDK Essen 2026',
  shortTitle: 'Essen',
  organizer: 'NRW',
  startsOn: '2026-01-10',
  endsOn: '2026-01-11',
  location: 'Essen',
  locked: false,
  speechCount: 1,
  key: 'essen-2026',
  status: 'published',
  audience: 'all',
};

const speech = {
  id: 's-1',
  slug: 'erika-muster',
  firstName: 'Erika',
  lastName: 'Muster',
};

function stub() {
  server.use(
    http.get(`${base}/admin/parteitage`, () => HttpResponse.json({ conventions: [convention] })),
    http.get(`${base}/parteitage/essen-2026`, () =>
      HttpResponse.json({ ...convention, speeches: [speech] })
    )
  );
}

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: base, authMode: 'cookie' }));
});

describe('ParteitageTab', () => {
  it('delete asks for confirmation and calls deleteSpeech', async () => {
    stub();
    let deleted: string | null = null;
    server.use(
      http.delete(`${base}/admin/parteitage/reden/:id`, ({ params }) => {
        deleted = String(params.id);
        return HttpResponse.json({ success: true });
      })
    );
    const user = userEvent.setup();
    const { container } = renderWithProviders(<ParteitageTab />);

    await user.click(await screen.findByRole('button', { name: 'Reden verwalten' }));
    await user.click(await screen.findByRole('button', { name: 'Erika Muster löschen' }));

    expect(
      screen.getByText(
        'Reel, Transkript und Wortzeiten werden gelöscht. Ein erneuter Import holt die Rede nicht zurück.'
      )
    ).toBeInTheDocument();
    expect(deleted).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Endgültig löschen' }));
    await waitFor(() => expect(deleted).toBe('s-1'));
    expect(await axe(container)).toHaveNoViolations();
  });

  it('clearing password sends password: null', async () => {
    stub();
    let body: unknown = null;
    server.use(
      http.patch(`${base}/admin/parteitage/:id`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ success: true });
      })
    );
    const user = userEvent.setup();
    renderWithProviders(<ParteitageTab />);

    await user.click(await screen.findByRole('button', { name: 'Passwort entfernen' }));
    expect(
      screen.getByText('Danach sehen alle Eingeloggten diesen Parteitag.')
    ).toBeInTheDocument();
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Passwort entfernen' })
    );
    await waitFor(() => expect(body).toEqual({ password: null }));
  });

  it('hiding a speech sends the reason', async () => {
    stub();
    let body: unknown = null;
    server.use(
      http.patch(`${base}/admin/parteitage/reden/s-1`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ success: true });
      })
    );
    const user = userEvent.setup();
    renderWithProviders(<ParteitageTab />);

    await user.click(await screen.findByRole('button', { name: 'Reden verwalten' }));
    await user.type(await screen.findByLabelText('Grund für Erika Muster'), 'Persönlichkeitsrecht');
    await user.click(screen.getByRole('button', { name: 'Erika Muster ausblenden' }));
    await waitFor(() => expect(body).toEqual({ hidden: true, reason: 'Persönlichkeitsrecht' }));
    expect(await screen.findByText(/ausgeblendet\)/)).toBeInTheDocument();
  });
});
