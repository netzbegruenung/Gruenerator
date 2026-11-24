import {
  SKILL_SLIMS,
  isSkillOfferedIn,
  landesverbandAgentRole,
  type LvHub,
} from '@gruenerator/shared/agents';
import { type InstanceId } from '@gruenerator/shared/instances';

export interface LandesverbandRecipeLink {
  mention: string;
  title: string;
  iconKey: string;
  /** Öffnet den Chat mit dem Rezept — dasselbe wie `@<mention>` tippen. */
  path: string;
}

/**
 * Die Rezepte eines Landesverband-Hubs für die Seitenleiste, in Hub-Reihenfolge
 * ihrer Agenten. Dieselbe Auswahl wie `landesverbandHubGroups` auf der
 * Hub-Seite, aber aus der schlanken Registry (Boot).
 */
export function landesverbandRecipeLinks(
  hub: LvHub,
  instance: InstanceId
): LandesverbandRecipeLink[] {
  return hub.agentIds.flatMap((agentId) =>
    landesverbandAgentRole(agentId)
      ? SKILL_SLIMS.filter(
          (skill) => skill.identifier === agentId && isSkillOfferedIn(skill, instance)
        ).map((skill) => ({
          mention: skill.mention,
          title: skill.title,
          iconKey: skill.iconKey,
          path: `/chat?rezept=${skill.mention}`,
        }))
      : []
  );
}
