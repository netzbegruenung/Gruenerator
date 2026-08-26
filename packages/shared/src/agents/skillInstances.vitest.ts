import { describe, expect, it } from 'vitest';

import { type InstancePolicyView } from '../instances/index.js';

import { isSkillOfferedIn, skillPolicyOffers, type SkillInstanceView } from './skillInstances.js';

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

/**
 * Die `block`-Stufe ist die stärkere Aussage — was sie deckt, ist erst recht
 * nicht im Angebot. Sie war für Rezepte nie geprüft, weil die Registry keine
 * Instanz führt, die sie setzt: ein `block: { skillMentions: [...] }` wäre
 * schwächer gewesen als ein `hide` und das erst dem aufgefallen, der es einträgt.
 */
describe('skillPolicyOffers — beide Stufen', () => {
  const view = (over: Partial<InstancePolicyView> = {}): InstancePolicyView => ({
    channels: ['stable'],
    ...over,
  });

  it('bietet an, was keine Stufe deckt', () => {
    expect(skillPolicyOffers(generic(), view())).toBe(true);
  });

  it('lässt ein ausgeblendetes Rezept fallen', () => {
    expect(skillPolicyOffers(generic(), view({ hide: { skillMentions: ['presse'] } }))).toBe(false);
  });

  it('lässt ein gesperrtes Rezept ebenso fallen', () => {
    expect(skillPolicyOffers(generic(), view({ block: { skillMentions: ['presse'] } }))).toBe(
      false
    );
  });

  it('trägt die Kategorie-Regel auf beiden Stufen', () => {
    expect(skillPolicyOffers(generic(), view({ block: { skillCategories: ['presse'] } }))).toBe(
      false
    );
    expect(skillPolicyOffers(generic(), view({ block: { skillCategories: ['social'] } }))).toBe(
      true
    );
  });
});
