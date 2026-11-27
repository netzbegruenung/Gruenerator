import { describe, expect, it, vi } from 'vitest';

/**
 * Die wirksame Rezept-Ausblendung: Instanz, Landesverband und — seit die
 * Rezepte vor ihren Agents stehen (#6122) — die Rezepte jedes Agents, den ein
 * Admin ausgeblendet hat.
 */
const m = vi.hoisted(() => ({
  instance: [] as string[],
  lv: [] as string[],
  agents: [] as string[],
}));

vi.mock('../../database/services/DrizzleService.js', () => ({
  getDrizzleInstance: () => ({
    select: () => ({ from: async () => m.instance.map((skill_mention) => ({ skill_mention })) }),
  }),
}));
vi.mock('./LandesverbandHiddenSkillsService.js', () => ({
  getHiddenSkillMentionsForLandesverband: async () => m.lv,
}));
vi.mock('../agents/AdminHiddenAgentsService.js', () => ({
  getHiddenAgentIdentifiersCached: async () => m.agents,
}));

const { getEffectiveHiddenSkillMentions } = await import('./AdminHiddenSkillsService.js');

describe('getEffectiveHiddenSkillMentions', () => {
  it('unions instance, Landesverband and the recipes of hidden agents', async () => {
    m.instance = ['presse'];
    m.lv = ['insta-berlin'];
    m.agents = ['gruenerator-antrag'];
    expect([...(await getEffectiveHiddenSkillMentions('berlin'))].sort()).toEqual([
      'antrag',
      'insta-berlin',
      'presse',
    ]);
  });

  it('a hidden agent with several recipes hides all of them', async () => {
    m.instance = [];
    m.lv = [];
    m.agents = ['gruenerator-oeffentlichkeitsarbeit-bayern'];
    expect([...(await getEffectiveHiddenSkillMentions(null))].sort()).toEqual([
      'insta-bayern',
      'presse-bayern-fraktion',
      'presse-bayern-partei',
    ]);
  });

  it('hiding the default agent does not take the general recipes with it', async () => {
    m.instance = [];
    m.lv = [];
    m.agents = ['gruenerator-universal', 'gruenerator-ricarda-lang'];
    expect([...(await getEffectiveHiddenSkillMentions(null))]).toEqual([]);
  });
});
