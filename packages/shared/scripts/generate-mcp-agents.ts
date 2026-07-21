/**
 * Codegen: project the full agent registry down to the MCP-only fields and write
 * a standalone data module into the MCP server. Committing the projection lets
 * the MCP build without depending on @gruenerator/shared (which pulls in React
 * and the whole web agent registry).
 *
 * Regenerate after changing agent definitions:
 *   pnpm --filter @gruenerator/shared generate:mcp-agents
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MCP_AGENTS, MCP_SOCIAL_MEDIA_VARIANTS } from '../src/agents/mcpProjection.ts';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../../../services/mcp/src/prompts/agents.generated.ts');

const header = `/**
 * AUTO-GENERATED — do not edit by hand.
 *
 * Source of truth: packages/shared/src/agents/mcpProjection.ts (projected from the
 * full agent registry). Committed here so the MCP server builds without
 * @gruenerator/shared. Regenerate with:
 *   pnpm --filter @gruenerator/shared generate:mcp-agents
 */

export interface FewShotExample {
  input: string;
  output: string;
  reasoning?: string;
}

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

export interface McpSocialMediaVariant {
  platform: string;
  title: string;
  description: string;
}
`;

const body =
  `\nexport const MCP_AGENTS: readonly McpAgent[] = ${JSON.stringify(MCP_AGENTS, null, 2)};\n\n` +
  `export const MCP_SOCIAL_MEDIA_VARIANTS: readonly McpSocialMediaVariant[] = ${JSON.stringify(
    MCP_SOCIAL_MEDIA_VARIANTS,
    null,
    2
  )};\n`;

writeFileSync(out, header + body);
console.log(
  `[generate-mcp-agents] wrote ${MCP_AGENTS.length} agents + ${MCP_SOCIAL_MEDIA_VARIANTS.length} variants → ${out}`
);
