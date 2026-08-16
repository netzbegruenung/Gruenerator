/**
 * The `@deepresearch` turn, agent edition — plans, delegates, reads pages, and
 * files the result as a real Grünerator document.
 *
 * It sits IN FRONT of `deepResearchTurn` rather than replacing it: every gate
 * here returns `null`, which drops the turn into the old one-shot Linkup path.
 * A user who asked for depth therefore always gets an answer. The remaining
 * gates are all things the run genuinely needs — a key, a question, a meterable
 * user — so this path is the default whenever it can actually run.
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
 *    the user minutes; it must not also cost them their allowance. Whether there
 *    IS an allowance is decided by the caller — see `deepResearchQuota.ts`.
 */

import { env } from '../../../config/env.js';
import { createDocumentWithContent } from '../../../services/docs/DocGenerationService.js';
import { runDeepAgentResearch } from '../../../services/research/deepAgent/index.js';
import { buildNotebookScope } from '../../../services/research/deepAgent/notebookScope.js';
import { recordRunDocument } from '../../../services/research/deepAgent/runRegistry.js';
import { DEFAULT_BUDGET } from '../../../services/research/deepAgent/types.js';
import { getLinkupService } from '../../../services/search/LinkupService.js';
import { createLogger } from '../../../utils/logger.js';

import { chargeDeepResearch } from './deepResearchQuota.js';
import { sendChatWarning } from './sseHelpers.js';

import type { SSEWriter } from './sseHelpers.js';
import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';
import type { ResearchStep } from '../../../services/research/deepAgent/types.js';
import type { ResearchLogStep } from '@gruenerator/contracts';

const log = createLogger('DeepAgentTurn');

/** The subtype a generated report is filed under. `docs` is the neutral one. */
const REPORT_SUBTYPE = 'docs';

/** Keep-alive spacing while the agent works. Well under any proxy idle timeout. */
const RESEARCH_HEARTBEAT_MS = 20_000;

function toLogSteps(steps: ResearchStep[]): ResearchLogStep[] {
  return steps.map((s) => ({ id: s.id, label: s.label, status: s.status }));
}

/**
 * Returns a state patch on success and `null` in every case where the turn
 * should fall through to the sourcedAnswer path — no key, no question, no
 * meterable user, or a failed run. The shared allowance is NOT one of those
 * cases: the caller settles it once for both engines before either starts.
 */
export async function runDeepAgentTurn(params: {
  state: ChatGraphState;
  sse: SSEWriter;
}): Promise<Partial<ChatGraphState> | null> {
  const { state, sse } = params;

  const question = state.searchQuery?.trim() ?? '';
  const userId = state.agentConfig?.userId ?? '';

  if (!env.SCALEWAY_API_KEY) {
    log.info('[DeepAgent] Kein SCALEWAY_API_KEY — der alte Pfad übernimmt');
    return null;
  }
  // Linkup is the floor under the search tools: GreenPT is optional and refuses
  // under load, so without Linkup a run would spend minutes finding nothing.
  if (!getLinkupService()) {
    log.info('[DeepAgent] Kein LINKUP_API_KEY — der alte Pfad übernimmt');
    return null;
  }
  if (question.length === 0) {
    log.warn('[DeepAgent] Keine Recherchefrage — der alte Pfad übernimmt');
    return null;
  }
  // No user means no meter, and an unmetered multi-minute run is worse than a
  // cheaper answer.
  if (!userId) {
    log.warn('[DeepAgent] Keine userId — nicht abrechenbar, der alte Pfad übernimmt');
    return null;
  }

  const logId = `research-${Date.now()}`;
  const locale = state.userLocale === 'de-AT' ? 'de-AT' : 'de-DE';
  const started = Date.now();

  // Said in the chat itself, not only as a progress event: this turn takes
  // minutes, and a silent stream reads as a hung request.
  sse.send('text_delta', {
    text: `Ich recherchiere jetzt gründlich zu „${question}". Das dauert zehn bis fünfzehn Minuten — den Fortschritt siehst du nebenan, am Ende bekommst du einen Bericht als Dokument.\n\n`,
  });
  sse.send('research_log_start', { id: logId, title: `Recherche: ${question}` });

  // The party corpora plus whatever notebooks this turn already had in hand.
  // Nothing is resolved here — the personal notebooks arrive as document ids the
  // controller already checked ownership for.
  const notebookScope = buildNotebookScope(state, locale, userId);

  // A quarter of an hour of open stream, and the quiet stretches inside it are
  // long: one model turn without a tool call, or the whole wrap-up leg, emits
  // no step at all. An empty `research_log_update` merges nothing into the
  // panel (every field but `id` is optional) and is here purely so neither the
  // proxy nor the client mistakes a working run for a hung one.
  const heartbeat = setInterval(
    () => sse.send('research_log_update', { id: logId }),
    RESEARCH_HEARTBEAT_MS
  );
  if (typeof heartbeat.unref === 'function') heartbeat.unref();

  let result;
  try {
    result = await runDeepAgentResearch({
      question,
      locale,
      // The last resort, not the research deadline: the agent owns `hardMs`
      // itself and needs `wrapUpMs` on top of it to still write the report.
      // Cutting at `hardMs` here is what turned a finished body of research
      // into a fragment on 11.08.2026.
      signal: AbortSignal.timeout(DEFAULT_BUDGET.hardMs + DEFAULT_BUDGET.wrapUpMs),
      ...(state.aiClient ? { aiClient: state.aiClient } : {}),
      ...(notebookScope ? { notebookScope } : {}),
      userId,
      progress: {
        onPlan: (steps) => sse.send('research_log_update', { id: logId, plan: toLogSteps(steps) }),
        onStep: (step) => sse.send('research_log_update', { id: logId, steps: toLogSteps([step]) }),
      },
    });
  } catch (error) {
    log.error(`[DeepAgent] Lauf fehlgeschlagen: ${String(error)}`);
    result = null;
  } finally {
    clearInterval(heartbeat);
  }

  if (!result) {
    sse.send('research_log_update', { id: logId, status: 'failed' });
    sendChatWarning(sse, 'deep_agent_failed');
    // Nothing was charged, so the old path still has whatever allowance the
    // shared key leaves it — let it try.
    return null;
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
    return null;
  }

  // Closes the loop for the registry: a finished run points at the document its
  // report became, so an operator looking at an old thread id lands on the
  // result instead of a bare row. Fails soft, like the rest of the registry.
  await recordRunDocument(result.threadId, document.id);

  const url = `/office/${document.id}`;

  // Counted only now: a run without a document must not cost the allowance.
  await chargeDeepResearch(userId);

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
    // Reuses the field the old path sets, so everything downstream already
    // knows "an answer exists, do not synthesise again".
    deepResearchAnswer: `${result.summary}${note}`,
    searchCount: result.sources.length,
    searchTimeMs: Date.now() - started,
  };
}
