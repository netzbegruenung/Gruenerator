/**
 * The detail page now serves four kinds of recipe behind one URL, so the tests
 * are about which view a mention gets and which actions come with it: the
 * system page must look exactly as it did for everyone who may not override
 * anything, an own row must carry the owner actions, and a public one must
 * carry none of them.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import RecipeDetailPage from './RecipeDetailPage';

import { axe, render, screen, userEvent, waitFor, within } from '@/test-utils';

const list = vi.hoisted(() => vi.fn());
const listPublic = vi.hoisted(() => vi.fn());
const remove = vi.hoisted(() => vi.fn());
const getPrompt = vi.hoisted(() => vi.fn());
const getShareSettings = vi.hoisted(() => vi.fn());
const listMyGroups = vi.hoisted(() => vi.fn());
const lv = vi.hoisted(() => ({ lvIds: null as readonly string[] | null }));

vi.mock('@gruenerator/shared/api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getContractsClient: () => ({
    userTextForms: { list, listPublic, remove, getShareSettings },
    skillPrompt: { getPrompt },
    notebookSharing: { listMyGroups },
  }),
}));

vi.mock('@gruenerator/chat', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  // Both hit the network in the real hooks and neither is what these tests are
  // about; the Landesverband roles are steered per test through `lv`.
  useHiddenSkillMentions: () => [],
  useUserLandesverbaende: () => ({ lvIds: lv.lvIds, headings: [], isHydrated: true }),
}));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) =>
    selector({ isAuthenticated: true, locale: 'de-DE' }),
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
    mention: 'mein-rezept',
    title: 'Mein Rezept',
    examples: [{ content: 'Beispieltext' }, { content: 'Noch einer' }],
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
    ownerName: 'Alex Beispiel',
    exampleCount: 3,
    isPublic: true,
    ...over,
  };
}

function renderPage(mention: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/agentura/rezept/${mention}`]}>
        <Routes>
          <Route path="/agentura/rezept/:mention" element={<RecipeDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  navigate.mockReset();
  lv.lvIds = null;
  list.mockReset().mockResolvedValue({ status: 200, body: { success: true, forms: [] } });
  listPublic.mockReset().mockResolvedValue({ status: 200, body: { success: true, forms: [] } });
  remove.mockReset().mockResolvedValue({ status: 200, body: { success: true } });
  getPrompt.mockReset().mockResolvedValue({ status: 200, body: { prompt: null } });
  getShareSettings.mockReset().mockResolvedValue({
    status: 200,
    body: { share_mode: 'private', is_public: false, public_ownership: null },
  });
  listMyGroups.mockReset().mockResolvedValue({ status: 200, body: [] });
});

describe('RecipeDetailPage — Systemrezept', () => {
  it('bietet bei einem Preset das Anpassen mit eigenen Beispielen an', async () => {
    renderPage('presse');

    const button = await screen.findByRole('button', { name: 'Mit eigenen Beispielen anpassen' });
    await userEvent.click(button);
    expect(navigate).toHaveBeenCalledWith('/agentura/rezept/presse/bearbeiten');
  });

  it('sagt es, wenn schon ein eigener Stil dafür gespeichert ist', async () => {
    list.mockResolvedValue({
      status: 200,
      body: { success: true, forms: [ownRow({ mention: 'presse', kind: 'preset' })] },
    });
    renderPage('presse');

    expect(await screen.findByText('Du hast diesen Stil angepasst')).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: 'Angepassten Stil bearbeiten' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Mit eigenen Beispielen anpassen' })
    ).not.toBeInTheDocument();
  });

  it('zeigt einem nicht zugeteilten Landesverbands-Rezept keinen Anpassen-Knopf', async () => {
    lv.lvIds = [];
    renderPage('presse-hessen-partei');

    expect(await screen.findByRole('button', { name: 'Im Chat verwenden' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Mit eigenen Beispielen anpassen' })
    ).not.toBeInTheDocument();
  });

  it('hat keine a11y-Verstöße', async () => {
    const { container } = renderPage('presse');
    await screen.findByRole('button', { name: 'Im Chat verwenden' });

    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('RecipeDetailPage — eigenes Rezept', () => {
  beforeEach(() => {
    list.mockResolvedValue({ status: 200, body: { success: true, forms: [ownRow()] } });
  });

  it('zeigt die Eigentümer-Aktionen und führt mit Rezept-ID in den Chat', async () => {
    renderPage('mein-rezept');

    await screen.findByText('Mein Rezept');
    expect(screen.getByRole('button', { name: 'Bearbeiten' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Teilen' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Löschen' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Im Chat verwenden' }));
    expect(navigate).toHaveBeenCalledWith('/chat?rezept=mein-rezept&rezeptId=row-1');
  });

  it('zählt die hinterlegten Beispiele', async () => {
    renderPage('mein-rezept');

    await userEvent.click(await screen.findByRole('tab', { name: 'Beispiele' }));
    expect(screen.getByText('2 Beispiele hinterlegt')).toBeInTheDocument();
  });

  it('löscht erst nach Bestätigung und kehrt zu den eigenen Rezepten zurück', async () => {
    renderPage('mein-rezept');

    await userEvent.click(await screen.findByRole('button', { name: 'Löschen' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Rezept löschen?')).toBeInTheDocument();
    expect(remove).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Löschen' }));

    await waitFor(() =>
      expect(remove).toHaveBeenCalledWith({ params: { mention: 'mein-rezept' } })
    );
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/agentura?cat=meine'));
  });

  it('hat keine a11y-Verstöße', async () => {
    const { container } = renderPage('mein-rezept');
    await screen.findByText('Mein Rezept');

    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('RecipeDetailPage — fremdes Rezept', () => {
  it('zeigt Herkunft und Beispielzahl, aber keine Eigentümer-Aktionen', async () => {
    listPublic.mockResolvedValue({ status: 200, body: { success: true, forms: [publicRow()] } });
    renderPage('fremdes-rezept');

    await screen.findByText('Fremdes Rezept');
    expect(screen.getByText(/Von der Basis · Alex Beispiel/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Link kopieren' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bearbeiten' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Teilen' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Löschen' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'Beispiele' }));
    expect(screen.getByText('3 Beispiele hinterlegt')).toBeInTheDocument();
  });

  it('nennt das Projekt, aus dem ein Rezept geteilt wurde', async () => {
    list.mockResolvedValue({
      status: 200,
      body: {
        success: true,
        forms: [ownRow({ sharedFromGroup: 'OV Mitte', ownerName: 'Alex Beispiel' })],
      },
    });
    renderPage('mein-rezept');

    expect(await screen.findByText(/Geteilt aus OV Mitte von Alex Beispiel/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Löschen' })).not.toBeInTheDocument();
  });

  it('meldet einen Ladefehler statt „nicht gefunden“', async () => {
    list.mockResolvedValue({ status: 500, body: { success: false, message: 'Serverfehler' } });
    renderPage('irgendwas');

    expect(await screen.findByText(/konnte nicht geladen werden/i)).toBeInTheDocument();
    expect(screen.queryByText('Rezept nicht gefunden')).not.toBeInTheDocument();
  });
});
