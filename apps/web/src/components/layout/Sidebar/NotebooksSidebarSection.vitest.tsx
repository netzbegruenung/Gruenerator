import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { axe, renderWithProviders } from '../../../test-utils';

import { NotebooksSidebarSection } from './NotebooksSidebarSection';

const mocks = vi.hoisted(() => ({ shelves: [] as unknown[], isMobile: false, shelfCalls: 0 }));

vi.mock('../../../features/notebook/wissen/useNotebookShelves', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useNotebookShelves: () => {
    mocks.shelfCalls += 1;
    return { shelves: mocks.shelves, vectorStoreDown: false };
  },
}));
vi.mock('@gruenerator/ui', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useIsMobile: () => mocks.isMobile,
}));

const nb = (id: string, title: string) => ({ id, title, meta: '', path: `/notebooks/${id}` });
const systemEntry = (id: string, title: string) => ({
  kind: 'system',
  key: id,
  notebook: nb(id, title),
});

function renderSection() {
  const onNavigate = vi.fn();
  renderWithProviders(
    <NotebooksSidebarSection
      openRef={{ current: false }}
      titleClass=""
      collapsed={false}
      onNavigate={onNavigate}
    />
  );
  return { onNavigate };
}

const openMenu = () => userEvent.setup().click(screen.getByRole('button', { name: 'Notebooks' }));

beforeEach(() => {
  mocks.isMobile = false;
  mocks.shelves = [];
  mocks.shelfCalls = 0;
});

describe('NotebooksSidebarSection', () => {
  // The shelf queries poll and, for guests, fail with 401: they must not run on every page.
  it('loads the shelves only once the menu is open', async () => {
    renderSection();
    expect(mocks.shelfCalls).toBe(0);
    await openMenu();
    expect(mocks.shelfCalls).toBeGreaterThan(0);
  });

  it('renders a single-notebook shelf as a real link', async () => {
    mocks.shelves = [
      {
        id: 'at',
        kind: 'notebook',
        title: 'Österreich',
        meta: '',
        notebook: nb('at', 'Österreich'),
      },
    ];
    renderSection();
    await openMenu();
    expect(screen.getByRole('menuitem', { name: 'Österreich' })).toHaveAttribute(
      'href',
      '/notebooks/at'
    );
  });

  it('always offers "Neues Notebook" and "Alle Notebooks" as links', async () => {
    renderSection();
    await openMenu();
    expect(screen.getByRole('menuitem', { name: 'Neues Notebook' })).toHaveAttribute(
      'href',
      '/notebooks/neu'
    );
    expect(screen.getByRole('menuitem', { name: 'Alle Notebooks' })).toHaveAttribute(
      'href',
      '/wissen'
    );
  });

  it('drops the empty "Meine Notebooks" shelf instead of labelling a create link', async () => {
    mocks.shelves = [
      { id: 'meine', kind: 'create', title: 'Meine Notebooks', meta: 'Erstes Notebook anlegen' },
    ];
    renderSection();
    await openMenu();
    expect(screen.queryByRole('menuitem', { name: /Meine Notebooks/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole('menuitem')).toHaveLength(2);
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
    await openMenu();
    expect(screen.getByText('Meine Notebooks werden geladen…')).toBeInTheDocument();
  });

  it('lists a group inline on mobile', async () => {
    mocks.isMobile = true;
    mocks.shelves = [
      {
        id: 'laender',
        kind: 'group',
        title: 'Landesverbände',
        meta: '1 Landesverband',
        entries: [systemEntry('berlin', 'Berlin')],
        layout: 'photos',
      },
    ];
    renderSection();
    await openMenu();
    expect(screen.getByRole('menuitem', { name: 'Berlin' })).toHaveAttribute(
      'href',
      '/notebooks/berlin'
    );
  });

  it('opens a group as a submenu on desktop and closes the sidebar on select', async () => {
    mocks.shelves = [
      {
        id: 'laender',
        kind: 'group',
        title: 'Landesverbände',
        meta: '1 Landesverband',
        entries: [systemEntry('berlin', 'Berlin')],
        layout: 'photos',
      },
    ];
    const { onNavigate } = renderSection();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Notebooks' }));
    const trigger = screen.getByRole('menuitem', { name: 'Landesverbände' });
    trigger.focus();
    await user.keyboard('{ArrowRight}');
    const link = await screen.findByRole('menuitem', { name: 'Berlin' });
    expect(link).toHaveAttribute('href', '/notebooks/berlin');
    await user.click(link);
    // Through the sidebar's navigation (desktop tabs follow it), with the fresh-conversation state.
    expect(onNavigate).toHaveBeenCalledWith('/notebooks/berlin', 'Berlin', {
      freshConversation: true,
    });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('has no axe violations with the menu open', async () => {
    mocks.shelves = [
      {
        id: 'at',
        kind: 'notebook',
        title: 'Österreich',
        meta: '',
        notebook: nb('at', 'Österreich'),
      },
    ];
    renderSection();
    await openMenu();
    expect(
      await axe(document.body, { rules: { region: { enabled: false } } })
    ).toHaveNoViolations();
  });
});
