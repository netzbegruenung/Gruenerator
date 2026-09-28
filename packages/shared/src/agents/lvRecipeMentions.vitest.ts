/**
 * Die LV-Agenten entstehen in TypeScript-Buildern, nicht aus `definitions/*.md`
 * — und nur die `.md`-Definitionen prüft `build-agents.ts` auf auflösbare
 * `defaultRecipeMention`s. Ein Tippfehler hier fiele erst zur Laufzeit auf, als
 * Agent ohne Rezept.
 */
import { describe, expect, it } from 'vitest';

import { LV_BUERGER_AGENTS } from './lvBuergerAgents.js';
import { LV_PR_AGENTS } from './lvPrAgents.js';
import { LV_SOURCE_AGENTS } from './lvSourceAgents.js';
import { LV_WPS_AGENTS } from './lvWahlpruefsteinAgents.js';
import { SKILLS } from './skills/index.js';

const MENTIONS = new Set<string>(SKILLS.map((s) => s.mention));

describe('LV-Agenten — defaultRecipeMention', () => {
  const agents = [...LV_PR_AGENTS, ...LV_BUERGER_AGENTS, ...LV_WPS_AGENTS, ...LV_SOURCE_AGENTS];

  it.each(agents.map((a) => [a.identifier, a.defaultRecipeMention] as const))(
    '%s → %s löst auf',
    (_id, mention) => {
      expect(mention).toBeDefined();
      expect(MENTIONS.has(mention as string)).toBe(true);
    }
  );

  it('jeder Ein-Rezept-LV-Agent lädt sein eigenes Rezept', () => {
    const allSkills: readonly { mention: string; identifier: string }[] = SKILLS;
    for (const agent of [...LV_BUERGER_AGENTS, ...LV_SOURCE_AGENTS]) {
      const skill = allSkills.find((s) => s.mention === agent.defaultRecipeMention);
      expect(skill?.identifier, agent.identifier).toBe(agent.identifier);
    }
  });
});
