/**
 * Das Landesverbands-Regal nennt seinen Verband beim Namen.
 *
 * Eigene Datei, weil `AgenturaPage.vitest.tsx` den Agenten-Katalog auf leer
 * setzt, um von Rezepten zu handeln — ohne LV-Agenten aus der echten Registry
 * käme das Regal dort nie über `countFor() > 0` und der Reiter nie in den DOM.
 * Hier bleibt `getVisibleSystemAgentsForLocale` deshalb echt.
 *
 * Geprüft wird beides, was den Reiter ausmacht: dass er den Namen trägt, und
 * dass er vor der Hydratation der Profilrollen gar nicht erst erscheint. Der
 * zweite Teil ist der eigentliche Befund — `lvIds === null` lässt jeden
 * LV-Filter durch, das Regal stünde also mit dem Rückfallnamen da UND zeigte
 * die Inhalte fremder Verbände, bevor es auf „Grüne Hessen" umspringt.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import AgenturaPage from './AgenturaPage';

import { render, screen } from '@/test-utils';

const lv = vi.hoisted(() => ({
  lvIds: ['hessen'] as readonly string[] | null,
  shelfLabel: 'Grüne Hessen',
  isHydrated: true,
}));

vi.mock('@gruenerator/shared/api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getContractsClient: () => ({
    userTextForms: {
      list: vi.fn().mockResolvedValue({ status: 200, body: { success: true, forms: [] } }),
      listPublic: vi.fn().mockResolvedValue({ status: 200, body: { success: true, forms: [] } }),
      remove: vi.fn(),
    },
  }),
}));

vi.mock('@gruenerator/chat', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useHiddenAgentIdentifiers: () => [],
  useHiddenSkillMentions: () => [],
  useUserLandesverbaende: () => ({ ...lv, headings: { agents: '', skills: '' } }),
}));

vi.mock('../agents/api', () => ({
  useUserAgents: () => ({ data: [] }),
  useSharedSystemAgents: () => ({ data: [] }),
  useSharedUserAgents: () => ({ data: [] }),
  usePublicUserAgents: () => ({ data: [] }),
  useDeleteUserAgent: () => ({ mutate: vi.fn() }),
  useCreateUserAgent: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('../recurring-tasks/api', () => ({ useRecurringTasks: () => ({ data: [] }) }));
vi.mock('../usage/useItemUsage', () => ({ useItemUsage: () => ({ data: {} }) }));
vi.mock('@/hooks/useFirstName', () => ({ useFirstName: () => null }));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) =>
    selector({ user: { id: 'u1' }, locale: 'de-DE' }),
}));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/agentura?cat=meine']}>
        <AgenturaPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Agentura — Landesverbands-Regal', () => {
  it('beschriftet den Reiter mit dem Verband statt mit „Dein Landesverband"', async () => {
    lv.lvIds = ['hessen'];
    lv.shelfLabel = 'Grüne Hessen';
    lv.isHydrated = true;

    renderPage();

    expect(await screen.findByRole('tab', { name: /Grüne Hessen/ })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Dein Landesverband/ })).not.toBeInTheDocument();
  });

  it('zeigt das Regal erst, wenn die Profilrollen geladen sind', async () => {
    lv.lvIds = null;
    lv.shelfLabel = 'Dein Landesverband';
    lv.isHydrated = false;

    renderPage();

    // „Meine Grüneratoren" steht immer — daran hängt, dass die Reiter überhaupt
    // gerendert sind und das Fehlen des LV-Reiters etwas bedeutet.
    expect(await screen.findByRole('tab', { name: /Meine Grüneratoren/ })).toBeInTheDocument();
    expect(
      screen.queryByRole('tab', { name: /Landesverband|Grüne Hessen/ })
    ).not.toBeInTheDocument();
  });
});
