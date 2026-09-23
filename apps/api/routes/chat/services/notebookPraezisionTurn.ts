/**
 * Präzisionsmodus der Notebook-Seite: ein Turn im agentischen Loop statt in
 * der Notebook-RAG-Pipeline.
 *
 * Der Loop bekommt nur `notebook_quellen` (gepinnt als erster Aufruf, per
 * `toolAllowlist` als einziges Werkzeug), gesperrt auf die Notebooks der Seite
 * und nur lesend (`notebookScopeLock`). Kein Klassifikator, kein MCP, kein
 * `modelId` — die Loop-Lanes wählen selbst.
 *
 * Gegenüber der Seite verhält sich der Turn wie die RAG-Pipeline: dieselbe
 * Thread-Art, dieselbe Persistenz im Controller, und am Ende GENAU EINE
 * `completion` in Notebook-Form (`answer` für Web, `text` für den
 * Mobile-Parser, Zitate mit `index`). Die Loop-eigene `completion` (Zitat-
 * Klammer, Wiederholung) fängt `NotebookLoopSSE` ab — ihr Text steckt ohnehin
 * im Ergebnis des Loops.
 */
import {
  buildSystemMessage,
  initializeChatState,
} from '../../../agents/langgraph/ChatGraph/index.js';
import { withLangfuseTrace } from '../../../services/telemetry/langfuseTelemetry.js';
import { createLogger } from '../../../utils/logger.js';
import { getDefaultAgentId } from '../agents/agentLoader.js';
import { notebookForPrompt } from '../agents/notebookSourceTools.js';
import { formatStandingInstructions } from '../notebookStreamCore.js';

import { streamAgenticResponse } from './agenticLoop/agenticRespondService.js';
import { pruneMessages } from './contextPruningService.js';
import { resolveLaneContextFloor } from './laneContextFloor.js';
import { toNotebookCitations, toNotebookSources } from './notebookCitationMap.js';
import { normalizeNotebookHistory } from './notebookHistoryService.js';
import {
  PROGRESS_MESSAGES,
  SSEWriter,
  type SSEEventPayloads,
  type SSEEventType,
} from './sseHelpers.js';
import { createTurnDeadline } from './turnDeadline.js';

import type { AgenticResponseOutcome } from './agenticLoop/agenticRespondService.js';
import type { PersistedStep } from './agenticLoop/types.js';
import type { UserLocale } from '../../../agents/langgraph/ChatGraph/types.js';
import type {
  NotebookAnswerModeReason,
  NotebookCitation,
  NotebookSource,
} from '@gruenerator/contracts';
import type { ModelMessage } from 'ai';
import type { Request, Response } from 'express';

const log = createLogger('NotebookPraezision');

const TOOL = 'notebook_quellen';

/**
 * Der Writer, den der Loop bekommt: alles geht an den Writer der Seite, nur
 * die Loop-`completion` nicht — die Seite bekommt ihre eine, notebook-förmige
 * `completion` vom Turn.
 */
export class NotebookLoopSSE extends SSEWriter {
  private readonly inner: SSEWriter;

  constructor(res: Response, inner: SSEWriter) {
    super(res);
    this.inner = inner;
  }

  override send<T extends SSEEventType>(event: T, data: SSEEventPayloads[T]): void {
    if (event === 'completion') return;
    this.inner.send(event, data);
  }

  override sendRaw(event: string, data: unknown): void {
    if (event === 'completion') return;
    this.inner.sendRaw(event, data);
  }

  override setTextListener(fn?: (kind: 'delta' | 'completion', text: string) => void): void {
    this.inner.setTextListener(fn);
  }

  override end(): void {
    this.inner.end();
  }

  override isEnded(): boolean {
    return this.inner.isEnded();
  }
}

export interface NotebookPraezisionDeps {
  initializeChatState: typeof initializeChatState;
  buildSystemMessage: typeof buildSystemMessage;
  streamAgenticResponse: typeof streamAgenticResponse;
}

const defaultDeps: NotebookPraezisionDeps = {
  initializeChatState,
  buildSystemMessage,
  streamAgenticResponse,
};

export interface NotebookPraezisionParams {
  req: Request;
  res: Response;
  sse: SSEWriter;
  /** Wie im Request-Body: Verlauf plus aktuelle Frage als letzte Nutzernachricht. */
  messages: ModelMessage[];
  /** Die Notebooks der Seite — Auswahl UND Sperre des Werkzeugs. */
  collectionIds: string[];
  userId: string;
  userLocale: UserLocale;
  threadId: string | null;
  standingInstructions?: string[];
  answerModeReason: NotebookAnswerModeReason;
}

export interface NotebookPraezisionResult {
  answer: string;
  citations: NotebookCitation[];
  sources: NotebookSource[];
  question: string;
  traceId: string | null;
  /** Für `metadata.toolCalls` — ohne `textOffset`, die Seite legt Karten vor den Text. */
  steps: PersistedStep[];
  degraded: AgenticResponseOutcome['degraded'] | null;
}

