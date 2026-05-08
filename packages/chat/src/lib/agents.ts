import {
  DEFAULT_SYSTEM_AGENT_ID,
  SKILLS,
  resolveSkillMention,
  type Skill,
} from '@gruenerator/shared/agents';

export {
  SKILL_CATEGORY_LABELS,
  type Agent as AgentConfig,
  type Skill as AgentListItem,
  type SkillCategory,
} from '@gruenerator/shared/agents';

export const agentsList: Skill[] = SKILLS.map((skill) => ({ ...skill }));

export function getDefaultAgent(): string {
  return DEFAULT_SYSTEM_AGENT_ID;
}

export function resolveAgentMention(alias: string): string | null {
  return resolveSkillMention(alias);
}
