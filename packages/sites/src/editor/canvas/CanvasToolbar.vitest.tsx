import { type SiteBlock, type SiteDraft } from '@gruenerator/contracts';
import { decodeSiteDraft } from '@gruenerator/contracts/site-ydoc';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useEditorStore, type EditorSelection } from '../../stores/editorStore';
import { renderWithDraft } from '../../test/renderWithDraft';

import { CanvasToolbar } from './CanvasToolbar';

const ANCHOR = { top: 200, left: 40, width: 300, height: 120 };
const EMPTY = { type: 'doc' as const, content: [] };
const cards = ['Eins', 'Zwei', 'Drei'].map((title, i) => ({
  id: `t${i}`,
  title,
  imageUrl: '',
  content: EMPTY,
}));
const BLOCKS: SiteBlock[] = [
  { id: 'hero', type: 'hero' },
  { id: 'about', type: 'about', title: 'Wer ich bin', content: EMPTY },
  { id: 'th', type: 'themes', items: cards },
  { id: 'co', type: 'contact', title: 'Kontakt', backgroundImageUrl: '' },
];

// Like the editor, the toolbar follows the selection in the store.
function Harness() {
  const selection = useEditorStore((s) => s.selection);
  return selection ? (
    <CanvasToolbar selection={selection} anchor={ANCHOR} canvasWidth={1200} canvasHeight={800} />
  ) : null;
}

function renderToolbar(selection: EditorSelection) {
  useEditorStore.setState({ selection, elementPanel: null });
  return renderWithDraft(<Harness />, { blocks: BLOCKS });
}

const order = (draft: SiteDraft) => draft.blocks.map((block) => block.id);
const cardTitles = (draft: SiteDraft) => {
  const block = draft.blocks.find((b) => b.id === 'th');
  return block?.type === 'themes' ? block.items.map((item) => item.title) : [];
};
const select = (blockId: string, itemId: string | null = null) => ({ blockId, itemId, path: null });

beforeEach(() => {
  useEditorStore.setState({ selection: null, elementPanel: null, dialog: null });
});

describe('CanvasToolbar', () => {
  it('offers image, details and the block tools for a plain block', () => {
    renderToolbar(select('co'));
    expect(screen.getByRole('toolbar', { name: 'Werkzeuge: Kontakt' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bild ändern' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kontakt bearbeiten' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kontakt ausblenden' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kontakt löschen' })).toBeInTheDocument();
    // One contact block per page.
    expect(screen.getByRole('button', { name: 'Kontakt doppeln' })).toBeDisabled();
  });

  it('offers no block tools on the profile', () => {
    renderToolbar({ blockId: 'hero', itemId: null, path: 'site_title' });
    for (const name of [/ausblenden/, /löschen/, /doppeln/, /nach oben/, /nach unten/]) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
  });

  it('moves a block, but never above the profile', async () => {
    const { user, ydoc } = renderToolbar(select('about'));
    expect(screen.getByRole('button', { name: 'Über mich nach oben' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Über mich nach unten' }));
    expect(order(decodeSiteDraft(ydoc))).toEqual(['hero', 'th', 'about', 'co']);
  });

  it('duplicates a theme block right after it and selects the copy', async () => {
    const { user, ydoc } = renderToolbar(select('th'));
    await user.click(screen.getByRole('button', { name: 'Themen doppeln' }));
    const draft = decodeSiteDraft(ydoc);
    const copy = draft.blocks[3];
    expect(copy?.type).toBe('themes');
    expect(useEditorStore.getState().selection?.blockId).toBe(copy?.id);
  });

  it('hides and shows a block and keeps it selected', async () => {
    const { user, ydoc } = renderToolbar(select('about'));
    await user.click(screen.getByRole('button', { name: 'Über mich ausblenden' }));
    expect(decodeSiteDraft(ydoc).blocks[1]).toMatchObject({ hidden: true });
    await user.click(screen.getByRole('button', { name: 'Über mich einblenden' }));
    expect(decodeSiteDraft(ydoc).blocks[1]).not.toHaveProperty('hidden');
    expect(useEditorStore.getState().selection?.blockId).toBe('about');
  });

  it('deletes a block and clears the selection', async () => {
    const { user, ydoc } = renderToolbar(select('about'));
    await user.click(screen.getByRole('button', { name: 'Über mich löschen' }));
    expect(order(decodeSiteDraft(ydoc))).toEqual(['hero', 'th', 'co']);
    expect(useEditorStore.getState().selection).toBeNull();
  });

  it('moves, removes and adds cards and follows them with the selection', async () => {
    const { user, ydoc } = renderToolbar(select('th', 't0'));
    expect(screen.getByRole('toolbar', { name: 'Werkzeuge: Thema 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thema nach links' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Thema nach rechts' }));
    expect(cardTitles(decodeSiteDraft(ydoc))).toEqual(['Zwei', 'Eins', 'Drei']);
    expect(useEditorStore.getState().selection?.itemId).toBe('t0');

    await user.click(screen.getByRole('button', { name: 'Thema entfernen' }));
    expect(cardTitles(decodeSiteDraft(ydoc))).toEqual(['Zwei', 'Drei']);

    await user.click(screen.getByRole('button', { name: 'Thema hinzufügen' }));
    const draft = decodeSiteDraft(ydoc);
    expect(cardTitles(draft)).toHaveLength(3);
    const themes = draft.blocks.find((b) => b.id === 'th');
    expect(useEditorStore.getState().selection?.itemId).toBe(
      themes?.type === 'themes' ? themes.items[2]?.id : 'missing'
    );
  });

  it('opens and closes the details panel', async () => {
    const { user } = renderToolbar(select('hero'));
    const details = screen.getByRole('button', { name: 'Profil bearbeiten' });
    await user.click(details);
    expect(useEditorStore.getState().elementPanel).toBe('details');
    await user.click(details);
    expect(useEditorStore.getState().elementPanel).toBeNull();
  });
});
