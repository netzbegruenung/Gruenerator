import { useUserProfileStore } from '@gruenerator/chat/stores';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import TexteAnlernenTab from './TexteAnlernenTab';

/**
 * Der Abschnitt „Rezepte aus <Landesverband>" hängt an drei Bedingungen, die
 * in drei verschiedenen Paketen stehen: eine Landesgeschäftsstellen-Rolle im
 * Profil-Store, ein Landesverband mit auffindbaren Agenten, und Rezepte, deren
 * Kennung auf ein Preset fällt. Fällt eine davon aus, verschwindet der ganze
 * Abschnitt kommentarlos — sichtbar wird das erst hier, wo alle drei
 * zusammenkommen.
 */

vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) => selector({ user: { id: 'u1' } }),
}));

vi.mock('./texteAnlernen/useTextForms', () => ({
  textFormsQuery: { queryKey: ['text-forms'], queryFn: () => Promise.resolve([]) },
  useTextForms: () => ({
    query: { isLoading: false, data: [] },
    analyze: {},
    save: {},
    remove: {},
    share: {},
    unshare: {},
  }),
}));

const LGS_BAYERN = {
  ebene: 'land',
  rolle: 'Mitarbeiter*in Landesgeschäftsstelle',
  bundesland: 'Bayern',
};

function renderTab() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <TexteAnlernenTab />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  useUserProfileStore.getState().reset();
});

describe('TexteAnlernenTab — Landesverbands-Rezepte', () => {
  it('zeigt die Rezepte des eigenen Landesverbands', () => {
    useUserProfileStore.getState().hydrate({
      roles: [LGS_BAYERN],
      locale: 'de-DE',
      isHydrated: true,
    });

    renderTab();

    expect(screen.getByText('Rezepte aus Bayern')).toBeInTheDocument();
    // Beide Ebenen einzeln: `/@presse-bayern/` traf seit der Aufteilung zwei
    // Einträge und ließ die Abfrage werfen, statt eine davon zu prüfen.
    expect(screen.getByText(/@presse-bayern-partei/)).toBeInTheDocument();
    expect(screen.getByText(/@presse-bayern-fraktion/)).toBeInTheDocument();
    expect(screen.getByText(/@insta-bayern/)).toBeInTheDocument();
  });

  it('zeigt ohne Landesgeschäftsstellen-Rolle keinen LV-Abschnitt', () => {
    useUserProfileStore.getState().hydrate({
      roles: [{ ebene: 'kreisverband', rolle: 'Ratsmitglied', bundesland: 'Bayern' }],
      locale: 'de-DE',
      isHydrated: true,
    });

    renderTab();

    expect(screen.queryByText(/^Rezepte aus /)).not.toBeInTheDocument();
  });
});

/**
 * Drei der vier Presets ersetzen den Rumpf eines mitgelieferten Rezepts,
 * `antrag` hat keines. Die Zeile behauptete das trotzdem — und der angelernte
 * Stil wurde auf keinem Pfad nachgeschlagen (#2937).
 */
describe('TexteAnlernenTab — was ein Preset verspricht', () => {
  beforeEach(() => {
    useUserProfileStore.getState().hydrate({ roles: [], locale: 'de-DE', isHydrated: true });
  });

  it('nennt Presets mit mitgeliefertem Rezept eine Überschreibung', () => {
    renderTab();
    expect(screen.getByText('Ersetzt das mitgelieferte Rezept @presse')).toBeInTheDocument();
    expect(screen.getByText('Ersetzt das mitgelieferte Rezept @instagram')).toBeInTheDocument();
  });

  it('nennt „Anträge" ein eigenständiges Rezept', () => {
    renderTab();
    expect(screen.queryByText('Ersetzt das mitgelieferte Rezept @antrag')).not.toBeInTheDocument();
    expect(screen.getByText(/Eigenständiges Rezept .* @antrag/)).toBeInTheDocument();
  });
});
