/**
 * MCP agent data — thin re-export of the committed agent projection.
 *
 * The source of truth is packages/shared/src/agents/mcpProjection.ts, projected
 * into ./agents.generated.ts by `pnpm --filter @gruenerator/shared
 * generate:mcp-agents`. Importing the generated file (instead of
 * @gruenerator/shared/agents) lets the MCP server build without depending on
 * shared. Regenerate after changing agent definitions.
 */

import {
  MCP_AGENTS,
  MCP_SOCIAL_MEDIA_VARIANTS,
  type McpAgent,
  type McpSocialMediaVariant,
} from './agents.generated.js';

export type McpAgentDefinition = McpAgent;
export type SocialMediaVariant = McpSocialMediaVariant;

export const AGENTS: readonly McpAgentDefinition[] = MCP_AGENTS;
export const SOCIAL_MEDIA_VARIANTS: readonly SocialMediaVariant[] = MCP_SOCIAL_MEDIA_VARIANTS;
