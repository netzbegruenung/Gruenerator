import {
  bodyFragmentKey,
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
 * The slide-body schema has no table node, and a markdown table used to vanish
 * entirely: `Tokens.Table` carries `header`/`rows` and no `.text`, so it hit
 * `blockToPM`'s default branch and produced `[]`.
 *
 * The gate that should have caught it could not: `findEmptySlides` reads the
 * GENERATED STRUCTURE, where the body was a full table, while the loss happens
 * later, at seeding. On 03.08.2026 a slide titled "Quellenmatrix" reached the
 * audience as a headline over white space.
 */
describe('a markdown table survives as a list', () => {
  it('keeps every cell, labelled by its column', () => {
    const md = ['| Quelle | Datum |', '| --- | --- |', '| Rat der EU | 05.03.2026 |'].join('\n');
    expect(roundTrip(md)).toBe('- Quelle: Rat der EU — Datum: 05.03.2026');
  });

  it('keeps a multi-row matrix intact', () => {
    const md = [
      '| Punkt | Wert |',
      '| --- | --- |',
      '| Minderung | 90 % |',
      '| Bezugsjahr | 1990 |',
    ].join('\n');
    expect(roundTrip(md)).toBe('- Punkt: Minderung — Wert: 90 %\n- Punkt: Bezugsjahr — Wert: 1990');
  });

  it('does not label a header-only table with itself', () => {
    expect(roundTrip('| Eins | Zwei |\n| --- | --- |')).toBe('- Eins — Zwei');
  });

  it('never yields an empty body for a non-empty table', () => {
    const md = '| A |\n| --- |\n| x |';
    expect(roundTrip(md).trim().length).toBeGreaterThan(0);
  });
});
