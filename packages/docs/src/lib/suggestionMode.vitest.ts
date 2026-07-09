import { addSuggestionMarks } from '@handlewithcare/prosemirror-suggest-changes';
import { type Node as PMNode, Schema } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';

import {
  collectSuggestions,
  generateSuggestionId,
  getSuggestionIdAtSelection,
  hasPendingSuggestions,
  suggestionMetaCount,
  type SuggestionMeta,
} from './suggestionMode';

// Minimal ProseMirror schema carrying the real suggestion marks, so the tests
// exercise the same mark shapes BlockNote registers at runtime.
const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'text*', toDOM: () => ['p', 0] },
    text: {},
  },
  marks: addSuggestionMarks({}),
});

function para(...content: PMNode[]): PMNode {
  return schema.node('doc', null, [schema.node('paragraph', null, content)]);
}

function insertion(text: string, id: number): PMNode {
  return schema.text(text, [schema.marks.insertion.create({ id })]);
}

describe('collectSuggestions', () => {
  it('groups by id with kind, excerpt, and metadata from the Y.Map', () => {
    const doc = para(schema.text('Hallo '), insertion('neu', 42));
    const ydoc = new Y.Doc();
    ydoc.getMap<SuggestionMeta>('suggestions').set('42', {
      userId: 'u1',
      name: 'Alice',
      color: '#00ff00',
      createdAt: 1000,
    });

    const found = collectSuggestions(doc, ydoc);
    expect(found).toHaveLength(1);
    expect(found[0].id).toBe(42);
    expect(found[0].kinds).toEqual(['insertion']);
    expect(found[0].excerpt).toBe('neu');
    expect(found[0].meta?.name).toBe('Alice');
  });

  it('returns null metadata for an unattributed suggestion', () => {
    const doc = para(insertion('x', 7));
    expect(collectSuggestions(doc, new Y.Doc())[0].meta).toBeNull();
  });

  it('ignores marks whose id is not a number (defensive guard)', () => {
    // The upstream mark spec validates id as number|string; our reader rejects
    // non-numeric ids so a stray string id never becomes a phantom suggestion.
    const strMark = schema.marks.insertion.create({ id: 'abc' });
    const doc = para(schema.text('x', [strMark]));
    expect(collectSuggestions(doc, new Y.Doc())).toHaveLength(0);
  });
});

describe('hasPendingSuggestions', () => {
  it('is true when a suggestion mark exists, false otherwise', () => {
    expect(hasPendingSuggestions(para(insertion('a', 1)))).toBe(true);
    expect(hasPendingSuggestions(para(schema.text('plain')))).toBe(false);
  });
});

describe('getSuggestionIdAtSelection', () => {
  it('finds the id when the cursor sits inside a suggestion', () => {
    const doc = para(schema.text('Hallo '), insertion('neu', 99));
    // "Hallo " = pos 1..7, "neu" = pos 7..10; put the cursor inside "neu".
    const state = EditorState.create({ doc });
    const withSel = state.apply(state.tr.setSelection(TextSelection.create(doc, 8)));
    expect(getSuggestionIdAtSelection(withSel)).toBe(99);
  });

  it('returns null when the cursor is in plain text', () => {
    const doc = para(schema.text('plain'));
    const state = EditorState.create({ doc });
    const withSel = state.apply(state.tr.setSelection(TextSelection.create(doc, 3)));
    expect(getSuggestionIdAtSelection(withSel)).toBeNull();
  });
});

describe('generateSuggestionId', () => {
  it('always yields a positive 31-bit integer (never 0)', () => {
    for (let i = 0; i < 2000; i++) {
      const id = generateSuggestionId();
      expect(Number.isInteger(id)).toBe(true);
      expect(id).toBeGreaterThanOrEqual(1);
      expect(id).toBeLessThan(0x7fffffff);
    }
  });
});

describe('suggestionMetaCount', () => {
  it('reflects the Y.Map size', () => {
    const ydoc = new Y.Doc();
    expect(suggestionMetaCount(ydoc)).toBe(0);
    ydoc.getMap('suggestions').set('1', {});
    ydoc.getMap('suggestions').set('2', {});
    expect(suggestionMetaCount(ydoc)).toBe(2);
  });
});
