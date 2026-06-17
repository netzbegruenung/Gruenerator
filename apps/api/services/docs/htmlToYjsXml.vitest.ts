import { DOCUMENT_FRAGMENT_NAME, injectHtmlIntoFragment } from '@gruenerator/shared/yjs';
import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';

/**
 * The HTML→Yjs seed converter feeds the BlockNote editor. These lock the fidelity
 * that agent-generated documents depend on: inline marks (bold/italic/code) and
 * links must survive into the Yjs state instead of being flattened to plain text.
 */

interface SeededBlock {
  type: string;
  level: string | null;
  delta: Array<{ insert: string; attributes?: Record<string, unknown> }>;
}

function seedBlocks(html: string): { blocks: SeededBlock[]; fragmentLength: number } {
  const doc = new Y.Doc();
  const fragment = doc.getXmlFragment(DOCUMENT_FRAGMENT_NAME);
  injectHtmlIntoFragment(fragment, html);

  const blocks: SeededBlock[] = [];
  if (fragment.length > 0) {
    const group = fragment.get(0) as Y.XmlElement;
    for (let i = 0; i < group.length; i++) {
      const container = group.get(i) as Y.XmlElement;
      const block = container.get(0) as Y.XmlElement;
      const xmlText = block.get(0) as Y.XmlText;
      blocks.push({
        type: block.nodeName,
        level: block.getAttribute('level') ?? null,
        delta: xmlText.toDelta(),
      });
    }
  }
  return { blocks, fragmentLength: fragment.length };
}

describe('injectHtmlIntoFragment — inline fidelity', () => {
  it('preserves bold, italic and inline code as marks (not plain text)', () => {
    const { blocks } = seedBlocks(
      '<p>Die <strong>Grünen</strong> fordern <em>mehr</em> und <code>code</code>.</p>'
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('paragraph');
    expect(blocks[0].delta).toEqual([
      { insert: 'Die ' },
      { insert: 'Grünen', attributes: { bold: {} } },
      { insert: ' fordern ' },
      { insert: 'mehr', attributes: { italic: {} } },
      { insert: ' und ' },
      { insert: 'code', attributes: { code: {} } },
      { insert: '.' },
    ]);
  });

  it('preserves links with their href', () => {
    const { blocks } = seedBlocks('<p>Mehr auf <a href="https://gruene.de">unserer Seite</a>.</p>');
    expect(blocks[0].delta).toEqual([
      { insert: 'Mehr auf ' },
      { insert: 'unserer Seite', attributes: { link: { href: 'https://gruene.de' } } },
      { insert: '.' },
    ]);
  });

  it('parses headings with their level and keeps inline marks inside them', () => {
    const { blocks } = seedBlocks('<h2>Ein <strong>Titel</strong></h2>');
    expect(blocks[0].type).toBe('heading');
    expect(blocks[0].level).toBe('2');
    expect(blocks[0].delta).toEqual([
      { insert: 'Ein ' },
      { insert: 'Titel', attributes: { bold: {} } },
    ]);
  });

  it('preserves marks inside list items', () => {
    const { blocks } = seedBlocks(
      '<ul><li>Punkt mit <strong>Fokus</strong></li><li>zwei</li></ul>'
    );
    expect(blocks.map((b) => b.type)).toEqual(['bulletListItem', 'bulletListItem']);
    expect(blocks[0].delta).toEqual([
      { insert: 'Punkt mit ' },
      { insert: 'Fokus', attributes: { bold: {} } },
    ]);
  });

  it('keeps plain text unformatted (no stray attributes)', () => {
    const { blocks } = seedBlocks('<p>Nur Text.</p>');
    expect(blocks[0].delta).toEqual([{ insert: 'Nur Text.' }]);
  });

  it('does not seed a group for empty/blank html', () => {
    expect(seedBlocks('').fragmentLength).toBe(0);
    expect(seedBlocks('   ').fragmentLength).toBe(0);
  });
});
