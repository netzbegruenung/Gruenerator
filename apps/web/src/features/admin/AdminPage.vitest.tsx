import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { axe } from '@/test-utils';

/**
 * Geprüft wird die Navigation, nicht was in den Unterseiten steht — die haben
 * ihre eigenen Tests, und ihre Abhängigkeiten tragen zu dieser Frage nichts bei.
 *
 * Der Kern: die Unterseiten entstehen aus der Instanz-Registry. Eine Instanz,
 * die das Vorlagen-Werkzeug ausblendet, prüft keine Vorlagen; eine ohne
 * Landesverbände hat niemanden zu verwalten. Ginge das verloren, sähe es
 * niemand — der Eintrag wäre einfach da und führte ins Leere.
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

vi.mock('./components/AdminNavBadges', () => ({
  ReportsNavBadge: () => null,
  VorlagenNavBadge: () => null,
}));
vi.mock('./AdminOverview', () => ({ default: () => <div>Überblicksinhalt</div> }));
vi.mock('./tabs/UsersTab', () => ({ default: () => <div>Nutzerliste</div> }));
vi.mock('./tabs/VorlagenTab', () => ({ default: () => <div>Vorlagenliste</div> }));

/**
 * `CURRENT_INSTANCE` entsteht beim Laden des Moduls — der Instanz-Wechsel
 * braucht deshalb `resetModules` und einen frischen Import. Der Provider muss
 * aus demselben Ladevorgang kommen, sonst sieht die Seite einen anderen
 * react-query-Context als den aufgespannten („No QueryClient set").
 */
async function renderAdminOn(instanceId: string, path = '/admin') {
  vi.resetModules();
  vi.doMock('@/config/instance', () => ({ CURRENT_INSTANCE: instanceId }));

  const { default: Admin } = await import('./AdminPage');
  const { QueryClient: FreshClient, QueryClientProvider: FreshProvider } =
    await import('@tanstack/react-query');

  const client = new FreshClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={[path]}>
      <FreshProvider client={client}>
        <Routes>
          <Route path="/admin" element={<Admin />} />
          <Route path="/admin/:section" element={<Admin />} />
        </Routes>
      </FreshProvider>
    </MemoryRouter>
  );
}

const navEntries = () =>
  within(screen.getByRole('navigation', { name: 'Administration' }))
    .getAllByRole('link')
    .map((link) => link.textContent?.trim() ?? '');

afterEach(() => {
  vi.doUnmock('@/config/instance');
});

describe('AdminPage', () => {
  it('führt auf einer Vollinstanz alle Unterseiten', async () => {
    await renderAdminOn('production');

    expect(navEntries()).toEqual([
      'Überblick',
      'Meldungen',
      'Vorlagen',
      'Nutzer:innen',
      'Rollen',
      'Landesverbände',
      'Rezepte',
      'Agents',
      'Glossar',
      'Parteitage',
      'Statistik',
      'App-Updates',
      'Content-Sync',
      'Chunk-Inspektor',
      'Konnektor-Test',
      'Grüne-API-Test',
    ]);
  });

  // bgst blendet das Vorlagen-Werkzeug (`hide.toolIds`) und beide
  // Landesverbands-Kategorien (`hide.notebookCategories`) aus.
  it('lässt weg, was die Instanz nicht führt', async () => {
    await renderAdminOn('bgst');

    const entries = navEntries();
    expect(entries).not.toContain('Vorlagen');
    expect(entries).not.toContain('Landesverbände');
    expect(entries).not.toContain('Content-Sync');
  });

  it('öffnet auf dem Überblick', async () => {
    await renderAdminOn('bgst');
    expect(screen.getByText('Überblicksinhalt')).toBeInTheDocument();
  });

  it('zeigt eine Unterseite unter ihrem Pfad', async () => {
    await renderAdminOn('bgst', '/admin/nutzer');
    expect(await screen.findByText('Nutzerliste')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Nutzer:innen' })).toBeInTheDocument();
  });

  // Eine ausgeblendete Unterseite darf auch über ihre URL nicht laden — sonst
  // liefe ihr Datenabruf trotzdem.
  it('leitet eine Unterseite, die die Instanz nicht führt, auf den Überblick', async () => {
    await renderAdminOn('bgst', '/admin/vorlagen');
    expect(await screen.findByText('Überblicksinhalt')).toBeInTheDocument();
    expect(screen.queryByText('Vorlagenliste')).toBeNull();
  });

  // Schmal klappt die Navigation hinter einen Knopf mit dem aktuellen Bereich;
  // ein gewählter Eintrag klappt sie wieder zu.
  it('klappt die schmale Navigation auf und nach der Wahl wieder zu', async () => {
    await renderAdminOn('bgst');
    const toggle = screen.getByRole('button', { name: /Überblick/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(screen.getByRole('link', { name: 'Nutzer:innen' }));
    expect(await screen.findByText('Nutzerliste')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Nutzer:innen/ })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
  });

  it('hat keine axe-Verstöße', async () => {
    const { container } = await renderAdminOn('bgst');
    expect(await axe(container)).toHaveNoViolations();
  });
});
