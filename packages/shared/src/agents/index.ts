export type {
  Agent,
  AgentAudience,
  AgentCategory,
  AgentLocalization,
  AgentParams,
  AgentProvider,
  FewShotExample,
  Skill,
  SkillCategory,
  SkillIcon,
  ToolRestrictions,
} from './types.js';
export { AGENT_CATEGORY_LABELS, SKILL_CATEGORY_LABELS } from './types.js';

export {
  isAgentVisibleForLocale,
  localizeAgent,
  getSystemAgentsForLocale,
  getVisibleSystemAgentsForLocale,
} from './audience.js';

export {
  SYSTEM_AGENTS,
  VISIBLE_SYSTEM_AGENTS,
  DEFAULT_SYSTEM_AGENT_ID,
  getSystemAgent,
  type SystemAgentId,
} from './system.js';

export { SKILLS, resolveSkillMention } from './skills/index.js';

export {
  USER_SELECTABLE_TOOLS,
  USER_SELECTABLE_TOOL_KEYS,
  DEFAULT_USER_AGENT_TOOLS,
  isUserSelectableTool,
  type UserSelectableTool,
} from './userTools.js';

export { getAgentSlug, resolveAgentSlug } from './slug.js';

export { LANDESVERBAENDE, type LandesverbandEntry } from './landesverbaende.js';

export {
  LV_HUBS,
  type LvHub,
  getLandesverbandHubBySlug,
  getLandesverbandHubs,
  getHubMemberAgentIds,
} from './landesverbandHubs.js';

export {
  DEFAULT_AGENT_ICON,
  SUGGESTED_AGENT_ICONS,
  isSuggestedAgentIcon,
  type SuggestedAgentIcon,
} from './agentIcons.js';

export {
  MCP_AGENTS,
  MCP_SOCIAL_MEDIA_VARIANTS,
  type McpAgent,
  type McpSocialMediaVariant,
} from './mcpProjection.js';
