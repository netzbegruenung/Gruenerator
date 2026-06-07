/**
 * Background poller that drains the agent_tasks queue.
 *
 * Started once per process from server.ts (startWorker). Each tick claims
 * claimable tasks one at a time (FOR UPDATE SKIP LOCKED → safe across cluster
 * workers), classifies the request, generates a document (with live search/
 * research tools), writes it, then notifies the requester (in-app + push + email
 * via createNotification) and replies on the originating card as the bot.
 */
import { generateText, stepCountIs, type ModelMessage } from 'ai';

import {
  buildSystemMessage,
  classifierNode,
  initializeChatState,
} from '../../agents/langgraph/ChatGraph/index.js';
import { PRIMARY_URL } from '../../config/domains.js';
import { type AgentTask } from '../../database/schema/agentTasks.js';
import { createSearchTools } from '../../routes/chat/agents/searchTools.js';
import { resolveModel } from '../../routes/chat/services/responseStreamingService.js';
import { createLogger } from '../../utils/logger.js';
import { getAIService } from '../ai/aiService.js';
import { INTERMEDIATE_MODEL } from '../ai/providers.js';
import { createDocumentWithContent } from '../docs/DocGenerationService.js';
import { createNotification } from '../notifications/NotificationService.js';

import {
  claimNextAgentTask,
  completeAgentTask,
  failOrRetryAgentTask,
  postBotComment,
} from './agentTaskService.js';

import type { SearchIntent } from '../../agents/langgraph/ChatGraph/index.js';

const log = createLogger('boardAgentWorker');

const POLL_INTERVAL_MS = 5_000;

// Hard ceiling on a single generation so one hung model call can't stall the
// whole drain loop (which processes tasks sequentially).
const GENERATION_TIMEOUT_MS = 180_000;

// Documents can be long-form; never let a chat-tuned agent's small token budget
// truncate the result below this floor.
const MIN_DOCUMENT_TOKENS = 4000;

// Max model<->tool round-trips while authoring (search/research then write).
const MAX_TOOL_STEPS = 5;

// Decides whether a tagged comment wants a short answer (posted back as a comment)
// or a created text artifact (a document).
const DELIVERABLE_PROMPT = `Du entscheidest, wie der Grünerator auf eine Aufgabe in einem Board-Kommentar reagieren soll.

Antworte NUR mit einem JSON-Objekt: {"format":"comment"} ODER {"format":"document"}.

"comment" = der Nutzer stellt eine Frage oder will eine kurze Auskunft/Einschätzung, die als Antwort im Kommentar-Thread passt.
"document" = der Nutzer möchte, dass ein eigenständiger Text erstellt wird (z. B. Pressemitteilung, Rede, Antrag, Brief, Konzept oder längerer Entwurf; "schreib/erstelle/verfasse …").

Im Zweifel: eine Frage → "comment"; ein Auftrag, einen Text zu erstellen → "document".`;

// Intents that produce a non-text artifact (image/sharepic/chart) the board
// agent can't deliver as a document — answered with a short explanation instead.
const UNSUPPORTED_INTENTS = new Set<SearchIntent>(['image', 'image_edit', 'sharepic', 'chart']);

let intervalId: ReturnType<typeof setInterval> | null = null;
let initialized = false;
let draining = false;

export function startBoardAgentWorker(): void {
  if (initialized) return;
  intervalId = setInterval(() => {
    void drain();
  }, POLL_INTERVAL_MS);
  initialized = true;
  log.info('Board agent worker started (interval: 5s)');
}

export function stopBoardAgentWorker(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    initialized = false;
  }
}

