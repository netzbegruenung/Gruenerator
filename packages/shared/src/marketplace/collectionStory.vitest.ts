import { type MarketplaceItem } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { ROBOT_ID_MAX, ROBOT_ID_MIN } from '../avatar/index.js';

import { type CollectionStoryBlock, resolveStory } from './collectionStory.js';
import {
  collectionForThema,
  MARKETPLACE_COLLECTIONS,
  type MarketplaceCollection,
} from './frontpage.js';

// Widened: the `as const` registry is a tuple of literal types, not all of which name `story`.
const COLLECTIONS: readonly MarketplaceCollection[] = MARKETPLACE_COLLECTIONS;

const entry = (kind: 'agent' | 'recipe' | 'template', ref: string) =>
  ({ key: `${kind}:${ref}`, kind, ref }) as MarketplaceItem;

const text: CollectionStoryBlock = { type: 'text', paragraphs: ['Warum.'] };

describe('resolveStory', () => {
  it('keeps the blocks of the viewer’s country and those for both', () => {
    const story: CollectionStoryBlock[] = [
      { type: 'claim', text: '16 Prozent', note: '', source: null, audience: 'de-DE' },
      { type: 'claim', text: '18 Prozent', note: '', source: null, audience: 'de-AT' },
      text,
    ];
    const at = resolveStory(story, [], 'de-AT').blocks;
    expect(at.map((b) => (b.type === 'claim' ? b.text : b.type))).toEqual(['18 Prozent', 'text']);
    const de = resolveStory(story, [], null).blocks;
    expect(de.map((b) => (b.type === 'claim' ? b.text : b.type))).toEqual(['16 Prozent', 'text']);
  });

  it('drops entries the viewer cannot see, and an empty block with the text before it', () => {
    const story: CollectionStoryBlock[] = [
      text,
      { type: 'items', display: 'rows', items: [{ kind: 'agent', ref: 'weg' }] },
      { type: 'quote', text: 'Q', by: 'B' },
      { type: 'text', paragraphs: ['Dazu:'] },
      {
        type: 'items',
        display: 'gallery',
        items: [
          { kind: 'template', ref: 'a' },
          { kind: 'template', ref: 'weg' },
        ],
      },
    ];
    const { blocks } = resolveStory(story, [entry('template', 'a')], null);
    expect(blocks.map((b) => b.type)).toEqual(['quote', 'text', 'items']);
    const gallery = blocks[2];
    expect(gallery?.type === 'items' && gallery.items.map((i) => i.ref)).toEqual(['a']);
  });

  it('joins texts that end up next to each other', () => {
    const story: CollectionStoryBlock[] = [
      { type: 'text', paragraphs: ['Eins.'] },
      { type: 'text', paragraphs: ['DE.'], audience: 'de-DE' },
      { type: 'text', paragraphs: ['AT.'], audience: 'de-AT' },
    ];
    expect(resolveStory(story, [], 'de-AT').blocks).toEqual([
      { type: 'text', paragraphs: ['Eins.', 'AT.'] },
    ]);
  });

  it('hands every entry no block shows to the end of the page', () => {
    const story: CollectionStoryBlock[] = [
      { type: 'example', item: { kind: 'agent', ref: 'a' }, prompt: 'p', answer: 'a' },
    ];
    const { rest } = resolveStory(story, [entry('agent', 'a'), entry('recipe', 'b')], null);
    expect(rest.map((i) => i.ref)).toEqual(['b']);
  });
});

describe('collection stories in the registry', () => {
  it('give every number a source', () => {
    for (const c of COLLECTIONS) {
      for (const block of c.story ?? []) {
        if (block.type === 'claim' && /\d/.test(block.text)) {
          expect(block.source, `${c.id}: „${block.text}“`).not.toBeNull();
        }
      }
    }
  });

  // The answer is set large: a long one turns into a wall of text.
  it('keep example answers short', () => {
    for (const c of COLLECTIONS) {
      for (const block of c.story ?? []) {
        if (block.type === 'example') {
          expect(block.answer.length, `${c.id}: ${block.answer}`).toBeLessThanOrEqual(200);
        }
      }
    }
  });

  it('only name Friends that exist', () => {
    for (const c of COLLECTIONS) {
      for (const block of c.story ?? []) {
        if (block.type !== 'friends') continue;
        for (const id of block.ids) {
          expect(id >= ROBOT_ID_MIN && id <= ROBOT_ID_MAX, `${c.id}: Friend ${id}`).toBe(true);
        }
      }
    }
  });

  it('only show entries the collection holds', () => {
    for (const c of COLLECTIONS) {
      const held = new Set([
        ...c.pinned.map((t) => `${t.kind}:${t.ref}`),
        ...(c.samples ?? []).map((i) => i.key),
      ]);
      for (const block of c.story ?? []) {
        const targets =
          block.type === 'items' ? block.items : block.type === 'example' ? [block.item] : [];
        for (const t of targets) {
          expect(held.has(`${t.kind}:${t.ref}`), `${c.id}: ${t.kind}:${t.ref}`).toBe(true);
        }
      }
    }
  });
});

describe('collectionForThema', () => {
  it('leads a themed Vorlage back to its listed collection', () => {
    expect(collectionForThema('queer')?.id).toBe('queer');
    expect(collectionForThema('frauen')?.id).toBe('gleichstellung');
    expect(collectionForThema('europa')?.id).toBe('europa');
  });
});
