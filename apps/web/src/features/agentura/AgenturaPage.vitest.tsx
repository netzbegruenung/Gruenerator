/**
 * The Agentura market now learns user recipes: "Meine Rezepte" between the
 * recurring-tasks and shared-groups sections, shared recipes in
 * "Geteilt mit Gruppen", public ones in "Von der Basis" (minus one's own),
 * favourites and cross-source search, and a "Neu" menu replacing the single
 * "Neuer Grünerator" button. Agents and the system skill catalogue are mocked
 * to empty/no-op so these tests stay about the recipe wiring, not the whole
 * page's every other shelf.
 */
import { useSkillFavoritesStore } from '@gruenerator/chat';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AgenturaPage from './AgenturaPage';

import { axe, render, screen, userEvent, within } from '@/test-utils';

const list = vi.hoisted(() => vi.fn());
const listPublic = vi.hoisted(() => vi.fn());
const remove = vi.hoisted(() => vi.fn());

vi.mock('@gruenerator/shared/api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getContractsClient: () => ({ userTextForms: { list, listPublic, remove } }),
}));

// The system agent catalogue is real but irrelevant here; emptying it keeps
// the DOM (and axe) focused on the recipe shelves under test.
vi.mock('@gruenerator/shared/agents', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getVisibleSystemAgentsForLocale: () => [],
}));

// `agentsList` (the skill catalogue) empty for the same reason. `useSkillFavoritesStore`
// stays real — the favourites test toggles it directly.
vi.mock('@gruenerator/chat', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  agentsList: [],
  useHiddenAgentIdentifiers: () => [],
  useHiddenSkillMentions: () => [],
  useUserLandesverbaende: () => ({ lvIds: null, headings: { agents: '', skills: '' } }),
}));

vi.mock('../agents/api', () => ({
  useUserAgents: () => ({ data: [] }),
  useSharedSystemAgents: () => ({ data: [] }),
  useSharedUserAgents: () => ({ data: [] }),
  usePublicUserAgents: () => ({ data: [] }),
  useDeleteUserAgent: () => ({ mutate: vi.fn() }),
}));

vi.mock('../recurring-tasks/api', () => ({
  useRecurringTasks: () => ({ data: [] }),
}));

vi.mock('../usage/useItemUsage', () => ({
  useItemUsage: () => ({ data: {} }),
}));

vi.mock('@/hooks/useFirstName', () => ({
  useFirstName: () => null,
}));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) =>
    selector({ user: { id: 'u1' }, locale: 'de-DE' }),
}));

const navigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useNavigate: () => navigate,
}));

function ownRow(over: Record<string, unknown> = {}) {
  return {
    id: 'row-1',
    kind: 'custom',
    textType: null,
    mention: 'eigenes-rezept',
    title: 'Eigenes Rezept',
    examples: [{ content: 'Beispieltext' }],
    styleBlock: 'Schreibe kurz und klar.',
    model: null,
    analyzedAt: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
    sharedWithGroups: [],
    sharedFromGroup: null,
    ownerName: null,
    description: 'Mein eigener Stil',
    iconKey: 'PiTree',
    shareMode: 'private',
    isPublic: false,
    publicOwnership: null,
    ...over,
  };
}

function sharedRow(over: Record<string, unknown> = {}) {
  return ownRow({
    id: 'row-2',
    mention: 'geteiltes-rezept',
    title: 'Geteiltes Rezept',
    sharedFromGroup: 'OV Mitte',
    ownerName: 'Alex Beispiel',
    ...over,
  });
}

function publicRow(over: Record<string, unknown> = {}) {
  const { examples: _examples, sharedWithGroups: _groups, ...rest } = ownRow();
  return {
    ...rest,
    id: 'pub-1',
    mention: 'fremdes-rezept',
    title: 'Fremdes Rezept',
    ownerName: 'Sam Beispiel',
    exampleCount: 2,
    isPublic: true,
    ...over,
  };
}

function renderPage(route = '/agentura?cat=meine') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        <AgenturaPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  navigate.mockReset();
  list.mockReset().mockResolvedValue({ status: 200, body: { success: true, forms: [] } });
  listPublic.mockReset().mockResolvedValue({ status: 200, body: { success: true, forms: [] } });
  remove.mockReset().mockResolvedValue({ status: 200, body: { success: true } });
  useSkillFavoritesStore.setState({ favorites: [] });
});

