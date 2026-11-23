import { describe, expect, it, vi } from 'vitest';

import { ProjekteSidebarSection } from './ProjekteSidebarSection';

import { renderWithProviders, screen } from '@/test-utils';

const groups = Array.from({ length: 10 }, (_, i) => ({
  id: `g${i}`,
  name: `Projekt ${i}`,
  role: 'admin',
  isAdmin: true,
  // g9 ist das zuletzt aktive, g0 das älteste.
  last_activity_at: `2026-11-${String(10 + i).padStart(2, '0')}T10:00:00Z`,
}));

vi.mock('../../../features/groups/hooks/useGroups', () => ({
  useGroups: () => ({
    userGroups: [
      ...groups,
      { id: 'a1', name: 'Altes Archiv', role: 'admin', isAdmin: true, archived_at: '2026-01-01' },
    ],
    isLoadingGroups: false,
    isErrorGroups: false,
  }),
}));

describe('ProjekteSidebarSection', () => {
  it('shows only the eight most recently active projects and links to all', async () => {
    const { user } = renderWithProviders(
      <ProjekteSidebarSection
        openRef={{ current: false }}
        titleClass=""
        collapsed={false}
        onNavigate={() => {}}
        onClose={() => {}}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Projekte' }));

    expect(await screen.findByText('Projekt 9')).toBeInTheDocument();
    expect(screen.getByText('Projekt 2')).toBeInTheDocument();
    expect(screen.queryByText('Projekt 1')).not.toBeInTheDocument();
    expect(screen.queryByText('Projekt 0')).not.toBeInTheDocument();
    // Das Archiv steht auf /projekte, nicht im Popup.
    expect(screen.queryByText('Altes Archiv')).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Alle 10 Projekte/ })).toBeInTheDocument();
  });
});
