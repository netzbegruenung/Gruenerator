import { decodeSiteDraft } from '@gruenerator/contracts/site-ydoc';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useEditorStore, type EditorSelection } from '../../stores/editorStore';
import { renderWithDraft } from '../../test/renderWithDraft';

import { CanvasToolbar } from './CanvasToolbar';

const ANCHOR = { top: 200, left: 40, width: 300, height: 120 };
const EMPTY = { type: 'doc' as const, content: [] };
const themes = ['Eins', 'Zwei', 'Drei'].map((title, i) => ({
  id: `t${i}`,
  title,
  imageUrl: '',
  content: EMPTY,
}));

// Like the editor, the toolbar follows the selection in the store.
function Harness() {
  const selection = useEditorStore((s) => s.selection);
  return selection ? (
    <CanvasToolbar selection={selection} anchor={ANCHOR} canvasWidth={1200} canvasHeight={800} />
  ) : null;
}

function renderToolbar(selection: EditorSelection) {
  useEditorStore.setState({ selection, elementPanel: null });
  return renderWithDraft(<Harness />, { themes });
}

beforeEach(() => {
  useEditorStore.setState({ selection: null, elementPanel: null, dialog: null });
});

describe('CanvasToolbar', () => {
  it('offers image, details and hide for a plain section', () => {
    renderToolbar({ section: 'contact', path: null, index: null });
    expect(screen.getByRole('toolbar', { name: 'Werkzeuge: Kontakt' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bild ändern' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kontakt bearbeiten' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kontakt ausblenden' })).toBeInTheDocument();
  });

  it('cannot hide the profile section', () => {
    renderToolbar({ section: 'hero', path: 'site_title', index: null });
    expect(screen.queryByRole('button', { name: /ausblenden/ })).toBeNull();
  });

  it('moves, removes and adds theme cards in the draft and follows them with the selection', async () => {
    const { user, ydoc } = renderToolbar({ section: 'themes', path: null, index: 0 });
    expect(screen.getByRole('toolbar', { name: 'Werkzeuge: Thema 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thema nach links' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Thema nach rechts' }));
    expect(decodeSiteDraft(ydoc).themes.map((t) => t.title)).toEqual(['Zwei', 'Eins', 'Drei']);
    expect(useEditorStore.getState().selection?.index).toBe(1);

    await user.click(screen.getByRole('button', { name: 'Thema entfernen' }));
    expect(decodeSiteDraft(ydoc).themes.map((t) => t.title)).toEqual(['Zwei', 'Drei']);

    await user.click(screen.getByRole('button', { name: 'Thema hinzufügen' }));
    expect(decodeSiteDraft(ydoc).themes).toHaveLength(3);
    expect(useEditorStore.getState().selection?.index).toBe(2);
  });

  it('hides an optional section and clears the selection', async () => {
    const { user, ydoc } = renderToolbar({ section: 'about', path: null, index: null });
    await user.click(screen.getByRole('button', { name: 'Über mich ausblenden' }));
    expect(decodeSiteDraft(ydoc).hidden).toContain('about');
    expect(useEditorStore.getState().selection).toBeNull();
  });

  it('opens and closes the details panel', async () => {
    const { user } = renderToolbar({ section: 'hero', path: null, index: null });
    const details = screen.getByRole('button', { name: 'Profil bearbeiten' });
    await user.click(details);
    expect(useEditorStore.getState().elementPanel).toBe('details');
    await user.click(details);
    expect(useEditorStore.getState().elementPanel).toBeNull();
  });
});
