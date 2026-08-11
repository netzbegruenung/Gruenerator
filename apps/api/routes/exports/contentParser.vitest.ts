import { describe, expect, it } from 'vitest';

import { decodeEntities, parseFormattedContent } from './contentParser.js';

import type { FormattedBlock, FormattedSegment } from './types.js';

/** Full text of a block, segments joined exactly as they will be written. */
function textOf(block: FormattedBlock): string {
  return 'segments' in block ? block.segments.map((segment) => segment.text).join('') : '';
}

function allText(blocks: FormattedBlock[]): string {
  return blocks.map(textOf).join(' | ');
}

function segmentsOf(block: FormattedBlock | undefined): FormattedSegment[] {
  return block && 'segments' in block ? block.segments : [];
}

describe('parseFormattedContent — markdown', () => {
  // The bug in the exported Word file: `**A** wurde am **B** in C` came out as
  // `AwurdeamBin C` because every segment was trimmed individually.
  it('keeps the whitespace between adjacent styled runs', () => {
    const blocks = parseFormattedContent(
      '**Marilyn Monroe** wurde am **1. Juni 1926** in Los Angeles geboren.'
    );

    expect(textOf(blocks[0])).toBe('Marilyn Monroe wurde am 1. Juni 1926 in Los Angeles geboren.');
  });

  it('trims only the outer edges of a paragraph', () => {
    const blocks = parseFormattedContent('   **fett** danach   ');
    expect(textOf(blocks[0])).toBe('fett danach');
  });

  it('emits one block per list item instead of one run-on paragraph', () => {
    const blocks = parseFormattedContent(
      ['- **Blondinen bevorzugt** (1953)', '- **Das verflixte 7. Jahr** (1955)'].join('\n')
    );

    const items = blocks.filter((block) => block.kind === 'listItem');
    expect(items).toHaveLength(2);
    expect(textOf(items[0])).toBe('Blondinen bevorzugt (1953)');
    expect(textOf(items[1])).toBe('Das verflixte 7. Jahr (1955)');
    expect(allText(blocks)).not.toContain('•');
  });

  it('marks ordered lists as ordered and keeps nesting depth', () => {
    const blocks = parseFormattedContent(['1. Erste', '2. Zweite', '   - tiefer'].join('\n'));
    const items = blocks.filter((block) => block.kind === 'listItem');

    expect(items.map((item) => item.ordered)).toEqual([true, true, false]);
    expect(items.map((item) => item.level)).toEqual([0, 0, 1]);
  });

  it('gives separate lists separate ids so Word can restart numbering', () => {
    const blocks = parseFormattedContent(
      ['1. Erste', '2. Zweite', '', 'Dazwischen.', '', '1. Neu', '2. Wieder'].join('\n')
    );
    const ids = blocks.filter((block) => block.kind === 'listItem').map((item) => item.listId);

    expect(new Set(ids).size).toBe(2);
  });

  // marked's HTML output escaped the apostrophe; the old parser never decoded
  // it, so `Manche mögen's heiß` shipped as `Manche mögen&#39;s heiß`.
  it('never introduces HTML entities', () => {
    const blocks = parseFormattedContent("**Manche mögen's heiß** & mehr <5%");
    expect(textOf(blocks[0])).toBe("Manche mögen's heiß & mehr <5%");
  });

  it('captures headings with their level', () => {
    const blocks = parseFormattedContent('# Eins\n\n## Zwei\n\n### Drei');
    expect(blocks.filter((block) => block.kind === 'heading').map((block) => block.level)).toEqual([
      1, 2, 3,
    ]);
  });

  it('keeps links, inline code and strikethrough as styled segments', () => {
    const blocks = parseFormattedContent('Ein [Link](https://example.com), `code` und ~~weg~~.');
    const segments = segmentsOf(blocks[0]);

    expect(segments.find((segment) => segment.href)).toMatchObject({
      text: 'Link',
      href: 'https://example.com',
    });
    expect(segments.find((segment) => segment.code)?.text).toBe('code');
    expect(segments.find((segment) => segment.strike)?.text).toBe('weg');
  });

  it('keeps tables as tables', () => {
    const blocks = parseFormattedContent('| A | B |\n| - | - |\n| 1 | 2 |');
    const table = blocks.find((block) => block.kind === 'table');

    expect(table).toBeDefined();
    expect(table?.kind === 'table' && table.header.map((cell) => cell[0]?.text)).toEqual([
      'A',
      'B',
    ]);
    expect(table?.kind === 'table' && table.rows[0].map((cell) => cell[0]?.text)).toEqual([
      '1',
      '2',
    ]);
  });

  it('keeps fenced code verbatim', () => {
    const blocks = parseFormattedContent('```js\nconst x = 1;\nconst y = 2;\n```');
    const code = blocks.find((block) => block.kind === 'code');

    expect(code?.kind === 'code' && code.text).toBe('const x = 1;\nconst y = 2;');
    expect(code?.kind === 'code' && code.lang).toBe('js');
  });

  it('records blockquote depth', () => {
    const blocks = parseFormattedContent('> Ein Zitat');
    const quote = blocks.find((block) => block.kind === 'paragraph');

    expect(quote?.kind === 'paragraph' && quote.quoteDepth).toBe(1);
  });

  it('returns an empty array for empty input', () => {
    expect(parseFormattedContent(null)).toEqual([]);
    expect(parseFormattedContent(undefined)).toEqual([]);
    expect(parseFormattedContent('   ')).toEqual([]);
  });

  it('turns a standalone image paragraph into an image block', () => {
    const blocks = parseFormattedContent('Davor.\n\n![Ein Sharepic](https://example.org/bild.png)');
    const image = blocks.find((block) => block.kind === 'image');

    expect(image?.kind === 'image' && image.src).toBe('https://example.org/bild.png');
    expect(image?.kind === 'image' && image.alt).toBe('Ein Sharepic');
  });

  it('keeps two images on adjacent lines as two image blocks', () => {
    const blocks = parseFormattedContent('![a](https://x.org/a.png)\n![b](https://x.org/b.png)');
    expect(blocks.filter((block) => block.kind === 'image')).toHaveLength(2);
  });

  it('leaves an image inside running text as an alt-text link segment', () => {
    const blocks = parseFormattedContent('Siehe ![Logo](https://example.org/logo.png) hier.');

    expect(blocks.filter((block) => block.kind === 'image')).toHaveLength(0);
    const paragraph = blocks[0];
    const linked = segmentsOf(paragraph).find((segment) => segment.href);
    expect(linked?.text).toBe('Logo');
    expect(linked?.href).toBe('https://example.org/logo.png');
  });
});

