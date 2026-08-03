import { slideBodyExtensions } from '@gruenerator/contracts/presentations-richtext';
import { Editor } from '@tiptap/react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { SlideBodyToolbar } from './SlideBodyToolbar.js';

interface JsonNode {
  type?: string;
  content?: JsonNode[];
}

/** getJSON() is typed against the whole schema union; the table shape is what
 * these tests are about, so read it back through one narrow cast. */
function tableRows(e: Editor): JsonNode[] {
  const doc = e.getJSON() as JsonNode;
  return doc.content?.find((n) => n.type === 'table')?.content ?? [];
}

let editor: Editor | null = null;

function mount(content = '<p>Hallo</p>') {
  editor = new Editor({ extensions: slideBodyExtensions, content });
  const onRequestImage = vi.fn();
  const view = render(<SlideBodyToolbar editor={editor} onRequestImage={onRequestImage} />);
  return { editor, onRequestImage, view };
}

afterEach(() => {
  editor?.destroy();
  editor = null;
});

describe('SlideBodyToolbar', () => {
  it('offers table and image, and hides the table controls outside a table', () => {
    mount();
    expect(screen.getByRole('button', { name: 'Tabelle einfügen' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bild einfügen' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Zeile löschen' })).not.toBeInTheDocument();
  });

  it('inserts a 3×2 table with a header row', () => {
    const { editor: e, view } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Tabelle einfügen' }));

    const rows = tableRows(e);
    expect(rows).toHaveLength(3);
    expect(rows[0]?.content?.[0]?.type).toBe('tableHeader');
    expect(rows[1]?.content?.[0]?.type).toBe('tableCell');
    view.unmount();
  });

  it('reveals the row and column controls once the caret sits in a table', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Tabelle einfügen' }));

    // insertTable leaves the selection in the first cell.
    expect(screen.getByRole('button', { name: 'Zeile darunter einfügen' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Spalte löschen' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kopfzeile umschalten' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tabelle löschen' })).toBeInTheDocument();
  });

  it('adds a row through the toolbar', () => {
    const { editor: e } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Tabelle einfügen' }));
    fireEvent.click(screen.getByRole('button', { name: 'Zeile darunter einfügen' }));

    expect(tableRows(e)).toHaveLength(4);
  });

  it('delegates the image button — insertion runs through the dialog', () => {
    const { onRequestImage } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Bild einfügen' }));
    expect(onRequestImage).toHaveBeenCalledTimes(1);
  });

  it('has no accessibility violations with the table controls open', async () => {
    const { view } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Tabelle einfügen' }));
    // color-contrast needs real layout and paint; jsdom has neither.
    const result = await axe(view.container, { rules: { 'color-contrast': { enabled: false } } });
    expect(result).toHaveNoViolations();
  });
});
