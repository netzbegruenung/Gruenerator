import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { axe } from '@/test-utils';

/**
 * Geprüft wird der Reitersatz, nicht was in den Reitern steht — die haben ihre
 * eigenen Tests, und ihre Abhängigkeiten (Nutzerliste, Vorlagen-Statistik,
 * Rezept-Katalog) tragen zu dieser Frage nichts bei.
 *
 * Der Kern: die Reiter entstehen aus der Instanz-Registry. Eine Instanz, die
 * das Vorlagen-Werkzeug ausblendet, prüft keine Vorlagen; eine ohne
 * Landesverbände hat niemanden zu verwalten. Ginge das verloren, sähe es
 * niemand — der Reiter wäre einfach da und führte ins Leere.
 */

// Ohne angemeldete Person rendert `withAuthRequired` die Loginseite — der Test
// misst dann sie statt der Admin-Seite, samt ihrer eigenen a11y-Befunde.
vi.mock('../../stores/authStore', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) =>
    selector({ user: { id: 'u1', email: 'admin@example.org', is_admin: true } }),
}));

vi.mock('./components/RequireAdmin', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('./tabs/UsersTab', () => ({ default: () => <div>Nutzerliste</div> }));
vi.mock('./tabs/SkillsTab', () => ({ default: () => <div>Rezeptliste</div> }));
vi.mock('./tabs/AgentsTab', () => ({ default: () => <div>Agentenliste</div> }));
vi.mock('./tabs/RolesTab', () => ({ default: () => <div>Rollenliste</div> }));
vi.mock('./tabs/VorlagenTab', () => ({ default: () => <div>Vorlagenliste</div> }));
vi.mock('./landesverband-assignment/LandesverbandAssignmentTab', () => ({
  default: () => <div>LV-Zuteilung</div>,
}));

/**
 * `CURRENT_INSTANCE` entsteht beim Laden des Moduls — der Instanz-Wechsel
 * braucht deshalb `resetModules` und einen frischen Import. Der Provider muss
 * aus demselben Ladevorgang kommen, sonst sieht die Seite einen anderen
 * react-query-Context als den aufgespannten („No QueryClient set").
 */
async function renderAdminOn(instanceId: string) {
  vi.resetModules();
  vi.doMock('@/config/instance', () => ({ CURRENT_INSTANCE: instanceId }));

  const { default: Admin } = await import('./AdminPage');
  const { QueryClient: FreshClient, QueryClientProvider: FreshProvider } =
    await import('@tanstack/react-query');

  const client = new FreshClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <FreshProvider client={client}>
        <Admin />
      </FreshProvider>
    </MemoryRouter>
  );
}

const tabNames = () => screen.getAllByRole('tab').map((t) => t.textContent?.trim() ?? '');

afterEach(() => {
  vi.doUnmock('@/config/instance');
});

describe('AdminPage', () => {
  it('trägt auf einer Vollinstanz alle Reiter', async () => {
    await renderAdminOn('production');

    expect(tabNames()).toEqual([
      'Nutzer:innen',
      'Rezepte',
      'Agenten',
      'Rollen',
      'Vorlagen',
      'Landesverbände',
    ]);
  });

  // bgst blendet das Vorlagen-Werkzeug (`hide.toolIds`) und beide
  // Landesverbands-Kategorien (`hide.notebookCategories`) aus.
  it('lässt weg, was die Instanz nicht führt', async () => {
    await renderAdminOn('bgst');

    expect(tabNames()).toEqual(['Nutzer:innen', 'Rezepte', 'Agenten', 'Rollen']);
    expect(screen.queryByRole('tab', { name: 'Vorlagen' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Landesverbände' })).toBeNull();
  });

  it('öffnet auf den Nutzenden, den einzigen Reiter, den jede Instanz hat', async () => {
    await renderAdminOn('bgst');

    expect(screen.getByText('Nutzerliste')).toBeInTheDocument();
    // Der Vorlagen-Reiter fehlt nicht nur als Knopf, sondern auch als Inhalt —
    // sonst liefe sein Datenabruf trotzdem.
    expect(screen.queryByText('Vorlagenliste')).toBeNull();
  });

  it('hat keine axe-Verstöße', async () => {
    const { container } = await renderAdminOn('bgst');
    expect(await axe(container)).toHaveNoViolations();
  });
});
