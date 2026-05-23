import {
  DEFAULT_SYSTEM_AGENT_ID,
  SKILLS,
  getVisibleSystemAgentsForLocale,
  resolveSkillMention,
  type Skill,
  type SkillIcon,
} from '@gruenerator/shared/agents';
import { resolveSkillIcon } from './skillIcons';

export {
  SKILL_CATEGORY_LABELS,
  type Agent as AgentConfig,
  type Skill as AgentListItem,
  type SkillCategory,
} from '@gruenerator/shared/agents';

type ResolvedSkill = Skill & { icon: SkillIcon };

export const agentsList: ResolvedSkill[] = SKILLS.map((skill) => ({
  ...skill,
  icon: resolveSkillIcon(skill.iconKey),
}));

export function getDefaultAgent(): string {
  return DEFAULT_SYSTEM_AGENT_ID;
}

export interface PinnedAgent {
  identifier: string;
  title: string;
  iconKey?: string;
}

/**
 * Locale-aware pinned sidebar agents — mirrors the web sidebar's
 * `getDefaultAgentEntries`. Sourced from the system-agent definitions (not
 * `SKILLS`), since pinned agents like `gruenerator-ricarda-lang` only exist
 * there. Order follows the agent registry.
 */
export function getPinnedAgents(userLocale: string): PinnedAgent[] {
  return getVisibleSystemAgentsForLocale(userLocale)
    .filter((agent) => agent.pinnedToSidebar === true)
    .map((agent) => ({
      identifier: agent.identifier,
      title: agent.title,
      ...(agent.iconKey ? { iconKey: agent.iconKey } : {}),
    }));
}

export function resolveAgentMention(alias: string): string | null {
  return resolveSkillMention(alias);
}
