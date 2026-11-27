import { DEFAULT_SYSTEM_AGENT_ID, systemRecipeMentionsOf } from '@gruenerator/shared/agents';
import { eq } from 'drizzle-orm';

import { adminHiddenSkills } from '../../database/schema/index.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';
import { getHiddenAgentIdentifiersCached } from '../agents/AdminHiddenAgentsService.js';

import { getHiddenSkillMentionsForLandesverband } from './LandesverbandHiddenSkillsService.js';

/** Rezept `mention`s an admin has hidden from discovery on this deployment. */
export async function getHiddenSkillMentions(): Promise<string[]> {
  const db = getDrizzleInstance();
  const rows = await db
    .select({ skill_mention: adminHiddenSkills.skill_mention })
    .from(adminHiddenSkills);
  return rows.map((r) => r.skill_mention);
}

/**
 * Union of instance-wide hidden Rezepte, the ones the user's own
 * Landesverband has additionally hidden, and the recipes of every agent an
 * admin hid — the effective set used everywhere discovery happens
 * (chat/Agentura/PlusMenu/marketplace). `landesverbandId === null` (no LV
 * assignment) skips the LV layer entirely.
 *
 * The agent layer exists since recipes stand in front of their agents (11/2026,
 * #6122): hiding the agent alone would let it come back through its recipe.
 * The default agent is left out — it owns the general recipes, not a persona.
 */
export async function getEffectiveHiddenSkillMentions(
  landesverbandId: string | null
): Promise<Set<string>> {
  const [instanceWide, lvScoped, hiddenAgents] = await Promise.all([
    getHiddenSkillMentions(),
    landesverbandId ? getHiddenSkillMentionsForLandesverband(landesverbandId) : Promise.resolve([]),
    getHiddenAgentIdentifiersCached(),
  ]);
  const ofHiddenAgents = systemRecipeMentionsOf(
    hiddenAgents.filter((id) => id !== DEFAULT_SYSTEM_AGENT_ID)
  );
  return new Set([...instanceWide, ...lvScoped, ...ofHiddenAgents]);
}

export async function hideSkill(mention: string, hiddenBy: string): Promise<void> {
  const db = getDrizzleInstance();
  await db
    .insert(adminHiddenSkills)
    .values({ skill_mention: mention, hidden_by: hiddenBy })
    .onConflictDoNothing({ target: adminHiddenSkills.skill_mention });
}

export async function unhideSkill(mention: string): Promise<void> {
  const db = getDrizzleInstance();
  await db.delete(adminHiddenSkills).where(eq(adminHiddenSkills.skill_mention, mention));
}
