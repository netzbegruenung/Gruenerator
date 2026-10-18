import { describe, expect, it } from 'vitest';

import { isAdminVisibleAgent } from './agentVisibility.js';
import { getVisibleSystemAgentsForLocale, isAgentVisibleForPlatform } from './audience.js';
import { isLandesverbandIdentifier } from './landesverbaende.js';
import { isLvItemVisibleForRoles } from './landesverbandForRoles.js';
import { selectOfficialCatalog } from './officialCatalog.js';
import { isSkillOfferedIn } from './skillInstances.js';
import { SKILLS } from './skills/index.js';
import { isAdminVisibleSkill } from './skillVisibility.js';
import { getSystemAgent } from './system.js';

import type { InstanceId } from '../instances/index.js';
import type { Agent, Skill } from './types.js';

/** `agentsList` from @gruenerator/chat, minus the icon. */
const agentsList: readonly Skill[] = (SKILLS as readonly Skill[]).filter(
  (s) => getSystemAgent(s.identifier)?.hiddenFromInventory !== true
);

interface Inputs {
  locale: string;
  instanceId: InstanceId;
  hiddenAgentIds: readonly string[];
  hiddenSkillMentions: readonly string[];
  lvIds: readonly string[] | null;
}

/** Frozen copy of apps/web/src/features/agentura/hooks/useSystemCatalog.ts (no shared agents). */
function webToday(i: Inputs) {
  const allSkills = agentsList.filter(
    (s) =>
      (s.audience === undefined || s.audience === 'all' || s.audience === i.locale) &&
      isAdminVisibleSkill(s.mention, i.hiddenSkillMentions) &&
      isSkillOfferedIn(s, i.instanceId)
  );
  const systemAgents = getVisibleSystemAgentsForLocale(i.locale, i.instanceId).filter((a) =>
    isAdminVisibleAgent(a.identifier, i.hiddenAgentIds)
  );
  return {
    generalAgents: systemAgents.filter((a) => !isLandesverbandIdentifier(a.identifier)),
    lvAgents: systemAgents.filter(
      (a) =>
        isLandesverbandIdentifier(a.identifier) && isLvItemVisibleForRoles(a.identifier, i.lvIds)
    ),
    generalSkills: allSkills.filter((s) => !isLandesverbandIdentifier(s.identifier)),
    lvSkills: allSkills.filter(
      (s) =>
        isLandesverbandIdentifier(s.identifier) && isLvItemVisibleForRoles(s.identifier, i.lvIds)
    ),
  };
}

/** Frozen copy of apps/mobile/hooks/agents/useAgenturaCatalog.ts. */
function mobileToday(i: Inputs) {
  const systemAgents = getVisibleSystemAgentsForLocale(i.locale, i.instanceId).filter(
    (a) => isAgentVisibleForPlatform(a, 'mobile') && isLvItemVisibleForRoles(a.identifier, i.lvIds)
  );
  const skills = agentsList.filter((s) => {
    if (s.audience !== undefined && s.audience !== 'all' && s.audience !== i.locale) return false;
    if (!isAdminVisibleSkill(s.mention, i.hiddenSkillMentions)) return false;
    if (!isSkillOfferedIn(s, i.instanceId)) return false;
    if (!isLvItemVisibleForRoles(s.identifier, i.lvIds)) return false;
    const owner = getSystemAgent(s.identifier);
    return !owner || isAgentVisibleForPlatform(owner, 'mobile');
  });
  return {
    generalAgents: systemAgents.filter((a) => !isLandesverbandIdentifier(a.identifier)),
    lvAgents: systemAgents.filter((a) => isLandesverbandIdentifier(a.identifier)),
    generalSkills: skills.filter((s) => !isLandesverbandIdentifier(s.identifier)),
    lvSkills: skills.filter((s) => isLandesverbandIdentifier(s.identifier)),
  };
}

const ids = (c: {
  generalAgents: readonly Agent[];
  lvAgents: readonly Agent[];
  generalSkills: readonly Skill[];
  lvSkills: readonly Skill[];
}) => ({
  generalAgents: c.generalAgents.map((a) => a.identifier),
  lvAgents: c.lvAgents.map((a) => a.identifier),
  generalSkills: c.generalSkills.map((s) => s.mention),
  lvSkills: c.lvSkills.map((s) => s.mention),
});

const someAgent = getVisibleSystemAgentsForLocale('de-DE').find(
  (a) => !isLandesverbandIdentifier(a.identifier)
)!;
const someSkill = agentsList.find((s) => !isLandesverbandIdentifier(s.identifier))!;

const CASES: Inputs[] = [];
for (const locale of ['de-DE', 'de-AT']) {
  for (const instanceId of ['production', 'bgst', 'local'] as InstanceId[]) {
    for (const lvIds of [null, [], ['berlin', 'hessen'], ['oesterreich']]) {
      for (const hidden of [false, true]) {
        CASES.push({
          locale,
          instanceId,
          lvIds,
          hiddenAgentIds: hidden ? [someAgent.identifier] : [],
          hiddenSkillMentions: hidden ? [someSkill.mention.toLowerCase()] : [],
        });
      }
    }
  }
}

describe('selectOfficialCatalog — parity with the two catalogue hooks', () => {
  it.each(CASES)('web: %o', (i) => {
    expect(ids(selectOfficialCatalog({ ...i, platform: 'web' }))).toEqual(ids(webToday(i)));
  });

  it.each(CASES.filter((i) => i.hiddenAgentIds.length === 0))('mobile: %o', (i) => {
    expect(ids(selectOfficialCatalog({ ...i, platform: 'mobile' }))).toEqual(ids(mobileToday(i)));
  });
});

describe('selectOfficialCatalog — the union of both rule sets', () => {
  const base: Inputs = {
    locale: 'de-DE',
    instanceId: 'production',
    lvIds: null,
    hiddenAgentIds: [],
    hiddenSkillMentions: [],
  };

  it('applies the admin agent block on mobile too (mobile ignored it)', () => {
    const out = selectOfficialCatalog({
      ...base,
      platform: 'mobile',
      hiddenAgentIds: [someAgent.identifier],
    });
    expect(out.generalAgents.map((a) => a.identifier)).not.toContain(someAgent.identifier);
  });

  it('never offers a webOnly agent or its recipes on mobile', () => {
    const mobile = selectOfficialCatalog({ ...base, platform: 'mobile' });
    expect([...mobile.generalAgents, ...mobile.lvAgents].filter((a) => a.webOnly)).toEqual([]);
    expect(
      [...mobile.generalSkills, ...mobile.lvSkills].filter(
        (s) => getSystemAgent(s.identifier)?.webOnly === true
      )
    ).toEqual([]);
  });

  it('null roles let every Landesverband through, [] hides them all', () => {
    const unknown = selectOfficialCatalog({ ...base, platform: 'web', lvIds: null });
    const none = selectOfficialCatalog({ ...base, platform: 'web', lvIds: [] });
    expect(unknown.lvAgents.length + unknown.lvSkills.length).toBeGreaterThan(0);
    expect(none.lvAgents).toEqual([]);
    expect(none.lvSkills).toEqual([]);
  });

  it('returns the caller’s own skill objects', () => {
    const enriched = agentsList.map((s) => ({ ...s, badge: 'x' }));
    const out = selectOfficialCatalog({ ...base, platform: 'web', skills: enriched });
    expect(out.generalSkills[0]?.badge).toBe('x');
  });
});
