/**
 * The notebook's own filters (Bereich, Land, Thema, Quellen) sit in the hit
 * list's toolbar: each is a control there, toggles through the notebook store's
 * callbacks, and „Zurücksetzen“ clears them with the list's own options.
 */
import { describe, expect, it, vi } from 'vitest';

import { axe, renderWithProviders, screen, userEvent } from '../../../test-utils';

import { ResearchResultsToolbar, type ResearchOptions } from './ResearchResultsToolbar';

function options(over: Partial<ResearchOptions> = {}): ResearchOptions {
  return {
    filterFields: {},
    activeFilters: {},
    searchMode: 'hybrid',
    setSearchMode: vi.fn(),
    sortBy: 'relevance',
    setSortBy: vi.fn(),
    toggleFilter: vi.fn(),
    setDateFilter: vi.fn(),
    clearAllFilters: vi.fn(),
    ...over,
  };
}

const shared = (active: Record<string, string[]> = {}) => ({
  fields: [
    {
      field: 'primary_category',
      label: 'Bereich',
      values: [
        { value: 'fachtexte', count: 475 },
        { value: 'presse', count: 444 },
      ],
      valueLabels: { fachtexte: 'Fachtexte', presse: 'Presse' },
    },
  ],
  activeFilters: active,
  onToggle: vi.fn(),
  onClearAll: vi.fn(),
});

function renderToolbar(filters: ResearchOptions) {
  return renderWithProviders(
    <ResearchResultsToolbar filters={filters} facetFields={[]} view="grid" onViewChange={vi.fn()} />
  );
}

describe('ResearchResultsToolbar — notebook filters', () => {
  it('offers each shared facet and toggles through the store', async () => {
    const config = shared();
    const { container } = renderToolbar(options({ shared: config }));

    await userEvent.click(screen.getByRole('button', { name: 'Bereich: Alle' }));
    await userEvent.click(await screen.findByRole('option', { name: /Presse/ }));

    expect(config.onToggle).toHaveBeenCalledWith('primary_category', 'presse');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('shows the selection and resets it with the list options', async () => {
    const config = shared({ primary_category: ['fachtexte'] });
    const sources = {
      collections: [
        { id: 'a', name: 'Fraktion', documentCount: 10 },
        { id: 'b', name: 'Partei', documentCount: 5 },
      ],
      selectedIds: ['a'],
      onToggle: vi.fn(),
      onSelectAll: vi.fn(),
    };
    renderToolbar(options({ shared: config, sources }));

    expect(screen.getByRole('button', { name: 'Bereich: Fachtexte' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quellen: Fraktion' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Zurücksetzen' }));
    expect(config.onClearAll).toHaveBeenCalled();
    expect(sources.onSelectAll).toHaveBeenCalled();
  });
});
