/**
 * Background poller that drains the agent_tasks queue.
 *
 * Started once per process from server.ts (startWorker). Each tick claims
 * claimable tasks one at a time (FOR UPDATE SKIP LOCKED → safe across cluster
 * workers), runs the existing headless ChatGraph, writes the result to a
 * collaborative document, then notifies the requester (in-app + push + email via
 * createNotification) and replies on the originating card as the bot.
 */
import { type ModelMessage } from 'ai';

import { runChatGraph } from '../../agents/langgraph/ChatGraph/index.js';
import { PRIMARY_URL } from '../../config/domains.js';
import { type AgentTask } from '../../database/schema/agentTasks.js';
import { createLogger } from '../../utils/logger.js';
import { getAIService } from '../ai/aiService.js';
import { createDocumentWithContent } from '../docs/DocGenerationService.js';
import { createNotification } from '../notifications/NotificationService.js';

import {
  claimNextAgentTask,
  completeAgentTask,
  failOrRetryAgentTask,
  postBotComment,
} from './agentTaskService.js';

const log = createLogger('boardAgentWorker');

const POLL_INTERVAL_MS = 5_000;

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

  // Acknowledge on the card on the first attempt only.
  if (task.attempts <= 1) {
    await postBotComment({
      boardId: task.board_id,
      cardId: task.card_id,
      parentId: task.trigger_comment_id,
      blocks: [
        {
          type: 'text',
          text: '🤖 Ich arbeite an deiner Aufgabe … du bekommst Bescheid, sobald das Dokument fertig ist.',
        },
      ],
    }).catch((err: unknown) => {
      log.warn(`Failed to post ack comment for task ${task.id}`, { error: errMsg(err) });
    });
  }

  try {
    const userLocale = task.locale === 'de-AT' ? 'de-AT' : 'de-DE';
    const messages: ModelMessage[] = [{ role: 'user', content: task.task_text }];

    const result = await runChatGraph({
      messages,
      agentId: '', // falsy → ChatGraph resolves the default universal agent
      enabledTools: { search: true, web: true, person: true, examples: true, research: true },
      aiWorkerPool: getAIService(),
      userLocale,
    });

    if (!result.success || !result.responseText.trim()) {
      throw new Error(result.error || 'Der Agent lieferte kein Ergebnis');
    }

    const title = deriveTitle(task.task_text, result.responseText);
    const doc = await createDocumentWithContent(
      title,
      result.responseText,
      'blank',
      task.requested_by
    );
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
