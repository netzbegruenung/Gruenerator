import {
  addSuggestionMarks,
  suggestChanges,
  transformToSuggestionTransaction,
} from '@handlewithcare/prosemirror-suggest-changes';
import { Fragment, type Node as PMNode, Schema, Slice } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { AddMarkStep, ReplaceStep } from 'prosemirror-transform';
import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';

import {
  buildSuggestionDecorations,
  collectNewSuggestionIds,
  collectSuggestions,
  generateSuggestionId,
  getSuggestionIdAtSelection,
  hasPendingSuggestions,
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

describe('collectNewSuggestionIds', () => {
  it('collects the id of a deletion tracked as an AddMarkStep (empty position map)', () => {
    // Regression: deletions are marked, not removed, so their step has no changed
    // range — a range-based scan misses them and leaves them "Unbekannt".
    const doc = para(schema.text('hello'));
    const state = EditorState.create({ doc });
    const tr = state.tr.step(new AddMarkStep(1, 6, schema.marks.deletion.create({ id: 5 })));
    expect(collectNewSuggestionIds(new Y.Doc(), tr)).toEqual([5]);
  });

  it('collects the id of an insertion carried on the inserted slice', () => {
    const doc = para(schema.text('hello'));
    const state = EditorState.create({ doc });
    const marked = schema.text('X', [schema.marks.insertion.create({ id: 8 })]);
    const tr = state.tr.step(new ReplaceStep(1, 1, new Slice(Fragment.from(marked), 0, 0)));
    expect(collectNewSuggestionIds(new Y.Doc(), tr)).toEqual([8]);
  });

  it('skips ids already attributed', () => {
    const doc = para(schema.text('hello'));
    const state = EditorState.create({ doc });
    const ydoc = new Y.Doc();
    ydoc.getMap('suggestions').set('5', { userId: 'u', name: 'A', color: '#fff', createdAt: 0 });
    const tr = state.tr.step(new AddMarkStep(1, 6, schema.marks.deletion.create({ id: 5 })));
    expect(collectNewSuggestionIds(ydoc, tr)).toEqual([]);
  });

  // End-to-end against the REAL library transform (not hand-built steps), which
  // is the exact output the editor middleware runs on.
  it('collects the id from a real transformed DELETION', () => {
    const doc = para(schema.text('hello world'));
    const state = EditorState.create({ doc, plugins: [suggestChanges()] });
    const deleteTr = state.tr.delete(1, 6);
    const tracked = transformToSuggestionTransaction(deleteTr, state, () => 42);
    expect(collectNewSuggestionIds(new Y.Doc(), tracked)).toContain(42);
  });

  it('collects the id from a real transformed INSERTION', () => {
    const doc = para(schema.text('hello'));
    const state = EditorState.create({ doc, plugins: [suggestChanges()] });
    const insertTr = state.tr.insertText('X', 3);
    const tracked = transformToSuggestionTransaction(insertTr, state, () => 77);
    expect(collectNewSuggestionIds(new Y.Doc(), tracked)).toContain(77);
  });
});

describe('buildSuggestionDecorations', () => {
  const attributed = (id: number, color: string): Y.Doc => {
    const ydoc = new Y.Doc();
    ydoc.getMap<SuggestionMeta>('suggestions').set(String(id), {
      userId: 'u',
      name: 'A',
      color,
      createdAt: 0,
    });
    return ydoc;
  };

  it('tints an attributed suggestion with one inline decoration', () => {
    const doc = para(schema.text('Hallo '), insertion('neu', 42));
    expect(buildSuggestionDecorations(doc, attributed(42, '#FF6B6B')).find()).toHaveLength(1);
  });

  it('does not tint an unattributed suggestion', () => {
    const doc = para(schema.text('Hallo '), insertion('neu', 42));
    expect(buildSuggestionDecorations(doc, new Y.Doc()).find()).toHaveLength(0);
  });

  it('rejects an unsafe (non-hex) color before injecting it into a style', () => {
    const doc = para(schema.text('Hallo '), insertion('neu', 42));
    const ydoc = attributed(42, 'red; background:url(evil)');
    expect(buildSuggestionDecorations(doc, ydoc).find()).toHaveLength(0);
  });

  it('marks a whole-block insertion with a node decoration plus the inline tint', () => {
    const doc = para(insertion('all', 9));
    expect(buildSuggestionDecorations(doc, attributed(9, '#4ECDC4')).find()).toHaveLength(2);
  });
});
