import { act, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

// The tab contents have their own tests; here they only need to be recognisable.
vi.mock('../../components/editor/legal/LegalPanel', () => ({
  LegalPanel: () => <p>Impressum-Formular</p>,
}));
vi.mock('../../components/editor/settings/SettingsPanel', () => ({
  SettingsPanel: () => <p>Adress-Formular</p>,
}));
vi.mock('../../components/editor/settings/DesignPanel', () => ({
  DesignPanel: () => <p>Design-Formular</p>,
}));
vi.mock('../canvas/SelectionForm', () => ({
  SelectionForm: ({ selection, panel }: { selection: { blockId: string }; panel: string }) => (
    <p>
      Formular {panel} {selection.blockId}
    </p>
  ),
}));

import { BASE_DRAFT } from '../../draft/testDoc';
import { useEditorStore } from '../../stores/editorStore';
import { renderWithDraft } from '../../test/renderWithDraft';

import { SiteSidebarPanel, SiteSidebarTabs } from './SiteSidebar';

function setViewport(mobile: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: mobile && query.includes('max-width'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
  );
}

const reset = () =>
  useEditorStore.setState({
    selection: null,
    elementPanel: null,
    sidebarTab: null,
    focusedField: null,
    highlightedElement: null,
  });

function renderSidebar() {
  return renderWithDraft(
    <div data-editor-chrome-root="">
      <SiteSidebarTabs />
      <SiteSidebarPanel />
    </div>
  );
}

const about = BASE_DRAFT.blocks.find((b) => b.type === 'about');

beforeEach(() => {
  reset();
  setViewport(false);
});
afterEach(() => {
  act(reset);
  vi.unstubAllGlobals();
});

describe('site sidebar', () => {
  it('opens a tab panel from the rail and closes it with the same tab', async () => {
    const { user, container } = renderSidebar();
    const nav = screen.getByRole('navigation', { name: 'Bereiche der Website' });
    expect(
      within(nav)
        .getAllByRole('button')
        .map((b) => b.getAttribute('aria-label'))
    ).toEqual(['Bausteine hinzufügen', 'Seite ordnen', 'Design', 'Einstellungen', 'Impressum']);

    await user.click(screen.getByRole('button', { name: 'Design' }));
    expect(screen.getByRole('region', { name: 'Design' })).toHaveTextContent('Design-Formular');
    expect(await axe(container)).toHaveNoViolations();

    await user.click(screen.getByRole('button', { name: 'Design' }));
    expect(screen.queryByRole('region', { name: 'Design' })).toBeNull();
  });

  it('shows the block form for the selection and swaps it for a tab', async () => {
    const { user } = renderSidebar();
    act(() => {
      useEditorStore.getState().select({ blockId: about?.id ?? '', itemId: null, path: null });
      useEditorStore.getState().openElementPanel('details');
    });
    expect(screen.getByRole('region', { name: 'Über mich' })).toHaveTextContent(
      `Formular details ${about?.id}`
    );

    await user.click(screen.getByRole('button', { name: 'Einstellungen' }));
    expect(screen.getByRole('region', { name: 'Einstellungen' })).toHaveTextContent(
      'Adress-Formular'
    );
    expect(useEditorStore.getState().elementPanel).toBeNull();
  });

  it('opens the Impressum when a publish issue points there', () => {
    renderSidebar();
    act(() => useEditorStore.getState().focusPath('legal', 'legal.name'));
    expect(screen.getByRole('region', { name: 'Impressum' })).toHaveTextContent(
      'Impressum-Formular'
    );
  });

  it('selects a new block and opens its form after adding it', async () => {
    const { user } = renderSidebar();
    await user.click(screen.getByRole('button', { name: 'Bausteine hinzufügen' }));
    await user.click(screen.getByRole('button', { name: /^Themen/ }));
    const { selection, elementPanel, sidebarTab } = useEditorStore.getState();
    expect(sidebarTab).toBeNull();
    expect(elementPanel).toBe('details');
    expect(screen.getByRole('region', { name: 'Themen' })).toHaveTextContent(
      `Formular details ${selection?.blockId}`
    );
  });

  it('is a bottom bar with a sheet on a phone', async () => {
    setViewport(true);
    const { user } = renderSidebar();
    await user.click(screen.getByRole('button', { name: 'Impressum' }));
    const sheet = document.getElementById('canvas-sidebar-panel');
    expect(sheet?.tagName).toBe('SECTION');
    expect(sheet).toHaveAttribute('aria-label', 'Impressum');
  });
});
