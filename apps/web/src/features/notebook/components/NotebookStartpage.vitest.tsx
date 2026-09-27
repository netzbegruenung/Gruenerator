/**
 * The notebook start page after the KI / Manuelle-Recherche tabs were merged:
 * one composer, and the manual research running under it while the person
 * types — in „Magic Search“ and „Manuell“, never in the pure model modes.
 *
 * The composer is assistant-ui's and is covered in packages/chat; here it is a
 * stand-in that exposes what the page hands it. The search underneath is real
 * and talks to MSW.
 */
import {
  type CategoryFilterConfig,
  type MagicIntent,
  type NotebookComposerMode,
} from '@gruenerator/chat';
import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { server } from '../../../test/msw-server';
import { act, axe, renderWithProviders, screen, waitFor, within } from '../../../test-utils';
import { daysAgo } from '../manual-search/datePresets';

import { NotebookStartpage } from './NotebookStartpage';

const SEARCH = 'http://localhost/api/research/search';
const FILTERS = 'http://localhost/api/research/filters';
const COLLECTIONS = 'http://localhost/api/research/collections';

const composer: {
  text: string;
  magicIntent?: MagicIntent | null;
  onManualSubmit?: (text: string) => void;
} = { text: '' };

vi.mock('@assistant-ui/react', () => ({
  useAuiState: (select: (s: { composer: { text: string } }) => unknown) =>
    select({ composer: { text: composer.text } }),
}));

vi.mock('@gruenerator/chat', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  NotebookComposer: (props: {
    magicIntent?: MagicIntent | null;
    onManualSubmit?: (text: string) => void;
  }) => {
    composer.magicIntent = props.magicIntent;
    composer.onManualSubmit = props.onManualSubmit;
    return <div data-testid="composer" />;
  },
}));

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

let searches: string[];
let bodies: Array<Record<string, unknown>>;
beforeEach(() => {
  searches = [];
  bodies = [];
  localStorage.clear();
  composer.text = '';
  composer.magicIntent = undefined;
  composer.onManualSubmit = undefined;
  server.use(
    http.get(FILTERS, () =>
      HttpResponse.json({
        filters: {
          published_at: { label: 'Datum', type: 'date_range' },
          persons: {
            label: 'Personen',
            type: 'keyword',
            values: [
              { value: 'Werner Graf', count: 1702 },
              { value: 'Nina Stahr', count: 1531 },
            ],
          },
        },
      })
    ),
    http.get(COLLECTIONS, () => HttpResponse.json([])),
    http.post(SEARCH, async ({ request }) => {
      const body = (await request.json()) as { query: string } & Record<string, unknown>;
      searches.push(body.query);
      bodies.push(body);
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
            content_type_label: 'Beschluss',
            source_name: 'Bündnis 90/Die Grünen Berlin',
            published_at: '2024-05-12',
          },
        ],
        metadata: { totalResults: 1, collections: ['berlin-system'], timeMs: 9 },
      });
    })
  );
});
afterEach(() => server.resetHandlers());

function page(answerMode: NotebookComposerMode, composerCategoryFilters?: CategoryFilterConfig) {
  return (
    <NotebookStartpage
      title="Was möchtest du über die Grünen Berlin wissen?"
      placeholder="Stell deine Frage…"
      mode="deep"
      onModeChange={vi.fn()}
      answerMode={answerMode}
      onAnswerModeChange={vi.fn()}
      recentCollectionIds={['berlin-system']}
      showStats={false}
      showLastAdded={false}
      {...(composerCategoryFilters ? { composerCategoryFilters } : {})}
    />
  );
}

function renderPage(
  answerMode: NotebookComposerMode,
  text: string,
  composerCategoryFilters?: CategoryFilterConfig
) {
  composer.text = text;
  return renderWithProviders(page(answerMode, composerCategoryFilters));
}

