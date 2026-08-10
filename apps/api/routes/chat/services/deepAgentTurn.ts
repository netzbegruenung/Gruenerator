/**
 * The `@deepresearch` turn, agent edition — plans, delegates, reads pages, and
 * files the result as a real Grünerator document.
 *
 * It sits IN FRONT of `deepResearchTurn` rather than replacing it: every gate
 * here returns `null`, which drops the turn into the old one-shot Linkup path.
 * A user who asked for depth therefore always gets an answer, and the expensive
 * new machinery can be switched off at the flag without touching routing.
 *
 * Three properties differ from every other turn and drive the shape:
 *
 * 1. **It runs for minutes inside the open SSE stream.** The chat says so in
 *    plain text before anything else happens, and a heartbeat keeps the
 *    connection alive; progress goes to the artifact side panel as it arrives.
 * 2. **The answer is a document, not a message.** So there is no source registry
 *    to feed and no `[N]` to reconcile — the report carries its own numbered
 *    `## Quellen` list, and the chat message is a short summary plus the link.
 * 3. **The quota is charged only on success.** A run that produces nothing costs
 *    the user minutes; it must not also cost them their allowance.
 */

import { env } from '../../../config/env.js';
import { DeepResearchCounter } from '../../../services/counters/index.js';
import { createDocumentWithContent } from '../../../services/docs/DocGenerationService.js';
import { runDeepAgentResearch } from '../../../services/research/deepAgent/index.js';
import { DEFAULT_BUDGET } from '../../../services/research/deepAgent/types.js';
import { getLinkupService } from '../../../services/search/LinkupService.js';
import { createLogger } from '../../../utils/logger.js';

import { sendChatWarning } from './sseHelpers.js';

import type { SSEWriter } from './sseHelpers.js';
import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';
import type { ResearchStep } from '../../../services/research/deepAgent/types.js';
import type { ResearchLogStep } from '@gruenerator/contracts';

const log = createLogger('DeepAgentTurn');

/**
 * Runs per user per day.
 *
 * Three rather than the sourcedAnswer path's one: this agent never touches
 * Linkup's per-prompt research endpoint and caps `deep` searches at two, so a
 * run costs cents. Both paths share one Redis key, so the allowance cannot be
 * spent twice.
 */
const DAILY_LIMIT = 3;

/** The subtype a generated report is filed under. `docs` is the neutral one. */
const REPORT_SUBTYPE = 'docs';

let counter: DeepResearchCounter | null = null;
async function getCounter(): Promise<DeepResearchCounter> {
  if (!counter) {
    const { redisClient } = await import('../../../utils/redis/index.js');
    counter = new DeepResearchCounter(redisClient, DAILY_LIMIT);
  }
  return counter;
}

/** Test seam: the module-level counter would otherwise survive between cases. */
export function _resetDeepAgentCounterForTests(): void {
  counter = null;
}

function toLogSteps(steps: ResearchStep[]): ResearchLogStep[] {
  return steps.map((s) => ({ id: s.id, label: s.label, status: s.status }));
}

/**
 * What the caller does next.
 *
 * Three outcomes rather than `state | null`, because "I could not serve this"
 * and "nobody can serve this" need different follow-ups. Both engines behind
 * `@deepresearch` meter through ONE Redis key with different limits (agent 3,
 * `sourcedAnswer` 1). So once the agent's allowance is gone the count is at
 * least 3, which is also over the old path's limit of 1 — that path can never
 * succeed, and letting it try only produces a second, contradictory warning
 * naming the wrong number. `quota_spent` says so out loud.
 */
export type DeepAgentOutcome =
  | { kind: 'served'; state: Partial<ChatGraphState> }
  | { kind: 'quota_spent' }
  | { kind: 'not_served' };

const NOT_SERVED: DeepAgentOutcome = { kind: 'not_served' };