/** Claim and process tasks until the queue is drained for this tick. */
async function drain(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    let task: AgentTask | null;
    while ((task = await claimNextAgentTask())) {
      await processTask(task);
    }
  } catch (err) {
    log.error(`Drain loop error: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    draining = false;
  }
}

async function processTask(task: AgentTask): Promise<void> {
  log.info(`Processing agent task ${task.id} (attempt ${task.attempts}/${task.max_attempts})`);

  // The "Übernehme." acknowledgement is posted at enqueue time (agentTaskService),
  // so the worker goes straight to producing the result.
  try {
    const userLocale = task.locale === 'de-AT' ? 'de-AT' : 'de-DE';
    const userMessage: ModelMessage = { role: 'user', content: task.task_text };

    // Classify only — the model does its own retrieval via the search/research
    // tools during authoring, so we skip the graph's search/rerank/qualityGate
    // stages to avoid double retrieval. The classifier still gives us the intent
    // (for the unsupported-artifact guard) and a locale/intent-aware system prompt.
    const initialState = await initializeChatState({
      messages: [userMessage],
      agentId: '', // falsy → ChatGraph resolves the default universal agent
      enabledTools: { search: true, web: true, person: true, examples: true, research: true },
      aiWorkerPool: getAIService(),
      userLocale,
    });
    const classification = await classifierNode(initialState);
    const finalState = { ...initialState, ...classification };
    if (finalState.error) {
      throw new Error(finalState.error);
    }

    // The board agent only delivers text documents. For image/sharepic/chart
    // intents the graph would burn work producing an artifact we can't attach, so
    // answer with a short explanation and finish the task cleanly (no document).
    if (UNSUPPORTED_INTENTS.has(finalState.intent)) {
      await completeAgentTask(task.id, null);
      await postBotComment({
        boardId: task.board_id,
        cardId: task.card_id,
        parentId: task.trigger_comment_id,
        blocks: [
          {
            type: 'text',
            text: 'Ich kann auf Boards aktuell nur Text-Dokumente erstellen (keine Bilder, Sharepics oder Diagramme). Formuliere die Aufgabe gerne als Textauftrag.',
          },
        ],
      }).catch((e: unknown) =>
        log.warn('Failed to post unsupported-intent comment', { error: errMsg(e) })
      );
      log.info(`Agent task ${task.id} completed without document (intent: ${finalState.intent})`);
      return;
    }

    // Decide the deliverable: a quick question is answered in the comment thread;
    // a "create a text" request becomes a document.
    const isDocument = (await classifyDeliverable(task.task_text)) === 'document';

    // Build the agent's system prompt (systemRole, locale, intent guidance), then
    // steer the format: a full document (overriding the universal agent's short
    // ANTWORT-REGELN), or a concise comment answer (where those rules fit as-is).
    const baseSystemMessage = await buildSystemMessage(finalState);
    const systemMessage = isDocument
      ? `${baseSystemMessage}

## DOKUMENT-MODUS (vorrangig)
Du erstellst ein eigenständiges, vollständiges Dokument — KEINE kurze Chat-Antwort. Die Längen- und Knappheitsregeln aus den ANTWORT-REGELN gelten hier NICHT. Schreibe so ausführlich und strukturiert, wie die Aufgabe es verlangt: mit aussagekräftiger Überschrift (#), sinnvollen Zwischenüberschriften und vollständig ausformulierten Absätzen.

Du hast Recherche-Tools (gruenerator_search, web_search, research, …). Nutze sie aktiv, um Fakten und grüne Positionen zu belegen, bevor du schreibst — verlasse dich nicht nur auf vorhandenen Kontext. Gib am Ende AUSSCHLIESSLICH den Dokumentinhalt als Markdown aus — keine Meta-Kommentare, keine Rückfragen.`
      : `${baseSystemMessage}

## KOMMENTAR-MODUS
Du antwortest direkt in einem Board-Kommentar-Thread. Antworte knapp und konkret auf die Frage (folge den ANTWORT-REGELN oben). Nutze bei Faktenbedarf zuerst die Recherche-Tools. Gib NUR die Antwort aus — keine Anrede, keine Meta-Kommentare, keine Überschrift.`;

    const { agentConfig } = finalState;
    // Resolve via the same path as the chat controller so overflow-lane slots and
    // provider fallback are handled; release any acquired slot afterwards.
    const resolution = await resolveModel(
      {
        provider: agentConfig.provider as string,
        model: agentConfig.model,
        ...(agentConfig.defaultModel != null && { defaultModel: agentConfig.defaultModel }),
      },
      undefined,
      `board-agent-${task.id}`,
      { intent: finalState.intent }
    );

    let generatedText: string;
    try {
      // Give the model live retrieval (search/research) while authoring, so it can
      // ground facts on demand rather than only from the graph's pre-fetched
      // context. toolChoice defaults to 'auto'; stepCountIs caps tool round-trips.
      const generated = await generateText({
        model: resolution.model,
        system: systemMessage,
        messages: [userMessage],
        tools: createSearchTools(agentConfig),
        stopWhen: stepCountIs(MAX_TOOL_STEPS),
        maxOutputTokens: isDocument
          ? Math.max(agentConfig.params.max_tokens, MIN_DOCUMENT_TOKENS)
          : agentConfig.params.max_tokens,
        temperature: agentConfig.params.temperature,
        abortSignal: AbortSignal.timeout(GENERATION_TIMEOUT_MS),
      });
      generatedText = generated.text;
    } finally {
      if (resolution.releaseSlot) await resolution.releaseSlot();
    }

    const content = generatedText.trim();
    if (!content) {
      throw new Error('Der Agent lieferte kein Ergebnis');
    }

    // Question → answer directly in the comment thread, no document.
    if (!isDocument) {
      await completeAgentTask(task.id, null);
      await postBotComment({
        boardId: task.board_id,
        cardId: task.card_id,
        parentId: task.trigger_comment_id,
        blocks: [{ type: 'text', text: content }],
      });
      await createNotification({
        userId: task.requested_by,
        type: 'agent_task_completed',
        title: 'Der Grünerator hat geantwortet',
        body: content.length > 140 ? content.slice(0, 139) + '…' : content,
        actionUrl: `/boards/${task.board_id}?card=${task.card_id}`,
        metadata: { boardId: task.board_id, cardId: task.card_id, taskId: task.id },
        groupKey: `agent-task-${task.id}`,
      });
      log.info(`Agent task ${task.id} answered in comment (no document)`);
      return;
    }

    const title = deriveTitle(task.task_text, content);
    const doc = await createDocumentWithContent(title, content, 'blank', task.requested_by);
    const relativeUrl = `/docs/${doc.id}`;

    await completeAgentTask(task.id, doc.id);

    // In-app + push + email (createNotification fans out per the user's prefs).
    await createNotification({
      userId: task.requested_by,
      type: 'agent_task_completed',
      title: `Dein Dokument ist fertig: ${title}`,
      body: 'Der Grünerator hat deine Aufgabe erledigt. Öffne das Dokument, um das Ergebnis zu sehen.',
      actionUrl: relativeUrl,
      metadata: {
        boardId: task.board_id,
        cardId: task.card_id,
        documentId: doc.id,
        taskId: task.id,
      },
      groupKey: `agent-task-${task.id}`,
    });

    await postBotComment({
      boardId: task.board_id,
      cardId: task.card_id,
      parentId: task.trigger_comment_id,
      blocks: [
        { type: 'text', text: '✅ Fertig! Ich habe ein Dokument erstellt: ' },
        { type: 'link', text: title, url: `${PRIMARY_URL}${relativeUrl}` },
      ],
    });

    log.info(`Agent task ${task.id} completed → document ${doc.id}`);
  } catch (err) {
    const message = errMsg(err);
    log.error(`Agent task ${task.id} failed: ${message}`);
    const { willRetry } = await failOrRetryAgentTask(task, message);

    if (!willRetry) {
      await createNotification({
        userId: task.requested_by,
        type: 'agent_task_failed',
        title: 'Aufgabe konnte nicht erledigt werden',
        body: 'Der Grünerator konnte deine Aufgabe leider nicht abschließen. Bitte versuche es erneut.',
        actionUrl: `/boards/${task.board_id}?card=${task.card_id}`,
        metadata: { boardId: task.board_id, cardId: task.card_id, taskId: task.id },
        groupKey: `agent-task-${task.id}`,
      }).catch((e: unknown) =>
        log.warn('Failed to post failure notification', { error: errMsg(e) })
      );

      await postBotComment({
        boardId: task.board_id,
        cardId: task.card_id,
        parentId: task.trigger_comment_id,
        blocks: [
          {
            type: 'text',
            text: `⚠️ Ich konnte die Aufgabe leider nicht abschließen (${message}). Bitte formuliere sie ggf. neu und erwähne mich erneut.`,
          },
        ],
      }).catch((e: unknown) => log.warn('Failed to post failure comment', { error: errMsg(e) }));
    }
  }
}

/**
 * Decide whether the tagged comment wants a short answer (posted back as a
 * comment) or a created document. Cheap intermediate-model call; defaults to
 * 'document' on any failure (preserves the prior always-a-document behaviour).
 */
async function classifyDeliverable(taskText: string): Promise<'comment' | 'document'> {
  try {
    const response = await getAIService().processRequest({
      type: 'chat_intent_classification',
      provider: INTERMEDIATE_MODEL.provider,
      systemPrompt: DELIVERABLE_PROMPT,
      messages: [{ role: 'user', content: taskText }],
      options: {
        model: INTERMEDIATE_MODEL.model,
        max_tokens: 20,
        temperature: 0,
        response_format: { type: 'json_object' },
      },
    });
    const match = (response.content || '').match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match?.[0] || '{}') as { format?: unknown };
    return parsed.format === 'comment' ? 'comment' : 'document';
  } catch (err) {
    log.warn('Deliverable classification failed, defaulting to document', { error: errMsg(err) });
    return 'document';
  }
}

/**
 * Derive a document title: prefer a leading heading from the generated content,
 * otherwise fall back to the (mention-stripped) task text.
 */
function deriveTitle(taskText: string, responseText: string): string {
  const mdHeading = responseText.match(/^\s{0,3}#{1,3}\s+(.+)$/m);
  const htmlHeading = responseText.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const heading = (mdHeading?.[1] ?? htmlHeading?.[1] ?? '').replace(/<[^>]+>/g, '').trim();
  if (heading) return heading.slice(0, 120);

  const cleaned = taskText.replace(/@\S+/g, '').replace(/\s+/g, ' ').trim();
  return cleaned.slice(0, 80) || 'Neues Dokument';
}

function errMsg(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