describe('NotebookStartpage — one composer', () => {
  it('has no KI / Manuelle Recherche tabs any more', () => {
    renderPage('auto', '');
    expect(screen.queryByRole('button', { name: 'KI' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Manuelle Recherche' })).not.toBeInTheDocument();
    expect(screen.getByTestId('composer')).toBeInTheDocument();
  });

  it('lists hits under the composer while typing in Magic Search', async () => {
    renderPage('auto', 'Mieten');
    expect(await screen.findByText('Mietendeckel jetzt')).toBeVisible();
    expect(screen.getByText('1 Ergebnisse')).toBeVisible();
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

  it('reads keywords as a search: magnifier, and Enter searches at once', async () => {
    const { rerender } = renderPage('auto', '');
    composer.text = 'Hitzeschutz';
    rerender(page('auto'));
    expect(composer.magicIntent).toBe('suche');

    // Enter searches at once — well inside the 300 ms the typing debounce waits.
    act(() => composer.onManualSubmit!('Hitzeschutz'));
    await waitFor(() => expect(searches).toEqual(['Hitzeschutz']), { timeout: 200 });
  });

  it('reads a question as a chat', () => {
    renderPage('auto', 'Was fordern die Grünen zum Hitzeschutz?');
    expect(composer.magicIntent).toBe('chat');
  });

  it('has no intent for an empty composer or outside Magic Search', () => {
    const { unmount } = renderPage('auto', '');
    expect(composer.magicIntent).toBeNull();
    unmount();
    renderPage('manuell', 'Was fordern die Grünen?');
    expect(composer.magicIntent).toBeNull();
  });

  it.each([
    ['Hitzeschutz', 'Keine Treffer. Versuche andere Begriffe oder entferne Filter.'],
    ['Was gilt beim Hitzeschutz?', 'Keine Treffer in den Quellen. Mit Enter fragst du die KI.'],
  ])('fits the empty hint to what %s reads as', async (text, hint) => {
    server.use(
      http.post(SEARCH, () =>
        HttpResponse.json({
          results: [],
          metadata: { totalResults: 0, collections: ['berlin-system'], timeMs: 3 },
        })
      )
    );
    renderPage('auto', text);
    expect(await screen.findByText(hint)).toBeVisible();
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

  it('labels a hit with its kind, origin and date', async () => {
    renderPage('auto', 'Mieten');
    const card = (await screen.findByText('Mietendeckel jetzt')).closest('article')!;
    expect(within(card).getByText('Beschluss')).toBeVisible();
    expect(within(card).getByText('Bündnis 90/Die Grünen Berlin')).toBeVisible();
    expect(within(card).getByText('12.05.2024')).toBeVisible();
    expect(within(card).getByRole('link', { name: 'Mietendeckel jetzt' })).toHaveAttribute(
      'href',
      'https://gruene.berlin/mieten'
    );
  });

  it('switches to the list and remembers it', async () => {
    const user = userEvent.setup();
    const { container } = renderPage('auto', 'Mieten');
    await screen.findByText('Mietendeckel jetzt');
    await user.click(screen.getByRole('radio', { name: 'Liste' }));
    expect(screen.getByRole('radio', { name: 'Liste' })).toBeChecked();
    expect(localStorage.getItem('gr-notebook-research-view')).toBe('list');
    await waitFor(async () => expect(await axe(container)).toHaveNoViolations());
  });

  it('re-searches with a chosen order and person, and resets both', async () => {
    const user = userEvent.setup();
    renderPage('auto', 'Mieten');
    await screen.findByText('Mietendeckel jetzt');

    await user.click(screen.getByRole('button', { name: 'Sortierung: Relevanz' }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'Neueste' }));
    await waitFor(() => expect(bodies.at(-1)?.sortBy).toBe('date_desc'));

    await user.click(await screen.findByRole('button', { name: 'Personen: Alle Personen' }));
    await user.click(await screen.findByRole('option', { name: /Nina Stahr/ }));
    await waitFor(() => expect(bodies.at(-1)?.filters).toEqual({ persons: ['Nina Stahr'] }));
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: 'Zurücksetzen' }));
    await waitFor(() =>
      expect(bodies.at(-1)).toMatchObject({ sortBy: 'relevance', filters: null })
    );
    expect(screen.queryByRole('button', { name: 'Zurücksetzen' })).not.toBeInTheDocument();
  });

  it('shows a time span typed in the text as the toolbar value, and lets it go', async () => {
    const user = userEvent.setup();
    renderPage('auto', 'Hitzeschutz, Dokumente seit 30 Tagen');
    await screen.findByText('Mietendeckel jetzt');

    await waitFor(() =>
      expect(bodies.at(-1)).toMatchObject({
        query: 'Hitzeschutz',
        filters: { date_from: daysAgo(new Date(), 30) },
      })
    );
    const span = screen.getByRole('button', { name: 'Zeitraum: Letzte 30 Tage' });
    expect(span).toHaveAttribute('title', 'Aus der Eingabe erkannt');

    await user.click(span);
    await user.click(await screen.findByRole('menuitemradio', { name: 'Jederzeit' }));
    await waitFor(() =>
      expect(bodies.at(-1)).toMatchObject({ query: 'Hitzeschutz', filters: null })
    );
    expect(screen.getByRole('button', { name: 'Zeitraum: Jederzeit' })).not.toHaveAttribute(
      'title'
    );
  });

  it('selects a person named in the text in the persons facet', async () => {
    renderPage('auto', 'Nina Stahr Mieten');
    expect(await screen.findByRole('button', { name: 'Personen: Nina Stahr' })).toHaveAttribute(
      'title',
      'Aus der Eingabe erkannt'
    );
    await waitFor(() => expect(bodies.at(-1)?.filters).toEqual({ persons: ['Nina Stahr'] }));
  });

  it('resets recognised values for this query too', async () => {
    const user = userEvent.setup();
    renderPage('auto', 'Nina Stahr Mieten');
    await screen.findByRole('button', { name: 'Personen: Nina Stahr' });

    await user.click(screen.getByRole('button', { name: 'Zurücksetzen' }));
    await waitFor(() => expect(bodies.at(-1)).toMatchObject({ filters: null }));
    expect(screen.getByRole('button', { name: 'Personen: Alle Personen' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Zurücksetzen' })).not.toBeInTheDocument();
  });

  it('brings a recognised time span back once the text changes after an override', async () => {
    const user = userEvent.setup();
    const { rerender } = renderPage('auto', 'Hitzeschutz seit 30 Tagen');
    await user.click(await screen.findByRole('button', { name: 'Zeitraum: Letzte 30 Tage' }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'Jederzeit' }));
    await waitFor(() => expect(bodies.at(-1)).toMatchObject({ filters: null }));

    composer.text = 'Hitzeschutz Kitas seit 30 Tagen';
    rerender(page('auto'));
    expect(await screen.findByRole('button', { name: 'Zeitraum: Letzte 30 Tage' })).toHaveAttribute(
      'title',
      'Aus der Eingabe erkannt'
    );
    await waitFor(() =>
      expect(bodies.at(-1)).toMatchObject({
        query: 'Hitzeschutz Kitas',
        filters: { date_from: daysAgo(new Date(), 30) },
      })
    );
  });

  it('shows a recognised span that is no preset under its own label', async () => {
    renderPage('auto', 'Mieten seit 2023');
    expect(await screen.findByRole('button', { name: 'Zeitraum: seit 2023' })).toHaveAttribute(
      'title',
      'Aus der Eingabe erkannt'
    );
    await waitFor(() =>
      expect(bodies.at(-1)).toMatchObject({ query: 'Mieten', filters: { date_from: '2023-01-01' } })
    );
  });

  it('takes the order from the text and resets it to relevance', async () => {
    const user = userEvent.setup();
    renderPage('auto', 'neueste Mieten');
    expect(await screen.findByRole('button', { name: 'Sortierung: Neueste' })).toHaveAttribute(
      'title',
      'Aus der Eingabe erkannt'
    );
    await waitFor(() => expect(bodies.at(-1)?.sortBy).toBe('date_desc'));

    await user.click(screen.getByRole('button', { name: 'Zurücksetzen' }));
    expect(await screen.findByRole('button', { name: 'Sortierung: Relevanz' })).toBeVisible();
    await waitFor(() => expect(bodies.at(-1)?.sortBy).toBe('relevance'));
  });

  it('shows a recognised person here even when the settings menu carries persons', async () => {
    const user = userEvent.setup();
    renderPage('auto', 'Nina Stahr Mieten', {
      fields: [
        {
          field: 'persons',
          label: 'Personen',
          values: [{ value: 'Werner Graf' }, { value: 'Nina Stahr' }],
        },
      ],
      activeFilters: {},
      onToggle: vi.fn(),
    });
    await user.click(await screen.findByRole('button', { name: 'Personen: Nina Stahr' }));
    await waitFor(() => expect(bodies.at(-1)?.filters).toEqual({ persons: ['Nina Stahr'] }));

    await user.click(await screen.findByRole('option', { name: /Nina Stahr/ }));
    await waitFor(() => expect(bodies.at(-1)?.filters).toBeNull());
    expect(screen.getByRole('button', { name: 'Personen: Alle Personen' })).toBeVisible();
  });

  it('moves the composer up with the first answer, not the first keystroke', async () => {
    renderPage('auto', 'Mieten');
    const hero = screen.getByRole('heading', { level: 1 }).parentElement!;
    expect(hero).not.toHaveClass('pt-10');
    await screen.findByText('Mietendeckel jetzt');
    expect(hero).toHaveClass('pt-10');
  });
});
