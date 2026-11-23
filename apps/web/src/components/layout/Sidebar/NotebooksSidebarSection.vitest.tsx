import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { axe, renderWithProviders } from '../../../test-utils';

import { NotebooksSidebarSection } from './NotebooksSidebarSection';

const mocks = vi.hoisted(() => ({ shelves: [] as unknown[], shelfCalls: 0 }));

vi.mock('../../../features/notebook/wissen/useNotebookShelves', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useNotebookShelves: () => {
    mocks.shelfCalls += 1;
    return { shelves: mocks.shelves, vectorStoreDown: false };
  },
}));

const nb = (id: string, title: string) => ({ id, title, meta: '', path: `/notebooks/${id}` });
const systemEntry = (id: string, title: string) => ({
  kind: 'system',
  key: id,
  notebook: nb(id, title),
});
const laender = {
  id: 'laender',
  kind: 'group',
  title: 'Landesverbände',
  meta: '1 Landesverband',
  entries: [systemEntry('berlin', 'Berlin')],
  layout: 'photos',
};

function renderSection() {
  const onNavigate = vi.fn();
  renderWithProviders(<NotebooksSidebarSection onNavigate={onNavigate} />);
  return { onNavigate };
}

const unfold = () => userEvent.setup().click(screen.getByRole('button', { name: 'Notebooks' }));

beforeEach(() => {
  localStorage.clear();
  mocks.shelves = [];
  mocks.shelfCalls = 0;
});

describe('NotebooksSidebarSection', () => {
  // The shelf queries poll and, for guests, fail with 401: they must not run while folded.
  it('starts folded and loads the shelves only once unfolded', async () => {
    renderSection();
    expect(screen.getByRole('button', { name: 'Notebooks' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    expect(mocks.shelfCalls).toBe(0);
    await unfold();
    expect(mocks.shelfCalls).toBeGreaterThan(0);
  });

  it('remembers the fold across mounts', async () => {
    renderSection();
    await unfold();
    document.body.innerHTML = '';
    renderSection();
    expect(screen.getByRole('link', { name: 'Neues Notebook' })).toBeInTheDocument();
  });

  it('always offers "Neues Notebook" and "Alle Notebooks" as links', async () => {
    renderSection();
    await unfold();
    expect(screen.getByRole('link', { name: 'Neues Notebook' })).toHaveAttribute(
      'href',
      '/notebooks/neu'
    );
    expect(screen.getByRole('link', { name: 'Alle Notebooks' })).toHaveAttribute('href', '/wissen');
  });

  it('lists own notebooks flat, without a "Meine Notebooks" row', async () => {
    mocks.shelves = [
      {
        id: 'meine',
        kind: 'group',
        title: 'Meine Notebooks',
        meta: '1 Notebook',
        entries: [
          {
            kind: 'own',
            key: 'own-1',
            collection: { id: 'c1', name: 'Klima', slug_suffix: 'abc123' },
          },
        ],
        layout: 'cards',
      },
    ];
    renderSection();
    await unfold();
    expect(screen.queryByRole('button', { name: /Meine Notebooks/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Klima' })).toHaveAttribute(
      'href',
      '/notebooks/klima-abc123'
    );
  });

  it('drops the empty "Meine Notebooks" shelf', async () => {
    mocks.shelves = [
      { id: 'meine', kind: 'create', title: 'Meine Notebooks', meta: 'Erstes Notebook anlegen' },
    ];
    renderSection();
    await unfold();
    expect(screen.getAllByRole('link')).toHaveLength(2);
  });

  it('shows a quiet loading row while own notebooks load', async () => {
    mocks.shelves = [
      {
        id: 'meine',
        kind: 'group',
        title: 'Meine Notebooks',
        meta: null,
        entries: [],
        layout: 'cards',
      },
    ];
    renderSection();
    await unfold();
    expect(screen.getByText('Meine Notebooks werden geladen…')).toBeInTheDocument();
  });

  it('folds a group open in place and navigates through the sidebar', async () => {
    mocks.shelves = [laender];
    const { onNavigate } = renderSection();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Notebooks' }));
    expect(screen.queryByRole('link', { name: 'Berlin' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Landesverbände' }));
    const link = screen.getByRole('link', { name: 'Berlin' });
    expect(link).toHaveAttribute('href', '/notebooks/berlin');
    await user.click(link);
    // Through the sidebar's navigation (desktop tabs follow it), with the fresh-conversation state.
    expect(onNavigate).toHaveBeenCalledWith('/notebooks/berlin', 'Berlin', {
      freshConversation: true,
    });
  });

  it('has no axe violations when unfolded', async () => {
    mocks.shelves = [
      {
        id: 'at',
        kind: 'notebook',
        title: 'Österreich',
        meta: '',
        notebook: nb('at', 'Österreich'),
      },
      laender,
    ];
    renderSection();
    await unfold();
    expect(
      await axe(document.body, { rules: { region: { enabled: false } } })
    ).toHaveNoViolations();
  });
});
