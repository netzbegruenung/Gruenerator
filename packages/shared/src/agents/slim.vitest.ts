import { describe, expect, it } from 'vitest';

import { getVisibleSystemAgentsForLocale } from './audienceCatalog.js';
import { SKILLS } from './skills/index.js';
import { SKILL_SLIMS, SLIM_AGENTS, getSlimAgent, getVisibleSlimAgentsForLocale } from './slim.js';
import { SYSTEM_AGENTS, getSystemAgent } from './system.js';

// The slim index is generated next to the full catalogue and read at web boot
// instead of it. These tests hold the two together: a field the slim index
// carries must read the same on both, and the resolution rules must not drift.
describe('slim agent index', () => {
  it('lists the same agents in the same order as SYSTEM_AGENTS', () => {
    expect(SLIM_AGENTS.map((a) => a.identifier)).toEqual(SYSTEM_AGENTS.map((a) => a.identifier));
  });

  it('carries the same boot fields as the full agent', () => {
    for (const agent of SYSTEM_AGENTS) {
      const slim = getSlimAgent(agent.identifier);
      expect(slim, agent.identifier).toBeDefined();
      expect(slim).toMatchObject({
        identifier: agent.identifier,
        title: agent.title,
        ...(agent.slug !== undefined && { slug: agent.slug }),
        ...(agent.iconKey !== undefined && { iconKey: agent.iconKey }),
        ...(agent.routeTo !== undefined && { routeTo: agent.routeTo }),
        ...(agent.pinnedToSidebar !== undefined && { pinnedToSidebar: agent.pinnedToSidebar }),
        ...(agent.webOnly !== undefined && { webOnly: agent.webOnly }),
        ...(agent.audience !== undefined && { audience: agent.audience }),
      });
      expect(slim?.hiddenFromInventory === true, agent.identifier).toBe(
        agent.hiddenFromInventory === true
      );
    }
  });

  it('resolves retired identifiers like getSystemAgent', () => {
    expect(getSlimAgent('gruenerator-kommunal')?.identifier).toBe(
      getSystemAgent('gruenerator-kommunal')?.identifier
    );
  });

  it.each(['de-DE', 'de-AT'])(
    'lists the same visible agents for %s as the full catalogue',
    (locale) => {
      const full = getVisibleSystemAgentsForLocale(locale).map((a) => [a.identifier, a.title]);
      const slim = getVisibleSlimAgentsForLocale(locale).map((a) => [a.identifier, a.title]);
      expect(slim).toEqual(full);
    }
  );
});

describe('slim skill index', () => {
  it('lists the same recipes in the same order as SKILLS', () => {
    expect(SKILL_SLIMS.map((s) => s.mention)).toEqual(SKILLS.map((s) => s.mention));
  });

  it('carries the same boot fields as the full recipe', () => {
    for (const skill of SKILLS) {
      const slim = SKILL_SLIMS.find((s) => s.mention === skill.mention);
      expect(slim).toMatchObject({
        identifier: skill.identifier,
        title: skill.title,
        iconKey: skill.iconKey,
      });
      expect(slim?.audience, skill.mention).toBe(skill.audience);
      expect(slim?.instances, skill.mention).toEqual(skill.instances);
      expect(slim?.modelOnly, skill.mention).toBe(skill.modelOnly);
      expect(slim?.skillCategory, skill.mention).toBe(skill.skillCategory);
    }
  });
});