export async function runDeepAgentTurn(params: {
  state: ChatGraphState;
  sse: SSEWriter;
}): Promise<DeepAgentOutcome> {
  const { state, sse } = params;

  if (!env.DEEP_AGENT_RESEARCH_ENABLED) return NOT_SERVED;

  const question = state.searchQuery?.trim() ?? '';
  const userId = state.agentConfig?.userId ?? '';

  if (!env.SCALEWAY_API_KEY) {
    log.info('[DeepAgent] Kein SCALEWAY_API_KEY — der alte Pfad übernimmt');
    return NOT_SERVED;
  }
  // Linkup is the floor under the search tools: GreenPT is optional and refuses
  // under load, so without Linkup a run would spend minutes finding nothing.
  if (!getLinkupService()) {
    log.info('[DeepAgent] Kein LINKUP_API_KEY — der alte Pfad übernimmt');
    return NOT_SERVED;
  }
  if (question.length === 0) {
    log.warn('[DeepAgent] Keine Recherchefrage — der alte Pfad übernimmt');
    return NOT_SERVED;
  }
  // No user means no meter, and an unmetered multi-minute run is worse than a
  // cheaper answer.
  if (!userId) {
    log.warn('[DeepAgent] Keine userId — nicht abrechenbar, der alte Pfad übernimmt');
    return NOT_SERVED;
  }

  const quotaCounter = await getCounter();
  const quota = await quotaCounter.checkLimit(userId);
  if (!quota.canResearch) {
    log.info(`[DeepAgent] Kontingent aufgebraucht (${quota.count}/${quota.limit}) für ${userId}`);
    sendChatWarning(
      sse,
      'deep_research_quota_spent',
      `Die Tiefenrecherche ist für heute aufgebraucht (${quota.limit}× pro Tag, neu in ${quotaCounter.getTimeUntilReset()}). Ich habe stattdessen normal recherchiert.`
    );
    // Not `not_served`: the sibling engine shares this key with a LOWER limit,
    // so it is out of allowance too. Its warning would name a different number
    // and contradict the one just sent.
    return { kind: 'quota_spent' };
  }

  const logId = `research-${Date.now()}`;
  const locale = state.userLocale === 'de-AT' ? 'de-AT' : 'de-DE';
  const started = Date.now();

  // Said in the chat itself, not only as a progress event: this turn takes
  // minutes, and a silent stream reads as a hung request.
  sse.send('text_delta', {
    text: `Ich recherchiere jetzt gründlich zu „${question}". Das dauert einige Minuten — den Fortschritt siehst du nebenan, am Ende bekommst du einen Bericht als Dokument.\n\n`,
  });
  sse.send('research_log_start', { id: logId, title: `Recherche: ${question}` });

  let result;
  try {
    result = await runDeepAgentResearch({
      question,
      locale,
      signal: AbortSignal.timeout(DEFAULT_BUDGET.hardMs),
      ...(state.aiWorkerPool ? { aiWorkerPool: state.aiWorkerPool } : {}),
      progress: {
        onPlan: (steps) => sse.send('research_log_update', { id: logId, plan: toLogSteps(steps) }),
        onStep: (step) => sse.send('research_log_update', { id: logId, steps: toLogSteps([step]) }),
      },
    });
  } catch (error) {
    log.error(`[DeepAgent] Lauf fehlgeschlagen: ${String(error)}`);
    result = null;
  }

  if (!result) {
    sse.send('research_log_update', { id: logId, status: 'failed' });
    sendChatWarning(sse, 'deep_agent_failed');
    // Nothing was charged, so the old path still has whatever allowance the
    // shared key leaves it — let it try.
    return NOT_SERVED;
  }

  let document;
  try {
    document = await createDocumentWithContent(
      result.title,
      result.markdown,
      REPORT_SUBTYPE,
      userId
    );
  } catch (error) {
    // The research succeeded and only the filing failed — nothing to hand over,
    // so the quota stays free and the old path answers instead.
    log.error(`[DeepAgent] Dokument konnte nicht angelegt werden: ${String(error)}`);
    sse.send('research_log_update', { id: logId, status: 'failed' });
    sendChatWarning(sse, 'deep_agent_failed');
    return NOT_SERVED;
  }

  const url = `/office/${document.id}`;

  // Counted only now: a run without a document must not cost the allowance.
  // swallow-ok — the report exists either way, and losing it to a Redis hiccup
  // would be the worse trade.
  await quotaCounter.incrementCount(userId).catch((error: unknown) => {
    log.error(`[DeepAgent] Kontingent konnte nicht verbucht werden: ${String(error)}`);
  });

  sse.send('research_log_update', {
    id: logId,
    status: 'done',
    documentUrl: url,
    documentId: document.id,
  });
  sse.send('document_created', {
    documentId: document.id,
    title: result.title,
    subtype: REPORT_SUBTYPE,
    url,
  });

  log.info(
    `[DeepAgent] Bericht für ${userId}: ${result.markdown.length} Zeichen, ${result.sources.length} Quellen, ${Math.round((Date.now() - started) / 1000)}s${result.partial ? ' (Teilbericht)' : ''}`
  );

  const note = result.partial
    ? '\n\n_Hinweis: Die Recherche wurde vorzeitig beendet — der Bericht ist ein Zwischenstand._'
    : '';

  return {
    kind: 'served',
    state: {
      // Reuses the field the old path sets, so everything downstream already
      // knows "an answer exists, do not synthesise again".
      deepResearchAnswer: `${result.summary}${note}`,
      searchCount: result.sources.length,
      searchTimeMs: Date.now() - started,
    },
  };
}
