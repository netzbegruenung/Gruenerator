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
