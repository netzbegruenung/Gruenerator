/**
 * Die Agentura — der Shop als Popup über der Übersicht. Im Gang „Öffentlich"
 * steht, was andere geteilt haben; eigene öffentliche Einträge bleiben
 * sichtbar, was nur über eine Gruppenfreigabe erreichbar (und nicht eigen) ist,
 * steht schon auf der Übersicht und fehlt hier. Eine Kachel öffnet ihre Details
 * im Popup, und „Zu meinen Grüneratoren" speichert sie am Konto. Dazu: alte
 * `/agentura`-Links landen richtig.
 *
 * Unter dem Popup liegt die Übersicht — Prüfungen suchen deshalb im Dialog.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AgenturaPage from './AgenturaPage';
import GrueneratorenPage from './GrueneratorenPage';

import { axe, render, screen, userEvent, within } from '@/test-utils';

const list = vi.hoisted(() => vi.fn());
const listPublic = vi.hoisted(() => vi.fn());
const library = vi.hoisted(() => ({ list: vi.fn(), add: vi.fn(), remove: vi.fn() }));

vi.mock('@gruenerator/shared/api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getContractsClient: () => ({
    userTextForms: { list, listPublic, remove: vi.fn() },
    userLibrary: library,
  }),
}));

vi.mock('@gruenerator/shared/agents', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getVisibleSystemAgentsForLocale: () => [],
}));

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

const publicAgents = vi.hoisted(() => ({ current: [] as unknown[] }));

vi.mock('../agents/api', () => ({
  useUserAgents: () => ({ data: [], isSuccess: true }),
  useSharedSystemAgents: () => ({ data: [] }),
  useSharedUserAgents: () => ({ data: [] }),
  usePublicUserAgents: () => ({ data: publicAgents.current }),
  useDeleteUserAgent: () => ({ mutate: vi.fn() }),
  useCreateUserAgent: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('../recurring-tasks/api', () => ({
  useRecurringTasks: () => ({ data: [], isSuccess: true }),
}));
vi.mock('../usage/useItemUsage', () => ({ useItemUsage: () => ({ data: {} }) }));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) =>
    selector({ user: { id: 'u1' }, locale: 'de-DE' }),
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

function renderAt(route: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/agentura" element={<AgenturaPage />} />
          <Route path="/grueneratoren" element={<GrueneratorenPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  list.mockReset().mockResolvedValue({ status: 200, body: { success: true, forms: [] } });
  listPublic.mockReset().mockResolvedValue({ status: 200, body: { success: true, forms: [] } });
  publicAgents.current = [];
  library.list.mockReset().mockResolvedValue({ status: 200, body: { success: true, items: [] } });
  library.add.mockReset().mockResolvedValue({ status: 200, body: { success: true } });
  library.remove.mockReset().mockResolvedValue({ status: 200, body: { success: true } });
});

const dialog = async () => within(await screen.findByRole('dialog', { name: 'Agentura' }));

describe('Agentura', () => {
  it('zeigt ein fremdes öffentliches Rezept mit Herkunft', async () => {
    listPublic.mockResolvedValue({ status: 200, body: { success: true, forms: [publicRow()] } });
    renderAt('/agentura');
    const shop = await dialog();

    expect(await shop.findByRole('heading', { name: 'Fremdes Rezept' })).toBeInTheDocument();
    expect(shop.getByText(/Öffentlich · Sam Beispiel/)).toBeInTheDocument();
  });

  it('zeigt auch einen öffentlichen Agent', async () => {
    publicAgents.current = [
      {
        id: 'p-1',
        identifier: 'fremd',
        title: 'Öffentlicher Agent',
        description: 'Für alle',
        systemRole: '',
        avatar: '',
        backgroundColor: '',
        tags: [],
        model: 'm',
        provider: 'mistral',
        params: { max_tokens: 1, temperature: 0 },
        openingMessage: '',
        openingQuestions: [],
        locale: 'de-DE',
        author: 'Sam',
      },
    ];
    renderAt('/agentura');

    expect(
      await (await dialog()).findByRole('heading', { name: 'Öffentlicher Agent' })
    ).toBeInTheDocument();
  });

  it('zeigt die eigene Rezept-Karte auch hier, wenn sie öffentlich ist', async () => {
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
    renderAt('/agentura');

    expect(
      await (await dialog()).findByRole('heading', { name: 'Eigenes Rezept' })
    ).toBeInTheDocument();
  });

  it('lässt ein nur geteiltes (nicht eigenes) Rezept weg', async () => {
    list.mockResolvedValue({
      status: 200,
      body: {
        success: true,
        forms: [
          ownRow({
            id: 'row-2',
            mention: 'team-rezept',
            title: 'Team Rezept',
            sharedFromGroup: 'OV Mitte',
            ownerName: 'Alex Beispiel',
            isPublic: true,
          }),
        ],
      },
    });
    listPublic.mockResolvedValue({
      status: 200,
      body: {
        success: true,
        forms: [
          publicRow({ mention: 'team-rezept', title: 'Team Rezept' }),
          publicRow({ id: 'pub-2', mention: 'anderes-rezept', title: 'Anderes Rezept' }),
        ],
      },
    });
    renderAt('/agentura');
    const shop = await dialog();

    // A genuinely-community row proves the queries resolved before the
    // absence check below is trusted.
    await shop.findByRole('heading', { name: 'Anderes Rezept' });
    expect(shop.queryByRole('heading', { name: 'Team Rezept' })).not.toBeInTheDocument();
  });

  it('hat keine a11y-Verstöße', async () => {
    listPublic.mockResolvedValue({ status: 200, body: { success: true, forms: [publicRow()] } });
    renderAt('/agentura');
    const shop = await dialog();
    await shop.findByRole('heading', { name: 'Fremdes Rezept' });

    expect(await axe(screen.getByRole('dialog'))).toHaveNoViolations();
  });

  it('öffnet eine Kachel im Popup und holt sie zu meinen Grüneratoren', async () => {
    listPublic.mockResolvedValue({ status: 200, body: { success: true, forms: [publicRow()] } });
    // Nach dem Speichern lädt die Liste neu — der Server hat es dann.
    library.add.mockImplementation(() => {
      library.list.mockResolvedValue({
        status: 200,
        body: {
          success: true,
          items: [{ kind: 'recipe', ref: 'pub-1', createdAt: '2026-10-14' }],
        },
      });
      return Promise.resolve({ status: 200, body: { success: true } });
    });
    const user = userEvent.setup();
    renderAt('/agentura');
    const shop = await dialog();

    await user.click(await shop.findByRole('button', { name: 'Fremdes Rezept' }));
    await user.click(shop.getByRole('button', { name: 'Zu meinen Grüneratoren' }));

    // Nutzer-Rezepte über die Zeilen-id — ihre Mention ist nur pro Besitzer eindeutig.
    expect(library.add).toHaveBeenCalledWith({ params: { kind: 'recipe', ref: 'pub-1' } });
    expect(await shop.findByRole('button', { name: 'In meinen Grüneratoren' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(shop.getByRole('link', { name: /Im Chat ausprobieren/ })).toHaveAttribute(
      'href',
      '/chat?rezept=fremdes-rezept&rezeptId=pub-1'
    );
  });
});

describe('Alte Agentura-Links', () => {
  it('führen das alte Regal „Meine Grüneratoren“ auf die Übersicht', async () => {
    renderAt('/agentura?cat=meine');

    expect(
      await screen.findByRole('heading', { name: 'Grüneratoren', level: 1 })
    ).toBeInTheDocument();
  });

  it('führen das alte Regal „Öffentlich“ in den Gang „Öffentlich“', async () => {
    listPublic.mockResolvedValue({ status: 200, body: { success: true, forms: [publicRow()] } });
    renderAt('/agentura?cat=community');

    const shop = await dialog();
    expect(
      await shop.findByRole('button', { name: 'Filter „Öffentlich“ entfernen' })
    ).toBeInTheDocument();
  });
});

describe('Übersicht → Agentura', () => {
  it('verlinkt die Agentura aus der Werkzeugleiste der Übersicht', async () => {
    renderAt('/grueneratoren');

    const link = await screen.findByRole('link', { name: 'Agentura' });
    expect(link).toHaveAttribute('href', '/agentura');
  });
});
