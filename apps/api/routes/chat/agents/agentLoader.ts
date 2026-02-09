/**
 * Agent Configuration Loader
 * Loads and caches agent configurations from JSON files
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { AgentConfig } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let agentsCache: AgentConfig[] | null = null;

const DEFAULT_AGENT = 'gruenerator-universal';

export async function loadAgents(): Promise<AgentConfig[]> {
  if (agentsCache) {
    return agentsCache;
  }

  const agentsDir = path.join(__dirname, '../../../data/chat-agents');
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
