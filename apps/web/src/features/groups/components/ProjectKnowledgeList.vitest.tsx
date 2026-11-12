import { type GroupFeedItem } from '@gruenerator/shared/groups';
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { axe, renderWithProviders } from '../../../test-utils';

import { ProjectKnowledgeList } from './ProjectKnowledgeList';

const make = (over: Partial<GroupFeedItem> & { id: string; title: string }): GroupFeedItem => ({
  key: `documents:${over.id}`,
  contentType: 'documents',
  kind: 'document',
  excerpt: null,
  thumbnailUrl: null,
  slug: null,
  sharedByName: null,
  sharedById: null,
  sharedAt: null,
  share: {
    shareId: `s-${over.id}`,
    note: null,
    pinnedAt: null,
    pinnedByName: null,
    commentCount: 0,
    reactions: [],
  },
  post: null,
  ...over,
});

const file = make({ id: 'd1', title: 'Foerderbescheid.pdf' });
const notebook = make({
  id: 'n1',
  title: 'Klimaschutz',
  kind: 'notebook',
  contentType: 'notebook_collections',
});

describe('ProjectKnowledgeList', () => {
  it('lists one compact row per item with type and a link to the target', () => {
    renderWithProviders(
      <ProjectKnowledgeList
        items={[file, notebook]}
        onUseTemplate={vi.fn()}
        onRemove={null}
        onDiscuss={null}
      />
    );
    expect(screen.getByRole('link', { name: /Foerderbescheid\.pdf/ })).toHaveAttribute(
      'href',
      '/documents/d1'
    );
    expect(screen.getByRole('link', { name: /Klimaschutz/ })).toHaveAttribute(
      'href',
      '/notebook/n1'
    );
    expect(screen.getByText('Dokument')).toBeInTheDocument();
    expect(screen.getByText('Notebook')).toBeInTheDocument();
    // No permissions, no Austausch: no row menus.
    expect(screen.queryByRole('button', { name: /Weitere Aktionen/ })).not.toBeInTheDocument();
  });

  it('offers remove and discuss through an accessible row menu', async () => {
    const onRemove = vi.fn();
    const onDiscuss = vi.fn();
    const { user } = renderWithProviders(
      <ProjectKnowledgeList
        items={[file]}
        onUseTemplate={vi.fn()}
        onRemove={onRemove}
        onDiscuss={onDiscuss}
      />
    );
    await user.click(
      screen.getByRole('button', { name: 'Weitere Aktionen für Foerderbescheid.pdf' })
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Im Austausch besprechen' }));
    expect(onDiscuss).toHaveBeenCalledWith(file);

    await user.click(
      screen.getByRole('button', { name: 'Weitere Aktionen für Foerderbescheid.pdf' })
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Aus dem Projekt entfernen' }));
    expect(onRemove).toHaveBeenCalledWith(file);
  });

  it('shows a short hint when empty, a search field only for long lists, and is axe-clean', async () => {
    const { container, rerender } = renderWithProviders(
      <ProjectKnowledgeList items={[]} onUseTemplate={vi.fn()} onRemove={null} onDiscuss={null} />
    );
    expect(screen.getByText(/Noch nichts hinterlegt/)).toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();

    const many = Array.from({ length: 7 }, (_, i) => make({ id: `x${i}`, title: `Datei ${i}` }));
    rerender(
      <ProjectKnowledgeList items={many} onUseTemplate={vi.fn()} onRemove={null} onDiscuss={null} />
    );
    expect(screen.getByRole('searchbox', { name: 'Im Wissen suchen' })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});
