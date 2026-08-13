import { eq } from 'drizzle-orm';

import { adminHiddenSkills } from '../../database/schema/index.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';

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
 * Union of instance-wide hidden Rezepte and the ones the user's own
 * Landesverband has additionally hidden — the effective set used everywhere
 * discovery happens (chat/Agentura/PlusMenu). `landesverbandId === null`
 * (no LV assignment) skips the LV layer entirely.
 */
export async function getEffectiveHiddenSkillMentions(
  landesverbandId: string | null
): Promise<Set<string>> {
  const [instanceWide, lvScoped] = await Promise.all([
    getHiddenSkillMentions(),
    landesverbandId ? getHiddenSkillMentionsForLandesverband(landesverbandId) : Promise.resolve([]),
  ]);
  return new Set([...instanceWide, ...lvScoped]);
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
