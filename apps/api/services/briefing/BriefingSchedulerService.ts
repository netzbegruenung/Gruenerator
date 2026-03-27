import { toError } from '../../utils/errors/index.js';
import { createLogger } from '../../utils/logger.js';

import { getDueAgents } from './BriefingAgentService.js';
import { execute } from './BriefingExecutionService.js';
import { loadSystemAgents } from './SystemAgentLoader.js';

import type { BriefingAgent } from './types.js';

const log = createLogger('BriefingScheduler');

const CONCURRENCY = 3;

function isDue(agent: BriefingAgent): boolean {
  const now = new Date();
  const currentHour = parseInt(
    now.toLocaleString('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: agent.schedule_timezone,
    })
  );

  switch (agent.schedule_type) {
    case 'hourly':
      return true;
    case 'daily':
      return currentHour === agent.schedule_hour;
    case 'weekly':
      return currentHour === agent.schedule_hour && now.getDay() === 1; // Monday
    default:
      return false;
  }
}

function getDueSystemAgents(): BriefingAgent[] {
  return loadSystemAgents().filter(isDue);
}

export async function executeDueAgents(): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
  agents: Array<{ id: string; name: string; status: string }>;
}> {
  const dbAgents = await getDueAgents();
  const systemAgents = getDueSystemAgents();
  const allDue = [...systemAgents, ...dbAgents];

  if (allDue.length === 0) {
    log.info('No due agents found');
    return { processed: 0, succeeded: 0, failed: 0, agents: [] };
  }

  log.info(
    `Processing ${allDue.length} due agents (${systemAgents.length} system, ${dbAgents.length} user, concurrency: ${CONCURRENCY})`
  );

  const results: Array<{ id: string; name: string; status: string }> = [];
  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < allDue.length; i += CONCURRENCY) {
    const batch = allDue.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.allSettled(
      batch.map(async (agent) => {
        await execute(agent.id);
        return agent;
      })
    );

    for (let j = 0; j < batchResults.length; j++) {
      const result = batchResults[j];
      const agent = batch[j];
      if (result.status === 'fulfilled') {
        results.push({ id: agent.id, name: agent.name, status: 'ok' });
        succeeded++;
      } else {
        const msg = toError(result.reason).message;
        log.error(`Agent ${agent.id} (${agent.name}) failed: ${msg}`);
        results.push({ id: agent.id, name: agent.name, status: `error: ${msg}` });
        failed++;
      }
    }
  }

  log.info(`Done: ${succeeded} succeeded, ${failed} failed out of ${allDue.length}`);
  return { processed: allDue.length, succeeded, failed, agents: results };
}
