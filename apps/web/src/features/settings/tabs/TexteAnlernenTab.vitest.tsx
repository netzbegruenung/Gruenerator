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
    expect(screen.getByText(/@presse-bayern/)).toBeInTheDocument();
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