function praezisionBlock(collectionIds: readonly string[], locale: UserLocale): string {
  const notebooks = collectionIds
    .map((id) => notebookForPrompt(id, locale))
    .filter((nb): nb is { id: string; name: string | null } => nb != null)
    .map((nb) => (nb.name ? `„${nb.name}" (notebookId ${nb.id})` : `notebookId ${nb.id}`))
    .join(', ');
  return `

## PRÄZISIONSMODUS (NOTEBOOK-SEITE)

Du beantwortest die Frage direkt aus den Quellen dieser Notebooks: ${notebooks}.
- Arbeite ausschließlich mit dem Werkzeug ${TOOL}; ohne notebookId gilt das erste Notebook der Liste.
- Belege jede Aussage aus den Quellen mit [N].
- Steht in einem Ergebnis exhaustive=false, wurde nicht alles gelesen — nenne eine Zahl daraus nie als Gesamtzahl.
- Hier wird nur gelesen: Quellen entfernen, verschieben, umbenennen oder anlegen geht in diesem Modus nicht. Sag das, wenn danach gefragt wird.
- Die Filter der Seite (ausgewählte Dokumente, Kategorien) gelten in diesem Modus nicht.`;
}

export async function runNotebookPraezisionTurn(
  params: NotebookPraezisionParams,
  deps: NotebookPraezisionDeps = defaultDeps
): Promise<NotebookPraezisionResult | null> {
  const { sse, messages, collectionIds, userId, userLocale, threadId } = params;

  const lastUser = messages.filter((m) => m.role === 'user').pop();
  if (!lastUser || typeof lastUser.content !== 'string' || !lastUser.content.trim()) {
    sse.send('error', {
      error: 'Die Anfrage enthielt keine Nutzernachricht.',
      code: 'invalid_request',
    });
    return null;
  }
  const question = lastUser.content;
  const t0 = Date.now();

  // Nur Rolle und Text: die Zitate früherer Antworten gehören zur RAG-Nummerierung
  // und zeigen im Loop auf nichts.
  const history: ModelMessage[] = normalizeNotebookHistory(
    messages.slice(0, messages.lastIndexOf(lastUser))
  ).map((m) => ({ role: m.role, content: m.content.replace(/\[cite:(\d+)\]/g, '[$1]') }));
  const loopMessages = pruneMessages(
    [...history, { role: 'user', content: question }],
    resolveLaneContextFloor(null) ?? undefined
  );

  const state = await deps.initializeChatState({
    messages: loopMessages,
    ...(threadId ? { threadId } : {}),
    agentId: getDefaultAgentId(),
    userId,
    enabledTools: {},
    notebookIds: collectionIds,
    userLocale,
  });
  state.agentConfig.userId = userId;
  state.intent = 'agentic';
  state.mentionPinnedTool = TOOL;
  state.notebookScopeLock = { ids: [...collectionIds], readOnly: true };
  state.lastUserTextNoMentions = question;

  const baseSystem = await deps.buildSystemMessage(state, { retrievalExpected: true });
  const systemMessage = `${baseSystem}${praezisionBlock(collectionIds, userLocale)}${formatStandingInstructions(params.standingInstructions)}`;

  const requestId = `notebook_praezision_${Date.now()}`;
  const deadline = createTurnDeadline(requestId);
  const clientGone = new AbortController();
  params.res.on('close', () => {
    if (!params.res.writableEnded) clientGone.abort();
  });

  let traceId: string | null = null;
  let outcome: AgenticResponseOutcome;
  try {
    outcome = await withLangfuseTrace(
      {
        name: 'notebook-praezision-turn',
        userId,
        ...(collectionIds[0] ? { sessionId: collectionIds[0] } : {}),
      },
      async (trace) => {
        traceId = trace.traceId ?? null;
        const result = await deps.streamAgenticResponse({
          finalState: state,
          systemMessage,
          messages: loopMessages,
          requestId,
          sse: new NotebookLoopSSE(params.res, sse),
          reqSignal: AbortSignal.any([deadline.signal, clientGone.signal]),
          threadId,
          disableMcp: true,
          toolAllowlist: [TOOL],
        });
        trace.update({ input: question, output: result.fullText });
        return result;
      }
    );
  } catch (err) {
    // streamAgenticResponse wirft nicht; was hier ankommt, stammt aus dem Aufbau.
    log.error('[NotebookPraezision] turn failed:', err);
    sse.send('error', {
      error: PROGRESS_MESSAGES.internalError,
      code: 'internal',
      retryable: true,
    });
    return null;
  } finally {
    deadline.clear();
  }

  const citations = toNotebookCitations(outcome.citations);
  const sources = toNotebookSources(citations);
  const steps = outcome.steps.map(({ textOffset: _offset, ...step }) => step);
  const degraded = outcome.degraded ?? null;

  sse.send('completion', {
    answer: outcome.fullText,
    text: outcome.fullText,
    citations,
    sources,
    allSources: [],
    metadata: {
      answerMode: 'praezision',
      answerModeReason: params.answerModeReason,
      citationsCount: citations.length,
      toolCallCount: steps.length,
      ...(degraded ? { degraded } : {}),
      ...(traceId ? { traceId } : {}),
    },
  });
  log.info(
    `[NotebookPraezision] ${steps.length} tool calls, ${citations.length} citations, ${outcome.fullText.length} chars, ${Date.now() - t0}ms${degraded ? ` (${degraded})` : ''}`
  );

  return { answer: outcome.fullText, citations, sources, question, traceId, steps, degraded };
}
