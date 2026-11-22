import { type GroupFeedItem } from '@gruenerator/shared/groups';
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { axe, renderWithProviders } from '../../../test-utils';

import { ProjectKnowledgeList } from './ProjectKnowledgeList';
import { type ShareActions } from './shareActions';

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
  projectWrite: null,
  post: null,
  ...over,
});

const actions = (over: Partial<ShareActions> = {}): ShareActions => ({
  canManage: () => true,
  canRemove: () => true,
  onSetWrite: vi.fn(),
  onRemove: vi.fn(),
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
        actions={null}
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
        actions={actions({ onRemove })}
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
      <ProjectKnowledgeList items={[]} onUseTemplate={vi.fn()} actions={null} onDiscuss={null} />
    );
    expect(screen.getByText(/Noch nichts hinterlegt/)).toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();

    const many = Array.from({ length: 7 }, (_, i) => make({ id: `x${i}`, title: `Datei ${i}` }));
    rerender(
      <ProjectKnowledgeList items={many} onUseTemplate={vi.fn()} actions={null} onDiscuss={null} />
    );
    expect(screen.getByRole('searchbox', { name: 'Im Wissen suchen' })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('shows the members’ role on documents and lets the manager change it', async () => {
    const doc = make({
      id: 'c1',
      title: 'Antrag Radweg',
      kind: 'doc',
      contentType: 'collaborative_documents',
      projectWrite: false,
    });
    const onSetWrite = vi.fn();
    const { user } = renderWithProviders(
      <ProjectKnowledgeList
        items={[doc, file]}
        onUseTemplate={vi.fn()}
        actions={actions({ onSetWrite, canRemove: () => false })}
        onDiscuss={null}
      />
    );
    expect(screen.getByText('Doc · Nur lesen')).toBeInTheDocument();
    // A file has no role: only reading exists there.
    expect(screen.getByText('Dokument')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Weitere Aktionen für Antrag Radweg' }));
    expect(await screen.findByRole('menuitemradio', { name: 'Nur lesen' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    await user.click(screen.getByRole('menuitemradio', { name: 'Bearbeiten' }));
    expect(onSetWrite).toHaveBeenCalledWith(doc, true);
  });

  it('labels items outside the search scope and summarizes how many are searchable', () => {
    renderWithProviders(
      <ProjectKnowledgeList
        items={[
          make({ id: 'a', title: 'Fertig', searchState: 'ready' }),
          make({ id: 'b', title: 'Lädt', searchState: 'indexing' }),
          make({ id: 'c', title: 'Kaputt', searchState: 'failed' }),
          make({ id: 'd', title: 'Ohne Zustand' }),
        ]}
        onUseTemplate={vi.fn()}
        actions={null}
        onDiscuss={null}
      />
    );
    expect(screen.getByText('1 von 3 durchsuchbar')).toBeInTheDocument();
    expect(screen.getByText('Wird eingelesen')).toBeInTheDocument();
    expect(screen.getByText('Einlesen fehlgeschlagen')).toBeInTheDocument();
    expect(screen.queryByText('Durchsuchbar')).not.toBeInTheDocument();
  });

  it('shows no summary when no item has a search state', () => {
    renderWithProviders(
      <ProjectKnowledgeList
        items={[make({ id: 'a', title: 'Notiz' })]}
        onUseTemplate={vi.fn()}
        actions={null}
        onDiscuss={null}
      />
    );
    expect(screen.queryByText(/durchsuchbar/)).not.toBeInTheDocument();
  });

  it('offers no role choice to someone who may not manage the item', () => {
    const doc = make({
      id: 'c2',
      title: 'Fremdes Doc',
      kind: 'doc',
      contentType: 'collaborative_documents',
      projectWrite: true,
    });
    renderWithProviders(
      <ProjectKnowledgeList
        items={[doc]}
        onUseTemplate={vi.fn()}
        actions={actions({ canManage: () => false, canRemove: () => false })}
        onDiscuss={null}
      />
    );
    expect(screen.getByText('Doc · Bearbeiten')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Weitere Aktionen/ })).not.toBeInTheDocument();
  });
});
