/**
 * The retired-mention map is the F1 escape hatch: `presse-hessen` and its four
 * siblings were split into a Partei and a Fraktion recipe, but released mobile
 * binaries, persisted sidebar favourites and old threads keep sending the old
 * mention. If that stops resolving, those users silently lose the recipe and
 * the turn falls back to the agent's base role — a failure that looks like
 * "the model got worse", not like a broken lookup.
 *
 * So the cases worth holding: every retired mention points at a recipe that
 * actually exists, and live mentions pass through untouched.
 */
import { describe, expect, it } from 'vitest';

import { SKILLS, canonicalSkillMention, resolveSkillMention } from './index.js';

const RETIRED = [
  'presse-hessen',
  'presse-mv',
  'presse-bayern',
  'presse-sachsen-anhalt',
  'presse-berlin',
] as const;

describe('canonicalSkillMention', () => {
  it.each(RETIRED)('maps the retired %s onto a recipe that exists', (retired) => {
    const canonical = canonicalSkillMention(retired);

    expect(canonical).not.toBe(retired);
    expect(SKILLS.map((s) => s.mention)).toContain(canonical);
  });

  it('leaves a live mention alone', () => {
    expect(canonicalSkillMention('presse-hessen-fraktion')).toBe('presse-hessen-fraktion');
    expect(canonicalSkillMention('instagram')).toBe('instagram');
  });

  it('passes an unknown mention through rather than returning null', () => {
    expect(canonicalSkillMention('omveinladungen')).toBe('omveinladungen');
  });

  it('resolves a retired mention to its owning agent', () => {
    expect(resolveSkillMention('presse-hessen')).toBe('gruenerator-oeffentlichkeitsarbeit-hessen');
  });
});

describe('the Partei/Fraktion split', () => {
  it.each(['hessen', 'mv', 'bayern', 'sachsen-anhalt', 'berlin'])(
    '%s ships both levels under one owning agent',
    (lv) => {
      const pair = SKILLS.filter((s) => s.mention.startsWith(`presse-${lv}-`));

      expect(pair.map((s) => s.mention).sort()).toEqual([
        `presse-${lv}-fraktion`,
        `presse-${lv}-partei`,
      ]);
      expect(new Set(pair.map((s) => s.identifier)).size).toBe(1);
      // Both appear in the composer and in the model's catalogue; identical
      // descriptions would make the choice unguessable.
      expect(pair[0]?.description).not.toBe(pair[1]?.description);
    }
  );
});