describe('AgenturaPage — Meine Rezepte', () => {
  it('zeigt eigene Rezepte zwischen den wiederkehrenden Aufgaben und den Gruppen', async () => {
    // A shared row too, so "Geteilt mit Gruppen" actually renders (it drops
    // out entirely when empty — see the section's own comment) and the
    // ordering can be checked against a real heading.
    list.mockResolvedValue({
      status: 200,
      body: { success: true, forms: [ownRow(), sharedRow()] },
    });
    const { container } = renderPage();

    expect(await screen.findByRole('heading', { name: 'Eigenes Rezept' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Neues Rezept/ })).toHaveAttribute(
      'href',
      '/agentura/rezept/neu'
    );

    const text = container.textContent ?? '';
    const recurringIdx = text.indexOf('Wiederkehrende Aufgaben');
    const rezepteIdx = text.indexOf('Meine Rezepte');
    const gruppenIdx = text.indexOf('Geteilt mit Gruppen');
    expect(recurringIdx).toBeGreaterThan(-1);
    expect(rezepteIdx).toBeGreaterThan(recurringIdx);
    expect(gruppenIdx).toBeGreaterThan(rezepteIdx);
  });

  it('bietet für ein eigenes Rezept Bearbeiten und Löschen an', async () => {
    list.mockResolvedValue({ status: 200, body: { success: true, forms: [ownRow()] } });
    renderPage();

    const card = (await screen.findByRole('heading', { name: 'Eigenes Rezept' })).closest(
      '[class*="rounded-lg"]'
    ) as HTMLElement;
    expect(within(card).getByRole('button', { name: 'Bearbeiten' })).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Löschen' })).toBeInTheDocument();
  });

  it('führt eine geteilte Gruppen-Rezept-Karte unter „Geteilt mit Gruppen"', async () => {
    list.mockResolvedValue({ status: 200, body: { success: true, forms: [sharedRow()] } });
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Geteiltes Rezept' })).toBeInTheDocument();
    expect(screen.getByText(/Geteilt aus OV Mitte von Alex Beispiel/)).toBeInTheDocument();
    // Shared rows are not editable — no owner actions.
    expect(screen.queryByRole('button', { name: 'Löschen' })).not.toBeInTheDocument();
  });

  it('zeigt einen Leerzustand mit Verweis auf „Neu", wenn gar nichts vorhanden ist', async () => {
    renderPage();

    expect(
      await screen.findByText(/Du hast noch keine eigenen Grüneratoren oder Rezepte erstellt/)
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Grünerator erstellen/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Rezept erstellen/ })).toBeInTheDocument();
  });
});

