import { describe, expect, it } from 'vitest';

import { isSkillOfferedIn, type SkillInstanceView } from './skillInstances.js';

const generic = (over: Partial<SkillInstanceView> = {}): SkillInstanceView => ({
  mention: 'presse',
  identifier: 'gruenerator-oeffentlichkeitsarbeit',
  skillCategory: 'presse',
  ...over,
});

describe('isSkillOfferedIn — positive scoping', () => {
  it('offers a recipe without an instance list everywhere', () => {
    expect(isSkillOfferedIn(generic(), 'production')).toBe(true);
    expect(isSkillOfferedIn(generic(), 'bgst')).toBe(true);
  });

  it('offers an instance-scoped recipe only there', () => {
    const bgstOnly = generic({ mention: 'bgst-etwas', instances: ['bgst'] });
    expect(isSkillOfferedIn(bgstOnly, 'bgst')).toBe(true);
    expect(isSkillOfferedIn(bgstOnly, 'production')).toBe(false);
    expect(isSkillOfferedIn(bgstOnly, 'beta')).toBe(false);
    expect(isSkillOfferedIn(bgstOnly, 'local')).toBe(false);
  });
});

describe('isSkillOfferedIn — instance deny', () => {
  it('drops a recipe the instance names', () => {
    const reel = generic({ mention: 'reel', skillCategory: 'social' });
    expect(isSkillOfferedIn(reel, 'bgst')).toBe(false);
    expect(isSkillOfferedIn(reel, 'production')).toBe(true);
  });

  it('keeps the rest of the same category', () => {
    const insta = generic({ mention: 'instagram', skillCategory: 'social' });
    expect(isSkillOfferedIn(insta, 'bgst')).toBe(true);
  });
});

describe('isSkillOfferedIn — owner cascade', () => {
  // This is the rule that makes hiding the Landesverband notebooks enough: not
  // one of the ~25 LV recipes is named anywhere, they fall because their agent
  // fell because its notebook fell.
  it('drops a Landesverband recipe wherever its notebook is not offered', () => {
    const bayern = generic({
      mention: 'presse-bayern-partei',
      identifier: 'gruenerator-oeffentlichkeitsarbeit-bayern',
    });
    expect(isSkillOfferedIn(bayern, 'bgst')).toBe(false);
    expect(isSkillOfferedIn(bayern, 'production')).toBe(true);
  });

  it('drops the Austrian recipes on bgst too', () => {
    const at = generic({
      mention: 'presse-at',
      identifier: 'gruenerator-oeffentlichkeitsarbeit-at',
    });
    expect(isSkillOfferedIn(at, 'bgst')).toBe(false);
  });
});
