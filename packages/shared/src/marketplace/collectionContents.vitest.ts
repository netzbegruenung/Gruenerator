import { describe, expect, it } from 'vitest';

import { collectionContents } from './frontpage';

describe('collectionContents', () => {
  it('returns null for an unknown id', () => {
    expect(collectionContents('abgeschafft' as never, 'de-DE')).toBeNull();
  });

  it('returns null for de-AT on a de-DE collection', () => {
    expect(collectionContents('gruene-jugend', 'de-AT')).toBeNull();
    expect(collectionContents('gruene-jugend', 'de-DE')).not.toBeNull();
  });

  it('splits frames from stickers', () => {
    const contents = collectionContents('gruene-jugend', 'de-DE')!;
    expect(contents.frames).toEqual([]);
    expect(contents.stickers.length).toBeGreaterThan(0);
    expect(contents.backgrounds.length).toBeGreaterThan(0);
    expect(contents.sharepicVorlagen).toEqual([]);
    expect(contents.printVorlagen).toEqual([]);
  });

  it('lists the pinned agents and recipes', () => {
    const contents = collectionContents('mustergruen-wahlkampf', 'de-DE')!;
    expect(contents.agents.length).toBeGreaterThan(0);
    expect(contents.agents.every((t) => t.kind === 'agent' || t.kind === 'recipe')).toBe(true);
  });
});
