/**
 * Background poller that drains the agent_tasks queue.
 *
 * Started once per process from server.ts (startWorker). Each tick claims
 * claimable tasks one at a time (FOR UPDATE SKIP LOCKED → safe across cluster
 * workers). Two kinds of task:
 *  - AI-column flow tasks (flow_config set) → delegated to runFlow (source → AI →
 *    output nodes).
 *  - Legacy @-mention tasks → classify, generate (with live search/research tools),
 *    then answer in the comment thread or create a document; notify the requester.
 */
import { type CommentBlock } from '@gruenerator/contracts';

import { type AgentTask } from '../../database/schema/agentTasks.js';
import { createLogger } from '../../utils/logger.js';
import { getAIService } from '../ai/aiService.js';
import { INTERMEDIATE_MODEL } from '../ai/providers.js';
import { createDocumentWithContent } from '../docs/DocGenerationService.js';
import { createNotification } from '../notifications/NotificationService.js';

import { deriveTitle, generateFromState, prepareAgentState } from './agentFlow/generate.js';
import { runFlow } from './agentFlow/index.js';
import {
  claimNextAgentTask,
  completeAgentTask,
  failOrRetryAgentTask,
  postBotComment,
  updateBotComment,
} from './agentTaskService.js';
import { linkDocumentToCard } from './boardLinkService.js';
import { inheritBoardSharingToDocument } from './boardSharingService.js';

import type { SearchIntent } from '../../agents/langgraph/ChatGraph/index.js';

const log = createLogger('boardAgentWorker');

const POLL_INTERVAL_MS = 5_000;

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

// Safety net for the @-mention path: even when the classifier picks "comment",
// the model can return a long, structured answer. Comments render as plain text
// (no markdown), so a wall of text / raw markdown belongs in a document instead.
const COMMENT_MAX_CHARS = 1200;

function looksLongForm(content: string): boolean {
  if (content.length > COMMENT_MAX_CHARS) return true;
  // Markdown heading → clearly document-shaped, not a chat reply.
  if (/^\s{0,3}#{1,3}\s+\S/m.test(content)) return true;
  // Three or more paragraphs is past "a short comment".
  if (content.split(/\n\s*\n/).filter((p) => p.trim()).length >= 3) return true;
  return false;
}

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

  // Mention path: one in-thread comment that starts as "working…" and is updated in
  // place to the answer — so a quick reply never leaves a redundant ack + answer
  // pair. Flow tasks (Grünerator-Spalte) skip this; their feedback is the start
  // button + toast and the result is posted by the output nodes.
  let workingCommentId: string | null = null;
  const finishComment = async (blocks: CommentBlock[]): Promise<void> => {
    try {
      if (workingCommentId) {
        await updateBotComment(workingCommentId, blocks);
      } else {
        workingCommentId = await postBotComment({
          boardId: task.board_id,
          cardId: task.card_id,
          parentId: task.trigger_comment_id,
          blocks,
        });
      }
    } catch (e) {
      log.warn('Failed to post/update bot comment', { error: errMsg(e) });
    }
  };

  try {
    // Grünerator-Spalte tasks carry a flow config and run their own pipeline
    // (source → AI step → output nodes). The @-mention path continues below.
    if (task.flow_config) {
      await runFlow(task);
      log.info(`Agent task ${task.id} completed via Grünerator-Spalte flow`);
      return;
    }

    // Post the single "working" comment now; every result path updates it in place.
    workingCommentId = await postBotComment({
      boardId: task.board_id,
      cardId: task.card_id,
      parentId: task.trigger_comment_id,
      blocks: [{ type: 'text', text: '💭 Einen Moment, ich schaue mir das an …' }],
    }).catch((e: unknown) => {
      log.warn('Failed to post working comment', { error: errMsg(e) });
      return null;
    });

    const userLocale = task.locale === 'de-AT' ? 'de-AT' : 'de-DE';

    // Classify only — the model does its own retrieval via the search/research
    // tools during authoring. The classifier gives us the intent (for the
    // unsupported-artifact guard) and a locale/intent-aware system prompt.
    const prepared = await prepareAgentState(task.task_text, userLocale);
    const { finalState } = prepared;

    // The board agent only delivers text documents. For image/sharepic/chart
    // intents the graph would burn work producing an artifact we can't attach, so
    // answer with a short explanation and finish the task cleanly (no document).
    if (UNSUPPORTED_INTENTS.has(finalState.intent)) {
      await completeAgentTask(task.id, null);
      await finishComment([
        {
          type: 'text',
          text: 'Ich kann auf Boards aktuell nur Text-Dokumente erstellen (keine Bilder, Sharepics oder Diagramme). Formuliere die Aufgabe gerne als Textauftrag.',
        },
      ]);
      log.info(`Agent task ${task.id} completed without document (intent: ${finalState.intent})`);
      return;
    }

    // Decide the deliverable: a quick question is answered in the comment thread;
    // a "create a text" request becomes a document.
    const isDocument = (await classifyDeliverable(task.task_text)) === 'document';

    const content = await generateFromState(prepared, {
      longForm: isDocument,
      slotLabel: `board-agent-${task.id}`,
    });
    if (!content) {
      throw new Error('Der Agent lieferte kein Ergebnis');
    }

    // Deliver a created text artifact: spin up a document and reply with a link.
    const deliverAsDocument = async (): Promise<void> => {
      const title = deriveTitle(task.task_text, content);
      const doc = await createDocumentWithContent(title, content, 'blank', task.requested_by);
      const relativeUrl = `/docs/${doc.id}`;

      // Share the document with everyone who can access the board, and link it into
      // the originating card's "Dokumente" list. Both are best-effort (they log and
      // swallow) so the task still completes if one fails.
      await inheritBoardSharingToDocument(doc.id, task.board_id);
      await linkDocumentToCard(task.board_id, task.card_id, { id: doc.id, title });

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

      await finishComment([
        { type: 'text', text: '✅ Fertig! Dokument erstellt und mit der Karte verknüpft: ' },
        { type: 'link', text: title, url: relativeUrl },
      ]);

      log.info(`Agent task ${task.id} completed → document ${doc.id}`);
    };

    // Question → answer directly in the comment thread. But if the classifier
    // said "comment" yet the model produced a long, structured answer, the
    // plain-text thread would show a wall of raw markdown — promote it to a
    // document instead.
    if (!isDocument && looksLongForm(content)) {
      log.info(`Agent task ${task.id} classified as comment but long-form → promoting to document`);
    }

    if (!isDocument && !looksLongForm(content)) {
      await completeAgentTask(task.id, null);
      await finishComment([{ type: 'text', text: content }]);
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

    await deliverAsDocument();
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

      await finishComment([
        {
          type: 'text',
          text: `⚠️ Ich konnte die Aufgabe leider nicht abschließen (${message}). Bitte formuliere sie ggf. neu und erwähne mich erneut.`,
        },
      ]);
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

function errMsg(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
