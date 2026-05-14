import { SKILLS } from './skills/index.js';
import { SYSTEM_AGENTS } from './system.js';

import type { Agent, FewShotExample } from './types.js';

/**
 * MCP-specific agent projection. Strips runtime fields (model/provider/params)
 * that are irrelevant when MCP exposes agents as prompt templates to
 * external clients.
 */
export interface McpAgent {
  identifier: string;
  title: string;
  description: string;
  systemRole: string;
  avatar: string;
  tags: readonly string[];
  openingMessage: string;
  openingQuestions: readonly string[];
  enabledTools?: readonly string[];
  fewShotExamples?: readonly FewShotExample[];
}

function toMcpAgent(agent: Agent): McpAgent {
  const projection: McpAgent = {
    identifier: agent.identifier,
    title: agent.title,
    description: agent.description,
    systemRole: agent.systemRole,
    avatar: agent.avatar,
    tags: agent.tags,
    openingMessage: agent.openingMessage,
    openingQuestions: agent.openingQuestions,
  };
  if (agent.enabledTools) projection.enabledTools = agent.enabledTools;
  if (agent.fewShotExamples) projection.fewShotExamples = agent.fewShotExamples;
  return projection;
}

export const MCP_AGENTS: readonly McpAgent[] = SYSTEM_AGENTS.map(toMcpAgent);

/**
 * Platform variants of the öffentlichkeitsarbeit agent (Pressemitteilung,
 * Instagram, Facebook, …). Derived from the 1:N skills catalog.
 */
export interface McpSocialMediaVariant {
  platform: string;
  title: string;
  description: string;
}

export const MCP_SOCIAL_MEDIA_VARIANTS: readonly McpSocialMediaVariant[] = SKILLS.filter(
  (skill) => skill.identifier === 'gruenerator-oeffentlichkeitsarbeit'
).map((skill) => ({
  platform: skill.mention,
  title: skill.title,
  description: skill.description,
}));
