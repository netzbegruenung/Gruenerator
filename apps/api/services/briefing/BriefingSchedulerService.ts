import { toError } from '../../utils/errors/index.js';
import { createLogger } from '../../utils/logger.js';

import { getDueAgents } from './BriefingAgentService.js';
import { execute } from './BriefingExecutionService.js';

const log = createLogger('BriefingScheduler');

const CONCURRENCY = 3;

export async function executeDueAgents(): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
  agents: Array<{ id: string; name: string; status: string }>;
}> {
  const dueAgents = await getDueAgents();

  if (dueAgents.length === 0) {
    log.info('No due agents found');
    return { processed: 0, succeeded: 0, failed: 0, agents: [] };
  }

  log.info(`Processing ${dueAgents.length} due agents (concurrency: ${CONCURRENCY})`);

  const results: Array<{ id: string; name: string; status: string }> = [];
  let succeeded = 0;
  let failed = 0;

  // Process in batches for controlled concurrency
  for (let i = 0; i < dueAgents.length; i += CONCURRENCY) {
    const batch = dueAgents.slice(i, i + CONCURRENCY);
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

  log.info(`Done: ${succeeded} succeeded, ${failed} failed out of ${dueAgents.length}`);
  return { processed: dueAgents.length, succeeded, failed, agents: results };
}
