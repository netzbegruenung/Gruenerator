/**
 * The notebook start page after the KI / Manuelle-Recherche tabs were merged:
 * one composer, and the manual research running under it while the person
 * types — in „Automatisch“ and „Manuell“, never in the pure model modes.
 *
 * The composer is assistant-ui's and is covered in packages/chat; here it is a
 * stand-in that exposes what the page hands it. The search underneath is real
 * and talks to MSW.
 */
import { type NotebookComposerMode } from '@gruenerator/chat';
import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { server } from '../../../test/msw-server';
import { axe, renderWithProviders, screen, waitFor } from '../../../test-utils';

import { NotebookStartpage } from './NotebookStartpage';

const SEARCH = 'http://localhost/api/research/search';
const FILTERS = 'http://localhost/api/research/filters';
const COLLECTIONS = 'http://localhost/api/research/collections';

const composer: { text: string; onManualSubmit?: (text: string) => void } = { text: '' };

vi.mock('@assistant-ui/react', () => ({
  useAuiState: (select: (s: { composer: { text: string } }) => unknown) =>
    select({ composer: { text: composer.text } }),
}));

vi.mock('@gruenerator/chat', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  NotebookComposer: (props: { onManualSubmit?: (text: string) => void }) => {
    composer.onManualSubmit = props.onManualSubmit;
    return <div data-testid="composer" />;
  },
}));

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

let searches: string[];
beforeEach(() => {
  searches = [];
  composer.text = '';
  composer.onManualSubmit = undefined;
  server.use(
    http.get(FILTERS, () => HttpResponse.json({ filters: {} })),
    http.get(COLLECTIONS, () => HttpResponse.json([])),
    http.post(SEARCH, async ({ request }) => {
      const { query } = (await request.json()) as { query: string };
      searches.push(query);
      return HttpResponse.json({
        results: [
          {
            document_id: 'd1',
            title: 'Mietendeckel jetzt',
            source_url: 'https://gruene.berlin/mieten',
            relevant_content: 'Wir fordern …',
            similarity_score: 0.8,
            chunk_count: 2,
            top_chunks: [],
          },
        ],
        metadata: { totalResults: 1, collections: ['berlin-system'], timeMs: 9 },
      });
    })
  );
});
afterEach(() => server.resetHandlers());

function renderPage(answerMode: NotebookComposerMode, text: string) {
  composer.text = text;
  return renderWithProviders(
    <NotebookStartpage
      title="Was möchtest du über die Grünen Berlin wissen?"
      placeholder="Stell deine Frage…"
      mode="deep"
      onModeChange={vi.fn()}
      answerMode={answerMode}
      onAnswerModeChange={vi.fn()}
      recentCollectionIds={['berlin-system']}
    />
  );
}

describe('NotebookStartpage — one composer', () => {
  it('has no KI / Manuelle Recherche tabs any more', () => {
    renderPage('auto', '');
    expect(screen.queryByRole('button', { name: 'KI' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Manuelle Recherche' })).not.toBeInTheDocument();
    expect(screen.getByTestId('composer')).toBeInTheDocument();
  });

  it('lists hits under the composer while typing in Automatisch', async () => {
    renderPage('auto', 'Mieten');
    expect(await screen.findByText('Mietendeckel jetzt')).toBeVisible();
    expect(screen.getByText(/1 Ergebnisse in 9 ms/)).toBeVisible();
    expect(searches).toEqual(['Mieten']);
  });

  it('lists hits in Manuell and offers the composer a search handler', async () => {
    renderPage('manuell', 'Mieten');
    expect(await screen.findByText('Mietendeckel jetzt')).toBeVisible();
    expect(composer.onManualSubmit).toBeTypeOf('function');
  });

  it.each(['chat', 'praezision'] as const)('does not search in %s', async (mode) => {
    renderPage(mode, 'Mieten');
    await new Promise((r) => setTimeout(r, 400));
    expect(searches).toEqual([]);
    expect(screen.queryByText('Mietendeckel jetzt')).not.toBeInTheDocument();
  });

  it('waits until the query is long enough', async () => {
    renderPage('auto', 'Mi');
    await new Promise((r) => setTimeout(r, 400));
    expect(searches).toEqual([]);
  });

  it('has no axe violations with hits on screen', async () => {
    const { container } = renderPage('auto', 'Mieten');
    await screen.findByText('Mietendeckel jetzt');
    await waitFor(async () => expect(await axe(container)).toHaveNoViolations());
  });
});