describe('parseFormattedContent — HTML', () => {
  it('splits list items and keeps ordered-ness', () => {
    const blocks = parseFormattedContent(
      '<p>Intro</p><ol><li>Eins</li><li>Zwei</li></ol><p>Schluss</p>'
    );
    const items = blocks.filter((block) => block.kind === 'listItem');

    expect(items).toHaveLength(2);
    expect(items.every((item) => item.ordered)).toBe(true);
    expect(allText(blocks)).toBe('Intro | Eins | Zwei | Schluss');
  });

  it('keeps nested lists one level deeper', () => {
    const blocks = parseFormattedContent('<ul><li>Oben<ul><li>Unten</li></ul></li></ul>');
    const items = blocks.filter((block) => block.kind === 'listItem');

    expect(items.map((item) => [textOf(item), item.level])).toEqual([
      ['Oben', 0],
      ['Unten', 1],
    ]);
  });

  // A closing tag must pop the INNERMOST element of that name. Popping the
  // outermost let `</li>` of the nested list close the outer `<li>` as well, so
  // every sibling after the nested list fell out of the `<ul>` and rendered as
  // a paragraph.
  it('keeps sibling items that follow a nested list', () => {
    const blocks = parseFormattedContent('<ul><li>A<ul><li>B</li></ul></li><li>C</li></ul>');
    const items = blocks.filter((block) => block.kind === 'listItem');

    expect(items.map((item) => [textOf(item), item.level])).toEqual([
      ['A', 0],
      ['B', 1],
      ['C', 0],
    ]);
    expect(blocks.some((block) => block.kind === 'paragraph')).toBe(false);
  });

  it('closes the inner element first when the same tag is nested', () => {
    const blocks = parseFormattedContent(
      '<div><div><strong>tief</strong></div><em>danach</em></div>'
    );

    expect(allText(blocks)).toBe('tief | danach');
  });

  // Overlapping regexes used to let two patterns claim the same span and emit
  // the text twice.
  it('does not duplicate text across nested inline tags', () => {
    const blocks = parseFormattedContent('<p><strong><em>Marilyn</em> Monroe</strong> lebte.</p>');

    expect(textOf(blocks[0])).toBe('Marilyn Monroe lebte.');
    expect(segmentsOf(blocks[0])[0]).toMatchObject({ text: 'Marilyn', bold: true, italic: true });
  });

  it('preserves the space between adjacent tags', () => {
    const blocks = parseFormattedContent('<p><strong>A</strong> und <strong>B</strong></p>');
    expect(textOf(blocks[0])).toBe('A und B');
  });

  it('keeps headings, blockquotes and tables', () => {
    const blocks = parseFormattedContent(
      '<h2>Titel</h2><blockquote><p>Zitat</p></blockquote><table><tr><th>A</th></tr><tr><td>1</td></tr></table>'
    );

    expect(blocks.find((block) => block.kind === 'heading')?.kind).toBe('heading');
    const quote = blocks.find((block) => block.kind === 'paragraph');
    expect(quote?.kind === 'paragraph' && quote.quoteDepth).toBe(1);
    expect(blocks.find((block) => block.kind === 'table')).toBeDefined();
  });

  it('survives unclosed tags without losing text', () => {
    const blocks = parseFormattedContent('<p>Erst<strong>zweit<p>dritt');
    expect(allText(blocks)).toContain('Erst');
    expect(allText(blocks)).toContain('dritt');
  });

  it('treats a lone "<" as text, not as a tag', () => {
    expect(allText(parseFormattedContent('<p>5 < 7 und 9 > 3</p>'))).toBe('5 < 7 und 9 > 3');
  });

  it('keeps a ">" that sits inside a quoted attribute out of the tag end', () => {
    const blocks = parseFormattedContent('<p title="a > b">Inhalt</p>');
    expect(allText(blocks)).toBe('Inhalt');
  });

  // The regex this replaced let the tag-name class and the attribute class both
  // match `-`, so `<a` plus a run of dashes backtracked quadratically: 16k
  // dashes blocked the event loop for 350ms, 100k for seconds. Export content
  // is user-supplied and the API worker is single-threaded.
  it('scans pathological input in linear time', () => {
    const pathological = [
      '<a' + '-'.repeat(50_000),
      '<a"' + '"<a"'.repeat(12_500),
      '<a<a'.repeat(12_500),
    ];

    for (const input of pathological) {
      const started = performance.now();
      parseFormattedContent(input);
      expect(performance.now() - started).toBeLessThan(1_000);
    }
  });
});

describe('decodeEntities', () => {
  it('decodes numeric and named entities', () => {
    expect(decodeEntities('mögen&#39;s hei&szlig;')).toBe("mögen's heiß");
    expect(decodeEntities('a &#x26; b')).toBe('a & b');
  });

  // `&amp;lt;` is an escaped `&lt;`, not an escaped `<`. Decoding `&amp;` first
  // would turn escaped markup back into markup.
  it('does not double-decode', () => {
    expect(decodeEntities('&amp;lt;script&amp;gt;')).toBe('&lt;script&gt;');
  });
});
