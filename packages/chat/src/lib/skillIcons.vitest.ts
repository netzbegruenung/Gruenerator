import { SKILLS } from '@gruenerator/shared/agents';
import { describe, expect, it } from 'vitest';

import { SKILL_ICONS, fallbackSkillIcon, resolveSkillIcon } from './skillIcons';

/**
 * `iconKey` is a free string in the skill frontmatter and the codegen
 * (`packages/shared/scripts/build-skills.ts`) never checks it against a
 * registry — an unregistered key or a typo silently resolves to the generic
 * sparkle instead of failing. That is how `buergermail` shipped with
 * `PiEnvelopeSimple` unregistered and wore the fallback on every instance.
 *
 * The guard lives here rather than in the codegen because `SKILL_ICONS` sits in
 * @gruenerator/chat, which depends on @gruenerator/shared — not the other way
 * round.
 */
describe('every skill iconKey resolves to a real icon', () => {
  for (const skill of SKILLS) {
    it(`${skill.mention} → ${skill.iconKey}`, () => {
      expect(
        SKILL_ICONS[skill.iconKey],
        `iconKey "${skill.iconKey}" of skill "${skill.mention}" is not in SKILL_ICONS — ` +
          `export it from @gruenerator/shared/icons and add it to packages/chat/src/lib/skillIcons.ts`
      ).toBeDefined();
    });
  }
});

describe('resolveSkillIcon', () => {
  it('falls back for an unknown key', () => {
    expect(resolveSkillIcon('PiDefinitelyNotAnIcon')).toBe(fallbackSkillIcon);
  });
});
