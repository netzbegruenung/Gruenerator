import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { createLogger } from '../../utils/logger.js';

import type {
  BriefingAgent,
  BriefingExecution,
  CreateAgentInput,
  UpdateAgentInput,
} from './types.js';

const log = createLogger('BriefingAgentService');

const MAX_AGENTS_PER_USER = 10;

function db() {
  return getPostgresInstance();
}

export async function createAgent(userId: string, input: CreateAgentInput): Promise<BriefingAgent> {
  const countResult = await db().query(
    'SELECT COUNT(*)::int as count FROM briefing_agents WHERE user_id = $1',
    [userId]
  );
  if ((countResult[0]?.count as number) >= MAX_AGENTS_PER_USER) {
    throw new Error(`Maximum of ${MAX_AGENTS_PER_USER} agents per user reached`);
  }

  const rows = await db().query(
    `INSERT INTO briefing_agents (user_id, name, description, config, schedule_type, schedule_hour, schedule_timezone, delivery_email)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      userId,
      input.name,
      input.description || null,
      JSON.stringify(input.config),
      input.schedule_type || 'daily',
      input.schedule_hour ?? 8,
      input.schedule_timezone || 'Europe/Berlin',
      input.delivery_email || null,
    ]
  );

  log.info(`Agent created: ${(rows[0] as any).id} for user ${userId}`);
  return rows[0] as unknown as BriefingAgent;
}

export async function getAgentsByUser(userId: string): Promise<BriefingAgent[]> {
  const rows = await db().query(
    'SELECT * FROM briefing_agents WHERE user_id = $1 ORDER BY created_at DESC',
    [userId]
  );
  return rows as unknown as BriefingAgent[];
}

export async function getAgentById(agentId: string, userId: string): Promise<BriefingAgent | null> {
  const row = await db().queryOne('SELECT * FROM briefing_agents WHERE id = $1 AND user_id = $2', [
    agentId,
    userId,
  ]);
  return (row as unknown as BriefingAgent) || null;
}

export async function getAgentByIdInternal(agentId: string): Promise<BriefingAgent | null> {
  const row = await db().queryOne('SELECT * FROM briefing_agents WHERE id = $1', [agentId]);
  return (row as unknown as BriefingAgent) || null;
}

export async function updateAgent(
  agentId: string,
  userId: string,
  input: UpdateAgentInput
): Promise<BriefingAgent | null> {
  const sets: string[] = [];
  const values: unknown[] = [];
  let paramIdx = 1;

  if (input.name !== undefined) {
    sets.push(`name = $${paramIdx++}`);
    values.push(input.name);
  }
  if (input.description !== undefined) {
    sets.push(`description = $${paramIdx++}`);
    values.push(input.description);
  }
  if (input.config !== undefined) {
    sets.push(`config = $${paramIdx++}`);
    values.push(JSON.stringify(input.config));
  }
  if (input.schedule_type !== undefined) {
    sets.push(`schedule_type = $${paramIdx++}`);
    values.push(input.schedule_type);
  }
  if (input.schedule_hour !== undefined) {
    sets.push(`schedule_hour = $${paramIdx++}`);
    values.push(input.schedule_hour);
  }
  if (input.schedule_timezone !== undefined) {
    sets.push(`schedule_timezone = $${paramIdx++}`);
    values.push(input.schedule_timezone);
  }
  if (input.delivery_email !== undefined) {
    sets.push(`delivery_email = $${paramIdx++}`);
    values.push(input.delivery_email);
  }

  if (sets.length === 0) return getAgentById(agentId, userId);

  values.push(agentId, userId);
  const rows = await db().query(
    `UPDATE briefing_agents SET ${sets.join(', ')} WHERE id = $${paramIdx++} AND user_id = $${paramIdx} RETURNING *`,
    values
  );

  return (rows[0] as unknown as BriefingAgent) || null;
}

export async function deleteAgent(agentId: string, userId: string): Promise<boolean> {
  const result = await db().exec('DELETE FROM briefing_agents WHERE id = $1 AND user_id = $2', [
    agentId,
    userId,
  ]);
  return result.changes > 0;
}

export async function toggleAgent(agentId: string, userId: string): Promise<BriefingAgent | null> {
  const rows = await db().query(
    `UPDATE briefing_agents SET is_active = NOT is_active WHERE id = $1 AND user_id = $2 RETURNING *`,
    [agentId, userId]
  );
  return (rows[0] as unknown as BriefingAgent) || null;
}

export async function getDueAgents(): Promise<BriefingAgent[]> {
  const rows = await db().query(
    `SELECT * FROM briefing_agents
     WHERE is_active = TRUE
       AND (
         (schedule_type = 'hourly' AND (last_executed_at IS NULL OR last_executed_at < NOW() - INTERVAL '55 minutes'))
         OR (schedule_type = 'daily' AND (last_executed_at IS NULL OR last_executed_at < NOW() - INTERVAL '23 hours')
             AND EXTRACT(HOUR FROM NOW() AT TIME ZONE schedule_timezone) = schedule_hour)
         OR (schedule_type = 'weekly' AND (last_executed_at IS NULL OR last_executed_at < NOW() - INTERVAL '6 days 23 hours'))
       )
     ORDER BY last_executed_at ASC NULLS FIRST
     LIMIT 10`
  );
  return rows as unknown as BriefingAgent[];
}

export async function markExecuted(agentId: string, isEmpty: boolean): Promise<void> {
  await db().exec(
    `UPDATE briefing_agents
     SET last_executed_at = NOW(), execution_count = execution_count + 1,
         consecutive_empty_count = CASE WHEN $2 THEN consecutive_empty_count + 1 ELSE 0 END
     WHERE id = $1`,
    [agentId, isEmpty]
  );
}

export async function pauseAgent(agentId: string): Promise<void> {
  await db().exec('UPDATE briefing_agents SET is_active = FALSE WHERE id = $1', [agentId]);
  log.info(`Agent ${agentId} auto-paused after consecutive empty results`);
}

export async function createExecution(agentId: string): Promise<BriefingExecution> {
  const rows = await db().query(
    `INSERT INTO briefing_executions (agent_id, status) VALUES ($1, 'running') RETURNING *`,
    [agentId]
  );
  return rows[0] as unknown as BriefingExecution;
}

export async function completeExecution(
  executionId: string,
  status: 'completed' | 'failed' | 'empty',
  data: {
    results_count?: number;
    results_summary?: string;
    results_raw?: unknown;
    error_message?: string;
  }
): Promise<void> {
  await db().exec(
    `UPDATE briefing_executions
     SET status = $2, results_count = $3, results_summary = $4, results_raw = $5,
         error_message = $6, completed_at = NOW(),
         duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000
     WHERE id = $1`,
    [
      executionId,
      status,
      data.results_count ?? 0,
      data.results_summary || null,
      data.results_raw ? JSON.stringify(data.results_raw) : null,
      data.error_message || null,
    ]
  );
}

export async function getExecutionHistory(
  agentId: string,
  limit = 10,
  offset = 0
): Promise<BriefingExecution[]> {
  const rows = await db().query(
    'SELECT * FROM briefing_executions WHERE agent_id = $1 ORDER BY started_at DESC LIMIT $2 OFFSET $3',
    [agentId, limit, offset]
  );
  return rows as unknown as BriefingExecution[];
}

export async function getPreviousExecutionUrls(agentId: string): Promise<Set<string>> {
  const rows = await db().query(
    `SELECT jsonb_array_elements(results_raw)->>'url' AS url
     FROM briefing_executions
     WHERE agent_id = $1 AND status = 'completed' AND results_raw IS NOT NULL
     ORDER BY started_at DESC LIMIT 1`,
    [agentId]
  );
  return new Set(rows.map((r) => r.url as string).filter(Boolean));
}
