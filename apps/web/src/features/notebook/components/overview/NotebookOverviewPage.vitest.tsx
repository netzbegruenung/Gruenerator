/**
 * Die Übersicht eines Systemnotebooks: eigene Route neben dem Chat, dieselbe
 * Glas-Pille wie Chat | Arbeiten, und ein Klick auf ein Thema landet gefiltert
 * im Chat. Der Endpunkt kommt aus MSW.
 */
import { type NotebookOverviewResponse } from '@gruenerator/contracts';
import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { http, HttpResponse } from 'msw';
import { Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { server } from '../../../../test/msw-server';
import { axe, renderWithProviders, screen, waitFor, within } from '../../../../test-utils';
import useNotebookStore from '../../stores/notebookStore';

vi.mock('../../../../components/common/LoginRequired/withAuthRequired', () => ({
  default: <P,>(Component: P) => Component,
}));

const { default: NotebookOverviewPage } = await import('./NotebookOverviewPage');

const ENDPOINT = (id: string) => `http://localhost/api/auth/notebook/collections/${id}/overview`;

function overview(patch: Partial<NotebookOverviewResponse> = {}): NotebookOverviewResponse {
  return {
    collectionId: 'mecklenburg-vorpommern-system',
    computedAt: new Date().toISOString(),
    totals: {
      documents: 1548,
      undated: 326,
      last30Days: 26,
      previous30Days: 13,
      firstPublished: '2021-09-28',
      lastPublished: '2026-09-25',
    },
    monthly: [
      { month: '2026-08', count: 16, topTopic: 'klima' },
      { month: '2026-09', count: 23, topTopic: 'digital' },
    ],
    topics: [
      { topic: 'klima', count: 167, share: 0.14, trend: 'flat', baselineShare: 0.2 },
      { topic: 'sicherheit', count: 98, share: 0.08, trend: 'up', baselineShare: 0.07 },
    ],
    persons: [{ person: 'Werner Graf', count: 337, recentCount: 28 }],
    contentTypes: [
      { value: 'presse', label: 'Pressemitteilung', count: 1047 },
      { value: 'beschluss', label: 'Beschluss/Resolution', count: 223 },
    ],
    sources: [],
    recent: [
      {
        id: '1',
        collectionId: 'mecklenburg-vorpommern-system',
        collectionName: 'Grüne MV',
        title: 'Mehr Busse für Vorpommern',
        snippet: null,
        url: 'https://gruene-mv.de/busse',
        publishedAt: new Date().toISOString(),
        sourceLabel: 'Grüne MV Presse',
        contentTypeLabel: 'Pressemitteilung',
        themes: ['mobilitaet'],
      },
    ],
    terms: null,
    ...patch,
  };
}

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});
beforeEach(() => useNotebookStore.setState({ activeFilters: {} }));
afterEach(() => server.resetHandlers());

function Where() {
  return <div data-testid="chat">{useLocation().pathname}</div>;
}

function renderAt(route: string) {
  return renderWithProviders(
    <Routes>
      <Route path="/notebooks/:idOrSlug/uebersicht" element={<NotebookOverviewPage />} />
      <Route path="/notebooks/:idOrSlug" element={<Where />} />
    </Routes>,
    { route }
  );
}

describe('NotebookOverviewPage', () => {
  it('shows the Chat | Übersicht pill with Übersicht active', async () => {
    server.use(
      http.get(ENDPOINT('mecklenburg-vorpommern-system'), () => HttpResponse.json(overview()))
    );
    renderAt('/notebooks/mecklenburg-vorpommern/uebersicht');

    const tabs = within(screen.getByRole('navigation', { name: 'Notebook-Bereiche' }));
    expect(tabs.getByRole('tab', { name: 'Übersicht' })).toHaveAttribute('aria-selected', 'true');
    expect(tabs.getByRole('tab', { name: 'Chat' })).toHaveAttribute(
      'href',
      '/notebooks/mecklenburg-vorpommern'
    );
  });

  it('renders the exact figures and the LV agents MV used to lose', async () => {
    server.use(
      http.get(ENDPOINT('mecklenburg-vorpommern-system'), () => HttpResponse.json(overview()))
    );
    renderAt('/notebooks/mecklenburg-vorpommern/uebersicht');

    expect(await screen.findByRole('heading', { name: 'Aktivität' })).toBeVisible();
    expect(screen.getByText('davon 326 ohne Datum')).toBeVisible();
    expect(screen.getByText('+13 gegenüber den 30 Tagen davor')).toBeVisible();
    expect(screen.getByText('Mehr Busse für Vorpommern')).toBeVisible();
    expect(screen.getByText('Durchschnitt aller Landesverbände')).toBeVisible();
    // `${config.id}-notebook` was `mecklenburgVorpommern-notebook` and matched no agent.
    expect(screen.getByRole('heading', { name: 'Grüneratoren' })).toBeVisible();
  });

  it('opens the chat filtered to a clicked topic', async () => {
    server.use(
      http.get(ENDPOINT('mecklenburg-vorpommern-system'), () => HttpResponse.json(overview()))
    );
    const { user } = renderAt('/notebooks/mecklenburg-vorpommern/uebersicht');

    await user.click(await screen.findByRole('button', { name: /^Sicherheit: 8 %, im Aufwind/ }));

    expect(screen.getByTestId('chat')).toHaveTextContent('/notebooks/mecklenburg-vorpommern');
    expect(useNotebookStore.getState().activeFilters['mecklenburg-vorpommern-system']).toEqual({
      themes: ['sicherheit'],
    });
  });

  it('hides empty sections instead of drawing empty cards', async () => {
    server.use(
      http.get(ENDPOINT('kommunalwiki-system'), () =>
        HttpResponse.json(
          overview({ collectionId: 'kommunalwiki-system', persons: [], recent: [], topics: [] })
        )
      )
    );
    renderAt('/notebooks/kommunalwiki/uebersicht');

    expect(await screen.findByRole('heading', { name: 'Aktivität' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Köpfe' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Themenprofil' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Grüneratoren' })).not.toBeInTheDocument();
  });

  it('offers a retry when the overview fails', async () => {
    server.use(
      http.get(ENDPOINT('mecklenburg-vorpommern-system'), () =>
        HttpResponse.json({ error: 'overview_failed' }, { status: 500 })
      )
    );
    renderAt('/notebooks/mecklenburg-vorpommern/uebersicht');

    expect(await screen.findByText('Die Übersicht konnte nicht geladen werden.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Erneut versuchen' })).toBeVisible();
  });

  it('sends unknown notebooks back to their chat route', () => {
    renderAt('/notebooks/meine-notizen-a1b2c3/uebersicht');
    expect(screen.getByTestId('chat')).toHaveTextContent('/notebooks/meine-notizen-a1b2c3');
  });

  it('has no axe violations', async () => {
    server.use(
      http.get(ENDPOINT('mecklenburg-vorpommern-system'), () => HttpResponse.json(overview()))
    );
    const { container } = renderAt('/notebooks/mecklenburg-vorpommern/uebersicht');
    await screen.findByRole('heading', { name: 'Aktivität' });
    await waitFor(async () => expect(await axe(container)).toHaveNoViolations());
  });
});
