import { type PresentationOperation } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { buildBlankDeckSlides } from '../lib/blankDeck.js';
import { getMetaMap, getSlidesArray, slideToYMap } from '../lib/ydocSchema.js';

import { applyPresentationOperations } from './applyPresentationOperations.js';

function seededDoc(): Y.Doc {
  const ydoc = new Y.Doc();
  const arr = getSlidesArray(ydoc);
  arr.insert(0, buildBlankDeckSlides().map(slideToYMap));
  return ydoc;
}

function titles(ydoc: Y.Doc): string[] {
  return getSlidesArray(ydoc)
    .toArray()
    .map((m) => String(m.get('title')));
}

describe('applyPresentationOperations', () => {
  it('adds a slide at a 1-based position', () => {
    const ydoc = seededDoc();
    const ops: PresentationOperation[] = [
      { type: 'add_slide', layout: 'content', title: 'Neu', body: '- x', at: 2 },
    ];
    const { applied, skipped } = applyPresentationOperations(ydoc, ops);
    expect(applied).toBe(1);
    expect(skipped).toHaveLength(0);
    expect(titles(ydoc)).toEqual(['Neue Präsentation', 'Neu', 'Folie 2']);
  });

  it('patches only the provided fields of update_slide', () => {
    const ydoc = seededDoc();
    applyPresentationOperations(ydoc, [{ type: 'update_slide', slide: 1, title: 'Geändert' }]);
    const first = getSlidesArray(ydoc).get(0);
    expect(first.get('title')).toBe('Geändert');
    // layout untouched
    expect(first.get('layout')).toBe('title');
  });

  it('skips ops that address a non-existent slide', () => {
    const ydoc = seededDoc();
    const { applied, skipped } = applyPresentationOperations(ydoc, [
      { type: 'delete_slide', slide: 99 },
    ]);
    expect(applied).toBe(0);
    expect(skipped[0]).toContain('99');
  });

  it('moves a slide by cloning (never re-inserting a live Y.Map)', () => {
    const ydoc = seededDoc();
    applyPresentationOperations(ydoc, [{ type: 'move_slide', from: 1, to: 2 }]);
    expect(titles(ydoc)).toEqual(['Folie 2', 'Neue Präsentation']);
  });

  it('sets the deck default transition', () => {
    const ydoc = seededDoc();
    applyPresentationOperations(ydoc, [{ type: 'set_deck_option', defaultTransition: 'fade' }]);
    expect(getMetaMap(ydoc).get('defaultTransition')).toBe('fade');
  });
});
