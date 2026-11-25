import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '../../../test-utils';

import { ProjekteRecentSection } from './ProjekteRecentSection';

import type { GroupSummary } from '@gruenerator/shared/groups';

const usage: Record<string, Record<string, { useCount: number; lastUsedAt: string }>> = {};

vi.mock('../../usage/useItemUsage', () => ({
  useItemUsage: (type: string) => ({ data: usage[type] ?? {} }),
}));

vi.mock('./ProjekteNotebooksSection', () => ({
  useMyNotebooks: () => ({
    own: [{ id: 'nb-1', name: 'Haushalt' }],
    shared: [{ id: 'nb-2', name: 'Nie geöffnet' }],
    loading: false,
    failed: false,
  }),
  NotebookTile: ({
    collection,
    extraMeta,
  }: {
    collection: { name: string };
    extraMeta: string[];
  }) => (
    <a href="#nb">
      {collection.name} {extraMeta.join(' ')}
    </a>
  ),
  SystemNotebookTile: ({ entry, extraMeta }: { entry: { title: string }; extraMeta: string[] }) => (
    <a href="#system">
      {entry.title} {extraMeta.join(' ')}
    </a>
  ),
}));

vi.mock('../../notebook/config/notebooksConfig', () => ({
  SYSTEM_NOTEBOOKS: [
    { id: 'bayern-notebook', title: 'Bayern', path: '/notebooks/bayern' },
    { id: 'hessen-notebook', title: 'Hessen', path: '/notebooks/hessen' },
  ],
}));

const projekt = (id: string, name: string): GroupSummary => ({
  id,
  name,
  role: 'admin',
  isAdmin: true,
  group_type: 'standard',
});

describe('ProjekteRecentSection', () => {
  beforeEach(() => {
    for (const key of Object.keys(usage)) delete usage[key];
  });

  it('mixes used projects and notebooks, latest first, and skips the unused', () => {
    usage.project = {
      a: { useCount: 9, lastUsedAt: '2026-11-20T10:00:00Z' },
      b: { useCount: 1, lastUsedAt: '2026-11-22T10:00:00Z' },
    };
    usage.notebook = { 'nb-1': { useCount: 2, lastUsedAt: '2026-11-21T10:00:00Z' } };
    renderWithProviders(
      <ProjekteRecentSection
        projekte={[projekt('a', 'Alt'), projekt('b', 'Neu'), projekt('c', 'Unbenutzt')]}
      />
    );
    const names = screen.getAllByRole('link').map((l) => l.textContent ?? '');
    expect(names).toHaveLength(3);
    expect(names[0]).toMatch(/Neu/);
    expect(names[1]).toMatch(/Haushalt.*Notebook ·/);
    expect(names[2]).toMatch(/Alt/);
    expect(screen.queryByText(/Unbenutzt|Nie geöffnet/)).not.toBeInTheDocument();
  });

  // Der Chat und die Notebook-Seite verbuchen System-Notebooks per Registry-Id.
  it('includes used system notebooks next to own ones', () => {
    usage.notebook = {
      'bayern-notebook': { useCount: 1, lastUsedAt: '2026-11-23T10:00:00Z' },
      'nb-1': { useCount: 2, lastUsedAt: '2026-11-21T10:00:00Z' },
    };
    renderWithProviders(<ProjekteRecentSection projekte={[]} />);
    const names = screen.getAllByRole('link').map((l) => l.textContent ?? '');
    expect(names).toHaveLength(2);
    expect(names[0]).toMatch(/Bayern.*Notebook ·/);
    expect(names[1]).toMatch(/Haushalt/);
    expect(screen.queryByText(/Hessen/)).not.toBeInTheDocument();
  });

  it('renders nothing without any usage', () => {
    const { container } = renderWithProviders(
      <ProjekteRecentSection projekte={[projekt('a', 'Alt')]} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
