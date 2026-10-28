/**
 * Testseite /labor/bundestag: plan → Kandidaten wählen → answer, mit den
 * Fehlerfällen 403/429/500 und axe über die volle Ergebnisansicht.
 */
import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { http, HttpResponse } from 'msw';
import { beforeAll, describe, expect, it } from 'vitest';

import { server } from '../../test/msw-server';
import { axe, renderWithProviders, screen, waitFor } from '../../test-utils';

import { BundestagQaPage } from './BundestagQaPage';

const PLAN = 'http://localhost/api/bundestag/plan';
const ANSWER = 'http://localhost/api/bundestag/answer';

const planBody = {
  filters: { wahlperiode: [21], drucksachetyp: ['Antrag'] },
  keywords: ['klima'],
  notes: ['Zeitraum auf Wahlperiode 21 gesetzt'],
  totals: { vorgaenge: 79, drucksachen: 120 },
  candidates: [
    {
      ref: '21/100',
      dipId: '1',
      kind: 'drucksache',
      dokumentnummer: '21/100',
      drucksachetyp: 'Antrag',
      titel: 'Klimaschutz stärken',
      datum: '2026-01-02',
      urheber: ['Fraktion der SPD'],
      pdfUrl: 'https://dserver.bundestag.de/btd/21/001/2100100.pdf',
      vorgangId: null,
      vorgangTitel: null,
      abstract: null,
      aktualisiert: null,
      beratung: null,
    },
  ],
};

const answerBody = {
  answer: 'Der Antrag will mehr Klimaschutz [1]. Weiteres unbelegt [7].',
  citations: [
    {
      n: 1,
      ref: '21/100',
      drucksachetyp: 'Antrag',
      datum: '2026-01-02',
      titel: 'Klimaschutz stärken',
      pdfUrl: null,
      aussage: 'Mehr Klimaschutz',
      zitat: 'Der Bundestag fordert mehr Klimaschutz.',
    },
  ],
  documents: [
    {
      ref: '21/100',
      drucksachetyp: 'Antrag',
      titel: 'Klimaschutz stärken',
      textSource: 'pdf',
      relevant: true,
      points: [],
      droppedPoints: 0,
      windowsRead: 1,
      windowsTotal: 1,
      skipped: null,
    },
  ],
  filters: {},
  notes: [],
  stats: {
    msTotal: 5000,
    msRead: 4000,
    charsRead: 1234,
    pointsVerified: 1,
    pointsDropped: 0,
    invalidCitations: 1,
  },
};

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

async function askAndPlan(user: ReturnType<typeof renderWithProviders>['user']) {
  await user.type(screen.getByLabelText('Frage an den Bundestag'), 'Was will die SPD zum Klima?');
  await user.click(screen.getByRole('button', { name: 'Kandidaten suchen' }));
  await screen.findByText(/79 Vorgänge/);
}

describe('BundestagQaPage', () => {
  it('führt plan → answer aus, verlinkt [n] auf den Beleg und ist barrierefrei', async () => {
    server.use(
      http.post(PLAN, () => HttpResponse.json(planBody)),
      http.post(ANSWER, async ({ request }) => {
        const b = (await request.json()) as { refs: string[]; auftrag: string };
        expect(b.refs).toEqual(['21/100']);
        expect(b.auftrag).toBe('frage');
        return HttpResponse.json(answerBody);
      })
    );
    const { user, container } = renderWithProviders(<BundestagQaPage />);
    await askAndPlan(user);
    expect(screen.getByText(/gezeigt 1/)).toBeInTheDocument();
    expect(screen.getByLabelText('Antrag')).toBeChecked();

    await user.click(screen.getByRole('button', { name: 'Frage beantworten' }));
    const jump = await screen.findByRole('button', { name: 'Zu Beleg 1 springen' });
    // [7] hat keinen Beleg und bleibt Text.
    expect(screen.queryByRole('button', { name: 'Zu Beleg 7 springen' })).toBeNull();
    await user.click(jump);
    expect(document.getElementById('beleg-1')).toHaveFocus();
    expect(screen.getByText('Der Bundestag fordert mehr Klimaschutz.')).toBeInTheDocument();
    expect(screen.getByText('1234')).toBeInTheDocument();

    expect(await axe(container)).toHaveNoViolations();
  });

  it.each([
    [403, /nur für Deutschland/],
    [429, /Tageslimit erreicht/],
    [500, /HTTP 500/],
  ])('zeigt bei answer %i eine Meldung', async (status, text) => {
    server.use(
      http.post(PLAN, () => HttpResponse.json(planBody)),
      http.post(ANSWER, () => HttpResponse.json({ error: 'x' }, { status }))
    );
    const { user } = renderWithProviders(<BundestagQaPage />);
    await askAndPlan(user);
    await user.click(screen.getByRole('button', { name: 'Frage beantworten' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(text));
  });

  it('zeigt bei plan 403 eine Meldung', async () => {
    server.use(http.post(PLAN, () => HttpResponse.json({ error: 'x' }, { status: 403 })));
    const { user } = renderWithProviders(<BundestagQaPage />);
    await user.type(screen.getByLabelText('Frage an den Bundestag'), 'Eine Frage');
    await user.click(screen.getByRole('button', { name: 'Kandidaten suchen' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/nur für Deutschland/);
  });
});
