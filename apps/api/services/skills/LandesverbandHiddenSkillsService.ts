import { and, eq } from 'drizzle-orm';

import { landesverbandHiddenSkills } from '../../database/schema/index.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';

/** Rezept `mention`s an LV-admin has hidden for their Landesverband only. */
export async function getHiddenSkillMentionsForLandesverband(
  landesverbandId: string
): Promise<string[]> {
  const db = getDrizzleInstance();
  const rows = await db
    .select({ skill_mention: landesverbandHiddenSkills.skill_mention })
    .from(landesverbandHiddenSkills)
    .where(eq(landesverbandHiddenSkills.landesverband_id, landesverbandId));
  return rows.map((r) => r.skill_mention);
}

export async function hideSkillForLandesverband(
  landesverbandId: string,
  mention: string,
  hiddenBy: string
): Promise<void> {
  const db = getDrizzleInstance();
  await db
    .insert(landesverbandHiddenSkills)
    .values({ landesverband_id: landesverbandId, skill_mention: mention, hidden_by: hiddenBy })
    .onConflictDoNothing({
      target: [landesverbandHiddenSkills.landesverband_id, landesverbandHiddenSkills.skill_mention],
    });
}

export async function unhideSkillForLandesverband(
  landesverbandId: string,
  mention: string
): Promise<void> {
  const db = getDrizzleInstance();
  await db
    .delete(landesverbandHiddenSkills)
    .where(
      and(
        eq(landesverbandHiddenSkills.landesverband_id, landesverbandId),
        eq(landesverbandHiddenSkills.skill_mention, mention)
      )
    );
}
