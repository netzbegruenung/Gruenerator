/**
 * MCP agent data — thin re-export of the shared system-agent projection.
 *
 * The single source of truth is packages/shared/src/agents/system.ts (full
 * agents) projected via packages/shared/src/agents/mcpProjection.ts (MCP-only
 * fields). Keeping this file as a re-export preserves the MCP-internal import
 * surface (`AGENTS`, `SOCIAL_MEDIA_VARIANTS`, `McpAgentDefinition`) so callers
 * don't have to update.
 */

import {
  MCP_AGENTS,
  MCP_SOCIAL_MEDIA_VARIANTS,
  type McpAgent,
  type McpSocialMediaVariant,
} from '@gruenerator/shared/agents';

export type McpAgentDefinition = McpAgent;
export type SocialMediaVariant = McpSocialMediaVariant;

export const AGENTS: readonly McpAgentDefinition[] = MCP_AGENTS;
export const SOCIAL_MEDIA_VARIANTS: readonly SocialMediaVariant[] = MCP_SOCIAL_MEDIA_VARIANTS;
