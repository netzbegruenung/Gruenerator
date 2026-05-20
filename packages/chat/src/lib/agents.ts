import {
  DEFAULT_SYSTEM_AGENT_ID,
  SKILLS,
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

export function resolveAgentMention(alias: string): string | null {
  return resolveSkillMention(alias);
}
