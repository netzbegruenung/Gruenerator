/**
 * Die Beschreibung ist die einzige Auswahlgrundlage des Modells im
 * Rezeptkatalog — sie muss sagen, WAS das Rezept liefert und WANN es dran ist.
 */
import {
  SKILL_DESCRIPTION_MAX,
  SKILL_DESCRIPTION_MIN,
  skillFrontmatterSchema,
} from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { SKILLS } from './index';

describe('Rezept-Beschreibungen', () => {
  it('liegen im Schema-Rahmen', () => {
    for (const s of SKILLS) {
      expect(s.description.length, s.mention).toBeGreaterThanOrEqual(SKILL_DESCRIPTION_MIN);
      expect(s.description.length, s.mention).toBeLessThanOrEqual(SKILL_DESCRIPTION_MAX);
    }
  });

  it('nennen den Auslöser', () => {
    for (const s of SKILLS) {
      expect(
        s.description.includes('Nutzen, wenn') || s.description.includes('Nutzen statt'),
        s.mention
      ).toBe(true);
    }
  });

  it('sind paarweise verschieden', () => {
    const seen = new Set(SKILLS.map((s) => s.description));
    expect(seen.size).toBe(SKILLS.length);
  });

  it('das Schema lehnt eine Kurzbeschreibung ab', () => {
    expect(skillFrontmatterSchema.shape.description.safeParse('x').success).toBe(false);
  });
});
