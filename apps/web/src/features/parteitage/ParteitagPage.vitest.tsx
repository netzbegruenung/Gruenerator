import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import { beforeAll, describe, expect, it } from 'vitest';

import { server } from '../../test/msw-server';
import { axe, renderWithProviders } from '../../test-utils';

import ParteitagPage from './ParteitagPage';

const BASE = 'http://localhost/api/parteitage';

const stats = {
  gesamt: { n: 2, topWoerter: [], anrede: [] },
  liste: { bloecke: [] },
  vergleichRaum: [],
  signaturRaum: {},
  methodik: [],
  grenzen: '',
} as never;

function speech(id: string, firstName: string, listPlace: number, extra = {}) {
  return {
    id,
    slug: `rede-${id}`,
    key: id,
    day: '2026-11-14',
    dayLabel: 'Samstag',
    listPlace,
    seatType: 'offen',
    firstName,
    lastName: 'Muster',
    kv: 'KV Essen',
    area: 'kreisfreie_stadt',
    contested: false,
    elected: true,
    resultPercent: 91.2,
    deliveredBy: null,
    topic: 'Klima',
    durationS: 125,
    wordCount: 300,
    analysis: {
      anrede: null,
      schluss: [],
      nennungen: {},
      signatur: '',
      wpm: null,
      woerter: 300,
      vorgetragen: false,
    },
    reelUrl: `/api/parteitage/media/${id}.mp4`,
    posterUrl: `/api/parteitage/media/${id}.jpg`,
    ...extra,
  };
}

const detail = {
  id: 'c1',
  slug: 'essen-2026',
  title: 'LDK Essen 2026',
  shortTitle: 'Essen',
  organizer: 'Grüne NRW',
  startsOn: '2026-11-14',
  endsOn: '2026-11-15',
  location: 'Essen',
  locked: false,
  speechCount: 2,
  stats,
  sourceLinks: [],
  reportUrl: null,
  speeches: [speech('s1', 'Anna', 1), speech('s2', 'Ben', 2, { resultPercent: null })],
};

function renderPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/parteitage/:slug" element={<ParteitagPage />} />
      <Route path="/parteitage" element={<p>Parteitage-Liste</p>} />
    </Routes>,
    { route: '/parteitage/essen-2026' }
  );
}

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

function lockedHandlers(unlockStatus: number) {
  let unlocked = false;
  server.use(
    http.get(`${BASE}/essen-2026`, () =>
      unlocked
        ? HttpResponse.json(detail)
        : HttpResponse.json(
            { success: false, code: 'LOCKED', message: 'gesperrt' },
            { status: 403 }
          )
    ),
    http.post(`${BASE}/essen-2026/entsperren`, () => {
      if (unlockStatus === 200) {
        unlocked = true;
        return HttpResponse.json({ success: true });
      }
      return HttpResponse.json(
        { success: false, code: 'WRONG_PASSWORD', message: 'falsch' },
        { status: unlockStatus }
      );
    })
  );
}

describe('ParteitagPage', () => {
  it('shows unlock dialog when convention is locked', async () => {
    lockedHandlers(200);
    renderPage();
    expect(await screen.findByLabelText('Passwort')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Entsperren' })).toBeInTheDocument();
  });

  it('wrong password shows error and stays locked', async () => {
    lockedHandlers(403);
    const { user } = renderPage();
    await user.type(await screen.findByLabelText('Passwort'), 'falsch');
    await user.click(screen.getByRole('button', { name: 'Entsperren' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Das Passwort stimmt nicht.');
    expect(screen.getByLabelText('Passwort')).toBeInTheDocument();
  });

  it('cancel on the unlock dialog goes to the list', async () => {
    lockedHandlers(200);
    const { user } = renderPage();
    await user.click(await screen.findByRole('button', { name: 'Abbrechen' }));
    expect(await screen.findByText('Parteitage-Liste')).toBeInTheDocument();
  });

  it('after unlock renders speech tiles', async () => {
    lockedHandlers(200);
    const { user } = renderPage();
    await user.type(await screen.findByLabelText('Passwort'), 'richtig');
    await user.click(screen.getByRole('button', { name: 'Entsperren' }));
    expect(await screen.findByText(/Anna Muster/)).toBeInTheDocument();
    expect(screen.getByText(/Ben Muster/)).toBeInTheDocument();
    expect(screen.getByText(/91,2 %/)).toBeInTheDocument();
  });

  describe('unlocked', () => {
    function open() {
      server.use(
        http.get(`${BASE}/essen-2026`, () => HttpResponse.json(detail)),
        http.get(`${BASE}/reden/s1`, () =>
          HttpResponse.json({ ...detail.speeches[0], transcript: 'Liebe Freund*innen' })
        )
      );
      return renderPage();
    }

    it('detail links', async () => {
      const { user } = open();
      await user.click(await screen.findByRole('button', { name: /Anna Muster/ }));
      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByRole('link', { name: 'In Editor laden' })).toHaveAttribute(
        'href',
        '/studio/videoeditor?parteitagRede=s1'
      );
      expect(within(dialog).getByRole('link', { name: 'Nur untertiteln' })).toHaveAttribute(
        'href',
        '/studio/video?parteitagRede=s1'
      );
      expect(within(dialog).getByRole('link', { name: 'Herunterladen' })).toHaveAttribute(
        'href',
        '/api/parteitage/media/s1.mp4?download=1'
      );
      await waitFor(() =>
        expect(within(dialog).getByText('Liebe Freund*innen')).toBeInTheDocument()
      );
    });

    it('hero shows the date range, the report and source links', async () => {
      server.use(
        http.get(`${BASE}/essen-2026`, () =>
          HttpResponse.json({
            ...detail,
            reportUrl: '/api/parteitage/media/rep',
            sourceLinks: [{ label: 'Livestream Samstag', url: 'https://example.org/live' }],
          })
        )
      );
      renderPage();
      expect(await screen.findByText(/14\.–15\. November 2026/)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Bericht (PDF)' })).toHaveAttribute(
        'href',
        '/api/parteitage/media/rep?download=1'
      );
      const live = screen.getByRole('link', { name: 'Livestream Samstag' });
      expect(live).toHaveAttribute('href', 'https://example.org/live');
      expect(live).toHaveAttribute('target', '_blank');
      expect(live).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('video carries a German captions track', async () => {
      const { user } = open();
      await user.click(await screen.findByRole('button', { name: /Anna Muster/ }));
      const dialog = await screen.findByRole('dialog');
      const track = dialog.querySelector('video track');
      expect(track).toHaveAttribute('kind', 'captions');
      expect(track).toHaveAttribute('srclang', 'de');
      expect(track).toHaveAttribute('src', '/api/parteitage/reden/s1/untertitel.vtt');
    });

    it('axe has no violations on the grid', async () => {
      const { container } = open();
      await screen.findByText(/Anna Muster/);
      expect(await axe(container)).toHaveNoViolations();
    });
  });

  it('axe has no violations on the unlock dialog', async () => {
    lockedHandlers(200);
    renderPage();
    await screen.findByLabelText('Passwort');
    expect(await axe(document.body)).toHaveNoViolations();
  });
});