describe('AgenturaPage — Von der Basis', () => {
  it('zeigt ein fremdes öffentliches Rezept mit Herkunft', async () => {
    listPublic.mockResolvedValue({ status: 200, body: { success: true, forms: [publicRow()] } });
    renderPage('/agentura?cat=community');

    expect(await screen.findByRole('heading', { name: 'Fremdes Rezept' })).toBeInTheDocument();
    expect(screen.getByText(/Von der Basis · Sam Beispiel/)).toBeInTheDocument();
  });

  it('zeigt die eigene Rezept-Karte auch unter „Von der Basis", wenn sie öffentlich ist', async () => {
    // Mirrors `communityAgents`: "owners still see their own listing" — a
    // public own recipe shows both under "Meine Rezepte" and here.
    list.mockResolvedValue({
      status: 200,
      body: { success: true, forms: [ownRow({ isPublic: true })] },
    });
    listPublic.mockResolvedValue({
      status: 200,
      body: {
        success: true,
        forms: [publicRow({ mention: 'eigenes-rezept', title: 'Eigenes Rezept' })],
      },
    });
    renderPage('/agentura?cat=community');

    expect(await screen.findByRole('heading', { name: 'Eigenes Rezept' })).toBeInTheDocument();
  });

  it('zeigt ein geteiltes und öffentliches Rezept genau einmal, unter „Geteilt mit Gruppen"', async () => {
    // Mirrors `communityAgents`: a recipe reachable via a group share (not
    // owned) is dropped from "Von der Basis" even though it's also public —
    // "Geteilt mit Gruppen" already shows it once.
    list.mockResolvedValue({
      status: 200,
      body: {
        success: true,
        forms: [sharedRow({ mention: 'team-rezept', title: 'Team Rezept', isPublic: true })],
      },
    });
    listPublic.mockResolvedValue({
      status: 200,
      body: {
        success: true,
        forms: [publicRow({ mention: 'team-rezept', title: 'Team Rezept' })],
      },
    });

    renderPage('/agentura?cat=meine');
    expect(await screen.findAllByRole('heading', { name: 'Team Rezept' })).toHaveLength(1);
  });

  it('lässt ein nur geteiltes (nicht eigenes) Rezept aus „Von der Basis" weg', async () => {
    list.mockResolvedValue({
      status: 200,
      body: {
        success: true,
        forms: [sharedRow({ mention: 'team-rezept', title: 'Team Rezept', isPublic: true })],
      },
    });
    listPublic.mockResolvedValue({
      status: 200,
      body: {
        success: true,
        forms: [
          publicRow({ mention: 'team-rezept', title: 'Team Rezept' }),
          publicRow({ mention: 'anderes-rezept', title: 'Anderes Rezept' }),
        ],
      },
    });

    renderPage('/agentura?cat=community');
    // A genuinely-community row proves the queries resolved before the
    // absence check below is trusted.
    await screen.findByRole('heading', { name: 'Anderes Rezept' });
    expect(screen.queryByRole('heading', { name: 'Team Rezept' })).not.toBeInTheDocument();
  });
});

describe('AgenturaPage — Favoriten', () => {
  it('zeigt ein favorisiertes eigenes Rezept', async () => {
    list.mockResolvedValue({ status: 200, body: { success: true, forms: [ownRow()] } });
    useSkillFavoritesStore.setState({ favorites: ['eigenes-rezept'] });
    renderPage('/agentura?cat=favoriten');

    expect(await screen.findByRole('heading', { name: 'Eigenes Rezept' })).toBeInTheDocument();
  });
});

describe('AgenturaPage — Suche', () => {
  it('findet Rezepte über Titel, Mention und Beschreibung, eigene zuerst bei Kollision', async () => {
    list.mockResolvedValue({
      status: 200,
      body: {
        success: true,
        forms: [ownRow({ mention: 'doppel-mention', title: 'Eigene Version' })],
      },
    });
    listPublic.mockResolvedValue({
      status: 200,
      body: {
        success: true,
        forms: [publicRow({ mention: 'doppel-mention', title: 'Fremde Version' })],
      },
    });
    renderPage('/agentura?q=doppel-mention');

    expect(await screen.findByRole('heading', { name: 'Eigene Version' })).toBeInTheDocument();
    expect(screen.queryByText('Fremde Version')).not.toBeInTheDocument();
  });
});

describe('AgenturaPage — „Neu"-Menü', () => {
  it('bietet drei Einträge und ist per Tastatur bedienbar', async () => {
    renderPage();

    const trigger = await screen.findByRole('button', { name: 'Neu' });
    trigger.focus();
    await userEvent.keyboard('{Enter}');

    const items = await screen.findAllByRole('menuitem');
    expect(items.map((el) => el.textContent)).toEqual([
      'Grünerator',
      'Rezept',
      'Wiederkehrende Aufgabe',
    ]);

    // Opening via keyboard already focuses the first item (Radix's roving
    // tabindex) — one more ArrowDown moves to "Rezept", the second entry.
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(navigate).toHaveBeenCalledWith('/agentura/rezept/neu');
  });

  it('navigiert bei Klick auf „Rezept" zum Rezept-Ersteller', async () => {
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Neu' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Rezept' }));

    expect(navigate).toHaveBeenCalledWith('/agentura/rezept/neu');
  });
});

describe('AgenturaPage — a11y', () => {
  it('hat keine a11y-Verstöße', async () => {
    list.mockResolvedValue({
      status: 200,
      body: { success: true, forms: [ownRow(), sharedRow()] },
    });
    const { container } = renderPage();
    await screen.findByRole('heading', { name: 'Eigenes Rezept' });

    expect(await axe(container)).toHaveNoViolations();
  });
});
