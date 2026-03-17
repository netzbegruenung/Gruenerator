import { Mistral } from '@mistralai/mistralai';

import { toError } from '../../utils/errors/index.js';
import { createLogger } from '../../utils/logger.js';

import {
  getAgentByIdInternal,
  createExecution,
  completeExecution,
  markExecuted,
  pauseAgent,
  getPreviousExecutionUrls,
} from './BriefingAgentService.js';
import { archiveBriefing } from './BriefingArchiveService.js';
import { deliverBriefing } from './BriefingDeliveryService.js';
import { collectAll } from './DataCollectorService.js';
import { isSystemAgent, getSystemAgent } from './SystemAgentLoader.js';

import type { BriefingAgent, CollectedItem } from './types.js';

const log = createLogger('BriefingExecution');

const AUTO_PAUSE_THRESHOLD = 7;
const EXECUTION_TIMEOUT_MS = 5 * 60 * 1000;

let mistralClient: Mistral | null = null;

function getMistralClient(): Mistral {
  if (!mistralClient) {
    mistralClient = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });
  }
  return mistralClient;
}

async function summarizeResults(agent: BriefingAgent, items: CollectedItem[]): Promise<string> {
  try {
    const formatPrompt: Record<string, string> = {
      summary: 'Erstelle eine zusammenhängende Zusammenfassung der wichtigsten Punkte.',
      list: 'Erstelle eine nummerierte Liste aller relevanten Ergebnisse mit jeweils 1-2 Sätzen.',
      digest:
        'Erstelle ein kategorisiertes Briefing mit thematischen Überschriften und Stichpunkten.',
    };

    const itemsText = items
      .slice(0, 15)
      .map(
        (item, i) =>
          `[${i + 1}] ${item.title}\nQuelle: ${item.source} (${item.url})\n${item.excerpt}`
      )
      .join('\n\n');

    const instruction =
      agent.config.customPrompt || formatPrompt[agent.config.outputFormat] || formatPrompt.summary;

    const result = await getMistralClient().chat.complete({
      model: 'mistral-small-latest',
      messages: [
        {
          role: 'system',
          content: 'Du bist ein Briefing-Assistent. Antworte auf Deutsch.',
        },
        {
          role: 'user',
          content: `Briefing-Agent: "${agent.name}"
Beschreibung: ${agent.description || 'Keine Beschreibung'}
Zeitraum: ${agent.config.timeRange === 'day' ? 'Heute' : 'Diese Woche'}

${instruction}

Ergebnisse (${items.length}):

${itemsText}`,
        },
      ],
      temperature: 0.3,
      maxTokens: 2000,
    });

    const content = result.choices?.[0]?.message?.content;
    return typeof content === 'string' ? content : 'Zusammenfassung konnte nicht erstellt werden.';
  } catch (error) {
    log.error(`Summarization failed for agent ${agent.id}: ${toError(error).message}`);
    return items
      .slice(0, 10)
      .map((item) => `\u2022 ${item.title} (${item.source})`)
      .join('\n');
  }
}

async function getRecipientEmail(agent: BriefingAgent): Promise<string | null> {
  if (agent.delivery_email) return agent.delivery_email;

  try {
    const { getPostgresInstance } = await import('../../database/services/PostgresService.js');
    const row = await getPostgresInstance().queryOne('SELECT email FROM profiles WHERE id = $1', [
      agent.user_id,
    ]);
    return (row?.email as string) || null;
  } catch {
    return null;
  }
}

export async function execute(agentId: string): Promise<void> {
  const agent = isSystemAgent(agentId)
    ? getSystemAgent(agentId)
    : await getAgentByIdInternal(agentId);
  if (!agent) {
    log.error(`Agent ${agentId} not found`);
    return;
  }

  const isSystem = isSystemAgent(agentId);

  // System agents don't have DB rows — skip execution tracking for them
  // but still log to briefing_executions for history
  const execution = isSystem ? null : await createExecution(agentId);

  try {
    // Collect with timeout (clear timer to avoid leak)
    let timer: ReturnType<typeof setTimeout>;
    const items = await Promise.race([
      collectAll(agent.config),
      new Promise<CollectedItem[]>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Collection timeout')), EXECUTION_TIMEOUT_MS);
      }),
    ]).finally(() => clearTimeout(timer!));

    // Deduplicate against previous execution (system agents skip dedup — no DB history)
    let newItems: CollectedItem[];
    if (isSystem) {
      newItems = items;
    } else {
      const previousUrls = await getPreviousExecutionUrls(agentId);
      newItems = items.filter((item) => !previousUrls.has(item.url));
    }

    if (newItems.length === 0) {
      if (execution) {
        await completeExecution(execution.id, 'empty', { results_count: 0 });
        await markExecuted(agentId, true);
      }
      log.info(`Agent ${agentId}: no new results`);
      return;
    }

    const summary = await summarizeResults(agent, newItems);

    const email = await getRecipientEmail(agent);
    if (email) {
      await deliverBriefing(agent, summary, newItems, email);
    } else {
      log.warn(`Agent ${agentId}: no delivery email found`);
    }

    await archiveBriefing(agent, summary, newItems);

    if (execution) {
      await completeExecution(execution.id, 'completed', {
        results_count: newItems.length,
        results_summary: summary,
        results_raw: newItems,
      });
      await markExecuted(agentId, false);
    }

    log.info(`Agent ${agentId}: delivered ${newItems.length} items`);
  } catch (error) {
    log.error(`Agent ${agentId} execution failed: ${toError(error).message}`);

    if (execution) {
      await completeExecution(execution.id, 'failed', {
        error_message: toError(error).message,
      });
      await markExecuted(agentId, true);
    }
  }
}
