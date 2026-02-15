/**
 * Agent Configuration Loader
 * Loads and caches agent configurations from JSON files
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { getPostgresInstance } from '../../../database/services/PostgresService.js';
import { createLogger } from '../../../utils/logger.js';

import type { AgentConfig } from './types.js';

const log = createLogger('AgentLoader');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let agentsCache: AgentConfig[] | null = null;

const DEFAULT_AGENT = 'gruenerator-universal';

export async function loadAgents(): Promise<AgentConfig[]> {
  if (agentsCache) {
    return agentsCache;
  }

  const agentsDir = path.join(__dirname, '../../../static-data/chat-agents');
  const files = await fs.readdir(agentsDir);
  const jsonFiles = files.filter((file) => file.endsWith('.json'));

  const agents = await Promise.all(
    jsonFiles.map(async (file) => {
      const content = await fs.readFile(path.join(agentsDir, file), 'utf-8');
      return JSON.parse(content) as AgentConfig;
    })
  );

  agents.sort((a, b) => {
    if (a.identifier === DEFAULT_AGENT) return -1;
    if (b.identifier === DEFAULT_AGENT) return 1;
    return a.title.localeCompare(b.title, 'de');
  });

  agentsCache = agents;
  return agents;
}

export async function getAgent(identifier: string): Promise<AgentConfig | undefined> {
  const agents = await loadAgents();
  return agents.find((agent) => agent.identifier === identifier);
}

export function getDefaultAgentId(): string {
  return DEFAULT_AGENT;
}

export function clearAgentsCache(): void {
  agentsCache = null;
}

/**
 * Resolves an agent by identifier, falling back to user's custom prompts if not found
 * in the built-in agent JSON files. This allows custom prompts to be used as agents
 * in the chat via @mention.
 */
export async function getAgentOrCustomPrompt(
  identifier: string,
  userId: string
): Promise<AgentConfig | undefined> {
  const builtIn = await getAgent(identifier);
  if (builtIn) return builtIn;

  try {
    const postgres = getPostgresInstance();
    const results = await postgres.query(
      `SELECT cp.id, cp.name, cp.prompt, cp.slug
       FROM custom_prompts cp
       LEFT JOIN saved_prompts sp ON sp.prompt_id = cp.id AND sp.user_id = $2
       WHERE cp.id::text = $1 AND cp.is_active = true
         AND (cp.user_id = $2 OR cp.is_public = true OR sp.id IS NOT NULL)
       LIMIT 1`,
      [identifier, userId],
      { table: 'custom_prompts' }
    );

    if (!results || results.length === 0) return undefined;

    const customPrompt = results[0] as { id: string; name: string; prompt: string; slug: string };
    const defaultAgent = await getAgent(DEFAULT_AGENT);
    if (!defaultAgent) return undefined;

    log.info(`[AgentLoader] Resolved custom prompt "${customPrompt.name}" (${customPrompt.id}) as agent`);

    return {
      ...defaultAgent,
      identifier: customPrompt.id,
      title: customPrompt.name,
      systemRole: customPrompt.prompt,
    };
  } catch (error) {
    log.error('[AgentLoader] Error looking up custom prompt:', error);
    return undefined;
  }
}
