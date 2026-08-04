import {
  bodyFragmentKey,
  formatSlideImageMarkdown,
  fragmentToMarkdown,
  markdownToPMJSON,
  pmJSONToMarkdown,
  seedFragmentFromMarkdown,
} from '@gruenerator/contracts/presentations-richtext';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

function roundTrip(md: string): string {
  const doc = new Y.Doc();
  const frag = doc.getXmlFragment(bodyFragmentKey('slide-1'));
  doc.transact(() => seedFragmentFromMarkdown(frag, md));
  return fragmentToMarkdown(frag);
}

describe('slide body markdown ⇄ fragment', () => {
  it('round-trips a flat bullet list', () => {
    expect(roundTrip('- Erster Punkt\n- Zweiter Punkt')).toBe('- Erster Punkt\n- Zweiter Punkt');
  });

  it('preserves bold and italic marks', () => {
    expect(roundTrip('- Ein **fetter** und *kursiver* Punkt')).toBe(
      '- Ein **fetter** und *kursiver* Punkt'
    );
  });

  it('round-trips an ordered list', () => {
    expect(roundTrip('1. Eins\n2. Zwei\n3. Drei')).toBe('1. Eins\n2. Zwei\n3. Drei');
  });

  it('round-trips a nested list', () => {
    const md = '- Oben\n  - Unten';
    expect(roundTrip(md)).toBe(md);
  });

  it('round-trips a paragraph', () => {
    expect(roundTrip('Ein einfacher Absatz.')).toBe('Ein einfacher Absatz.');
  });

  it('yields an empty string for empty input', () => {
    expect(roundTrip('')).toBe('');
  });

  it('markdownToPMJSON always produces a schema-valid doc', () => {
    const json = markdownToPMJSON('') as { type: string; content: unknown[] };
    expect(json.type).toBe('doc');
    expect(json.content.length).toBeGreaterThan(0);
  });

  it('pmJSONToMarkdown tolerates unknown/empty docs', () => {
    expect(pmJSONToMarkdown({ type: 'doc', content: [] })).toBe('');
  });
});

/**
 * Tables are a real node now. Before that they had two lives, both lossy: they
 * vanished outright (`Tokens.Table` carries `header`/`rows` and no `.text`, so
 * it hit `blockToPM`'s default branch and produced `[]` — a slide titled
 * "Quellenmatrix" reached an audience as a headline over white space on
 * 03.08.2026), and then survived flattened into a bullet list.
 *
 * The gate that should have caught the first version could not: `findEmptySlides`
 * reads the GENERATED STRUCTURE, where the body was a full table, while the loss
 * happened later, at seeding. Which is why these assertions live on the round
 * trip and not on the generator.
 */
describe('a markdown table round-trips as a table', () => {
  it('keeps header and body rows', () => {
    const md = ['| Quelle | Datum |', '| --- | --- |', '| Rat der EU | 05.03.2026 |'].join('\n');
    expect(roundTrip(md)).toBe(md);
  });

  it('keeps a multi-row matrix intact', () => {
    const md = [
      '| Punkt | Wert |',
      '| --- | --- |',
      '| Minderung | 90 % |',
      '| Bezugsjahr | 1990 |',
    ].join('\n');
    expect(roundTrip(md)).toBe(md);
  });

  it('keeps per-column alignment', () => {
    const md = ['| A | B | C |', '| :--- | :---: | ---: |', '| 1 | 2 | 3 |'].join('\n');
    expect(roundTrip(md)).toBe(md);
  });

  it('keeps marks inside cells', () => {
    const md = ['| **Kopf** |', '| --- |', '| *kursiv* |'].join('\n');
    expect(roundTrip(md)).toBe(md);
  });

  it('keeps a literal pipe in a cell escaped', () => {
    const md = ['| Feld |', '| --- |', '| a \\| b |'].join('\n');
    expect(roundTrip(md)).toBe(md);
  });

  it('survives a header-only table', () => {
    const md = '| Eins | Zwei |\n| --- | --- |';
    expect(roundTrip(md)).toBe(md);
  });

  it('never yields an empty body for a non-empty table', () => {
    expect(roundTrip('| A |\n| --- |\n| x |').trim().length).toBeGreaterThan(0);
  });
});

/**
 * Images are block nodes, but markdown writes them inline — so a paragraph that
 * mixes prose and `![…](…)` has to split. Before the image node existed, marked
 * put the ALT TEXT in `token.text` and the URL nowhere our converter looked:
 * `![Logo](…)` seeded as the bare word "Logo". That made the `image` layout and
 * the PPTX export's `firstImageUrl` dead code — both read a body that could
 * never contain a URL.
 */
describe('an image survives the fragment', () => {
  it('keeps src and alt', () => {
    const md = '![Logo](https://example.org/x.png)';
    expect(roundTrip(md)).toBe(md);
  });

  it('keeps an optional title', () => {
    const md = '![Logo](https://example.org/x.png "Grünes Logo")';
    expect(roundTrip(md)).toBe(md);
  });

  it('splits a paragraph that mixes prose and an image', () => {
    const md = 'Vorher\n\n![Bild](https://e.org/a.png)\n\n- eins\n- zwei';
    expect(roundTrip(md)).toBe(md);
  });

  it('keeps the URL, not just the alt text', () => {
    expect(roundTrip('![Logo](https://example.org/x.png)')).toContain('https://example.org/x.png');
  });

  // The touch editor writes this markdown by hand, so the escaping has to be
  // the same function that reads it back.
  it('escapes brackets in the alt text and parentheses in the URL', () => {
    const md = formatSlideImageMarkdown({
      src: 'https://example.org/a(1).png',
      alt: 'Grafik [Q1]',
    });
    expect(md).toBe('![Grafik \\[Q1\\]](https://example.org/a\\(1\\).png)');

    const doc = markdownToPMJSON(md);
    const image = doc.content?.find((n) => n.type === 'image');
    expect(image?.attrs).toMatchObject({
      src: 'https://example.org/a(1).png',
      alt: 'Grafik [Q1]',
    });
    expect(roundTrip(md)).toBe(md);
  });

  // A trailing backslash in alt/src must not merge with the following escape
  // and swallow the bracket it was meant to protect (CodeQL js/incomplete-sanitization).
  it('escapes a trailing backslash before escaping brackets/parens', () => {
    const alt = formatSlideImageMarkdown({ src: 'https://e.org/a.png', alt: 'Endet mit \\' });
    expect(alt).toBe('![Endet mit \\\\](https://e.org/a.png)');

    const src = formatSlideImageMarkdown({ src: 'https://e.org/a\\(1).png', alt: 'x' });
    expect(src).toBe('![x](https://e.org/a\\\\\\(1\\).png)');
  });
});
