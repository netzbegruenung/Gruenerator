import { stickersForLocale } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { hasSystemRecipe } from '../agents/skills/index';
import { getSystemAgent } from '../agents/system';

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

describe('collectionContents of the Mustergrün showcase', () => {
  const contents = collectionContents('mustergruen-wahlkampf', 'de-DE')!;

  it('brings frames, stickers, backgrounds, Vorlagen and its agent', () => {
    expect(contents.frames.length).toBeGreaterThanOrEqual(1);
    expect(contents.stickers.length).toBeGreaterThanOrEqual(6);
    expect(contents.backgrounds.length).toBeGreaterThanOrEqual(4);
    expect(contents.sharepicVorlagen.length).toBeGreaterThanOrEqual(4);
    expect(contents.printVorlagen.length).toBeGreaterThanOrEqual(1);
    expect(contents.agents).toContainEqual({ kind: 'agent', ref: 'mustergruen-maxi-mustermensch' });
  });

  it('splits its frames from its stickers and keeps the frames out of the standard pickers', () => {
    expect(contents.frames.every((f) => 'frame' in f && f.frame === true)).toBe(true);
    const frameIds = new Set(contents.frames.map((f) => f.id));
    expect(contents.stickers.some((s) => frameIds.has(s.id))).toBe(false);
    expect(stickersForLocale('de-DE').some((s) => frameIds.has(s.id))).toBe(false);
  });

  it('is for Germany only', () => {
    expect(collectionContents('mustergruen-wahlkampf', 'de-AT')).toBeNull();
  });

  it('names the agent, the recipes and the Vorlagen that exist', () => {
    for (const t of contents.agents) {
      expect(
        t.kind === 'agent' ? getSystemAgent(t.ref) : hasSystemRecipe(t.ref),
        t.ref
      ).toBeTruthy();
    }
    const ids = [...contents.sharepicVorlagen, ...contents.printVorlagen];
    expect(ids.every((id) => /^mustergruen-maxi-[a-z0-9-]+$/.test(id) && id.length <= 64)).toBe(
      true
    );
    expect(new Set(ids).size).toBe(ids.length);
  });
});
