/**
 * Der Markt kennt eigene Rezepte: unter „Meine Grüneratoren", geteilte und
 * öffentliche jeweils dort, wo sie herkommen, dazu Favoriten und die Suche über
 * alle Quellen. Seit dem Redesign ist ein Regal EIN flaches Raster — die
 * Zugehörigkeit steht in der Meta-Zeile der Karte, nicht mehr in einer
 * Abschnittsüberschrift, und die Kartenaktionen liegen im Kebab-Menü.
 *
 * Agenten und der mitgelieferte Rezeptkatalog sind auf leer gesetzt, damit
 * diese Prüfungen von der Rezept-Verdrahtung handeln und nicht vom Rest der
 * Seite.
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
  useUserLandesverbaende: () => ({
    lvIds: null,
    headings: { agents: '', skills: '' },
    shelfLabel: 'Dein Landesverband',
    isHydrated: true,
  }),
}));

vi.mock('../agents/api', () => ({
  useUserAgents: () => ({ data: [] }),
  useSharedSystemAgents: () => ({ data: [] }),
  useSharedUserAgents: () => ({ data: [] }),
  usePublicUserAgents: () => ({ data: [] }),
  useDeleteUserAgent: () => ({ mutate: vi.fn() }),
  // Duplizieren legt einen neuen Agenten an — die Kachel zieht den Haken über
  // `useDuplicateAgent`, auch wenn keine dieser Prüfungen ihn auslöst.
  useCreateUserAgent: () => ({ mutateAsync: vi.fn(), isPending: false }),
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
  it('zeigt eigenes und geteiltes Rezept im Abschnitt „Rezepte", eigenes zuerst', async () => {
    list.mockResolvedValue({
      status: 200,
      body: { success: true, forms: [ownRow(), sharedRow()] },
    });
    const { container } = renderPage();

    const section = await screen.findByRole('region', { name: 'Rezepte' });
    expect(
      within(section).getByRole('heading', { level: 3, name: 'Eigenes Rezept' })
    ).toBeInTheDocument();
    expect(within(section).getByRole('heading', { name: 'Geteiltes Rezept' })).toBeInTheDocument();

    // Abschnitte gibt es nur nach Gattung und nur mit Inhalt — kein leerer
    // „Agents"-Kopf, keine Herkunfts-Fächer wie früher.
    expect(screen.queryByRole('region', { name: 'Agents' })).not.toBeInTheDocument();
    const text = container.textContent ?? '';
    expect(text).not.toContain('Wiederkehrende Aufgaben');
    expect(text).not.toContain('Geteilt mit Gruppen');
    expect(text.indexOf('Eigenes Rezept')).toBeLessThan(text.indexOf('Geteiltes Rezept'));
  });

  it('bietet für ein eigenes Rezept Bearbeiten und Löschen im Kartenmenü an', async () => {
    list.mockResolvedValue({ status: 200, body: { success: true, forms: [ownRow()] } });
    renderPage();

    const card = (await screen.findByRole('heading', { name: 'Eigenes Rezept' })).closest(
      '[class*="rounded-lg"]'
    ) as HTMLElement;
    await userEvent.click(within(card).getByRole('button', { name: 'Aktionen' }));

    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: /Bearbeiten/ })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: /Löschen/ })).toBeInTheDocument();
  });

  it('führt eine geteilte Gruppen-Rezept-Karte unter „Geteilt mit Gruppen"', async () => {
    list.mockResolvedValue({ status: 200, body: { success: true, forms: [sharedRow()] } });
    renderPage();

    const card = (await screen.findByRole('heading', { name: 'Geteiltes Rezept' })).closest(
      '[class*="rounded-lg"]'
    ) as HTMLElement;
    // Die Herkunft steht jetzt in der Meta-Zeile der Karte.
    expect(within(card).getByText(/Geteilt aus OV Mitte von Alex Beispiel/)).toBeInTheDocument();

    // Shared rows are not editable — no owner actions.
    await userEvent.click(within(card).getByRole('button', { name: 'Aktionen' }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).queryByRole('menuitem', { name: /Bearbeiten/ })).not.toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: /Löschen/ })).not.toBeInTheDocument();
  });

  it('zeigt einen Leerzustand mit Verweis auf „Neu", wenn gar nichts vorhanden ist', async () => {
    renderPage();

    expect(
      await screen.findByText(/Du hast noch keine eigenen Agents oder Rezepte erstellt/)
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Agent erstellen/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Rezept erstellen/ })).toBeInTheDocument();
  });
});

describe('AgenturaPage — Öffentlich', () => {
  it('zeigt ein fremdes öffentliches Rezept mit Herkunft', async () => {
    listPublic.mockResolvedValue({ status: 200, body: { success: true, forms: [publicRow()] } });
    renderPage('/agentura?cat=community');

    expect(await screen.findByRole('heading', { name: 'Fremdes Rezept' })).toBeInTheDocument();
    expect(screen.getByText(/Öffentlich · Sam Beispiel/)).toBeInTheDocument();
  });

  it('zeigt die eigene Rezept-Karte auch unter „Öffentlich", wenn sie öffentlich ist', async () => {
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
    // owned) is dropped from „Öffentlich" even though it's also public —
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

  it('lässt ein nur geteiltes (nicht eigenes) Rezept aus „Öffentlich" weg', async () => {
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
  // Favoriten ist kein Regal mehr, sondern der fünfte Typ-Filter — er verengt
  // das aktive Regal, statt ein eigenes zu sein.
  it('zeigt unter dem Favoriten-Filter nur das favorisierte Rezept', async () => {
    list.mockResolvedValue({
      status: 200,
      body: {
        success: true,
        forms: [ownRow(), ownRow({ id: 'row-3', mention: 'zweites', title: 'Zweites Rezept' })],
      },
    });
    useSkillFavoritesStore.setState({ favorites: ['eigenes-rezept'] });
    renderPage('/agentura?cat=meine&type=fav');

    expect(await screen.findByRole('heading', { name: 'Eigenes Rezept' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Zweites Rezept' })).not.toBeInTheDocument();
  });

  it('ein veralteter Link auf das Favoriten-Regal landet im Startregal', async () => {
    list.mockResolvedValue({ status: 200, body: { success: true, forms: [ownRow()] } });
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
      'Agent',
      'Rezept',
      'Wiederkehrende Aufgabe',
      // „Verlauf & Steuerung" hing vorher an der Abschnittsüberschrift der
      // wiederkehrenden Aufgaben, die es im flachen Raster nicht mehr gibt.
      'Verlauf & Steuerung',
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
