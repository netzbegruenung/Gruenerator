import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { toError } from '../../utils/errors/index.js';
import { createLogger } from '../../utils/logger.js';

import type { BriefingAgent } from './types.js';

const log = createLogger('SystemAgentLoader');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const AGENTS_DIR = path.join(__dirname, 'agents');

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

interface SystemAgentFile {
  id: string;
  name: string;
  description?: string;
  config: BriefingAgent['config'];
  schedule_type: BriefingAgent['schedule_type'];
  schedule_hour: number;
  schedule_timezone?: string;
  delivery_email: string;
}

let cachedAgents: BriefingAgent[] | null = null;

export function loadSystemAgents(): BriefingAgent[] {
  if (cachedAgents) return cachedAgents;

  const agents: BriefingAgent[] = [];

  if (!fs.existsSync(AGENTS_DIR)) {
    log.warn(`System agents directory not found: ${AGENTS_DIR}`);
    return agents;
  }

  const files = fs.readdirSync(AGENTS_DIR).filter((f) => f.endsWith('.json'));

  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(AGENTS_DIR, file), 'utf-8');
      const def = JSON.parse(raw) as SystemAgentFile;

      if (!def.id?.startsWith('system:')) {
        log.warn(`Skipping ${file}: id must start with "system:"`);
        continue;
      }

      agents.push({
        id: def.id,
        user_id: SYSTEM_USER_ID,
        name: def.name,
        description: def.description || null,
        is_active: true,
        config: def.config,
        schedule_type: def.schedule_type,
        schedule_hour: def.schedule_hour,
        schedule_timezone: def.schedule_timezone || 'Europe/Berlin',
        delivery_email: def.delivery_email,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_executed_at: null,
        execution_count: 0,
        consecutive_empty_count: 0,
      });
    } catch (error) {
      log.error(`Failed to load system agent ${file}: ${toError(error).message}`);
    }
  }

  log.info(`Loaded ${agents.length} system agents from ${AGENTS_DIR}`);
  cachedAgents = agents;
  return agents;
}

export function getSystemAgent(agentId: string): BriefingAgent | null {
  return loadSystemAgents().find((a) => a.id === agentId) || null;
}

export function isSystemAgent(agentId: string): boolean {
  return agentId.startsWith('system:');
}
