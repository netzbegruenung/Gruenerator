import {
  SKILLS,
  isSkillOfferedIn,
  landesverbandAgentRole,
  type LvHub,
  type Skill,
} from '@gruenerator/shared/agents';
import { type InstanceId } from '@gruenerator/shared/instances';

/** Ein Rezept des Landesverbands, so wie Hub und Seitenleiste es anbieten. */
export interface LandesverbandRecipeCard {
  mention: string;
  title: string;
  description: string;
  iconKey: string;
  avatar: string;
  backgroundColor: string;
  /** Öffnet den Chat mit dem Rezept — dasselbe wie `@<mention>` tippen. */
  path: string;
}

/** Die Rezepte eines LV-Agenten, unter seinem Rollenlabel („Öffentlichkeitsarbeit"). */
export interface LandesverbandHubGroup {
  agentId: string;
  role: string;
  recipes: LandesverbandRecipeCard[];
}

/**
 * Die Rezepte eines Landesverband-Hubs, gruppiert nach den Agenten, denen sie
 * gehören, in Hub-Reihenfolge. Eine Ableitung für Hub-Seite und Seitenleiste,
 * damit beide dieselben Rezepte mit denselben Labels zeigen.
 *
 * Seit 11/2026 stehen die Rezepte vorn, die LV-Agenten bleiben nur auflösbar
 * (alte Threads, Links, MCP). Jeder LV-Agent besitzt mindestens ein Rezept
 * (`lvRecipeMentions.vitest.ts`), eine Gruppe ohne Rezept fällt deshalb nur auf
 * einer Instanz weg, die die Rezepte nicht anbietet.
 */
export function landesverbandHubGroups(hub: LvHub, instance: InstanceId): LandesverbandHubGroup[] {
  const allSkills: readonly Skill[] = SKILLS;
  return hub.agentIds.flatMap((agentId) => {
    const role = landesverbandAgentRole(agentId);
    if (!role) return [];
    const recipes = allSkills
      .filter((skill) => skill.identifier === agentId && isSkillOfferedIn(skill, instance))
      .map((skill) => ({
        mention: skill.mention,
        title: skill.title,
        description: skill.description,
        iconKey: skill.iconKey,
        avatar: skill.avatar,
        backgroundColor: skill.backgroundColor,
        path: `/chat?rezept=${skill.mention}`,
      }));
    return recipes.length > 0 ? [{ agentId, role, recipes }] : [];
  });
}
