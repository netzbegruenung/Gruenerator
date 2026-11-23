import { describe, expect, it, vi } from 'vitest';

import { NotebooksSidebarSection } from './NotebooksSidebarSection';

import { renderWithProviders, screen } from '@/test-utils';

const own = Array.from({ length: 10 }, (_, i) => ({
  id: `n${i}`,
  name: `Notebook ${i}`,
  slug_suffix: null,
  access_source: 'owned',
}));
const shared = [{ id: 's1', name: 'Geteilt', slug_suffix: null, access_source: 'shared' }];

vi.mock('../../../features/auth/hooks/useProfileData', () => ({
  useNotebookCollections: () => ({ query: { data: own, isLoading: false, isError: false } }),
}));
vi.mock('../../../features/notebook/hooks/useSharedNotebookCollections', () => ({
  useSharedNotebookCollections: () => ({ data: shared }),
}));
vi.mock('../../../features/usage/useItemUsage', () => ({
  useItemUsage: () => ({ data: { s1: { useCount: 4, lastUsedAt: '2026-11-01T00:00:00Z' } } }),
}));

describe('NotebooksSidebarSection', () => {
  it('lists the most-used notebooks first, limited to eight, and links to all', async () => {
    const onNavigate = vi.fn();
    const { user } = renderWithProviders(
      <NotebooksSidebarSection
        openRef={{ current: false }}
        titleClass=""
        collapsed={false}
        onNavigate={onNavigate}
        onClose={() => {}}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Notebooks' }));

    // Das genutzte, geteilte Notebook steht trotz Namensordnung vorn.
    expect(await screen.findByText('Geteilt')).toBeInTheDocument();
    expect(screen.getByText('Notebook 6')).toBeInTheDocument();
    expect(screen.queryByText('Notebook 7')).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Alle 11 Notebooks/ })).toBeInTheDocument();

    await user.click(screen.getByText('Geteilt'));
    expect(onNavigate).toHaveBeenCalledWith('/notebooks/s1', 'Geteilt');
  });
});
