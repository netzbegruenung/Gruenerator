/**
 * Background poller that drains the agent_tasks queue.
 *
 * Started once per process from server.ts (startWorker). Each tick claims
 * claimable tasks one at a time (FOR UPDATE SKIP LOCKED → safe across cluster
 * workers). Two kinds of task:
 *  - AI-column flow tasks (flow_config set) → delegated to runFlow (source → AI →
 *    output nodes).
 *  - Legacy @-mention tasks → classify, run the full agentic loop headless (with a
 *    result check + one repair round), then answer in the comment thread or
 *    create a document; notify the requester.
 */
import { randomUUID } from 'node:crypto';

import { type CommentBlock } from '@gruenerator/contracts';

import { type AgentTask } from '../../database/schema/agentTasks.js';
import { hasAiConsent } from '../../middleware/requireAiConsent.js';
import {
  runHeadlessAgenticTurn,
  type HeadlessTurnParams,
  type HeadlessTurnResult,
} from '../../routes/chat/services/agenticLoop/runHeadlessAgenticTurn.js';
import { createLogger } from '../../utils/logger.js';
import { runWithUsageContext } from '../../utils/usageContext.js';
import { aiText } from '../ai/generate.js';
import { type RunVerdict } from '../backgroundRuns/runVerifier.js';
import { needsHumanReview, runVerifiedTurn } from '../backgroundRuns/verifiedTurn.js';
import { createDocumentWithContent } from '../docs/DocGenerationService.js';
import { createNotification } from '../notifications/NotificationService.js';

import {
  createPresentationFromText,
  createSheetFromText,
  generateTaskList,
} from './agentFlow/artifactGen.js';
import { buildCardAgentContext } from './agentFlow/cardContext.js';
import { deriveTitle, prepareAgentState } from './agentFlow/generate.js';
import { runFlow } from './agentFlow/index.js';
import { agentTaskSubset } from './agentFlow/taskListParse.js';
import {
  BOARD_REPAIR_DEADLINE_MS,
  BOARD_TURN_DEADLINE_MS,
  type ChildAgentTask,
  cardTaskText,
  claimNextAgentTask,
  completeAgentTask,
  completeWithChildAgentTasks,
  failOrRetryAgentTask,
  failTasksBlockedByFailure,
  postBotComment,
  updateBotComment,
  sweepDeadAgentTasks,
  taskGraphContext,
} from './agentTaskService.js';
import { addRowsToBoardLive } from './boardLiveRowService.js';
import { resolveNewCardColumn } from './BoardService.js';
import { inheritBoardSharingToDocument } from './boardSharingService.js';
import { linkAgentDocumentToCard } from './cardDocumentService.js';

import type { SearchIntent } from '../../agents/langgraph/ChatGraph/index.js';

const log = createLogger('boardAgentWorker');

const POLL_INTERVAL_MS = 5_000;

/** What the tagged comment wants the agent to produce. */
type DeliverableKind = 'comment' | 'document' | 'sheet' | 'presentation' | 'tasks' | 'tasks_run';

// Decides how the Grünerator reacts to a tagged board comment: a short reply, a
// text document, a spreadsheet, a presentation, or new task cards on the board.
const DELIVERABLE_PROMPT = `Du entscheidest, wie der Grünerator auf eine Aufgabe in einem Board-Kommentar reagieren soll.

Antworte NUR mit einem JSON-Objekt: {"format":"comment"} ODER {"format":"document"} ODER {"format":"sheet"} ODER {"format":"presentation"} ODER {"format":"tasks"} ODER {"format":"tasks_run"}.

"comment" = der Nutzer stellt eine Frage oder will eine kurze Auskunft/Einschätzung, die als Antwort im Kommentar-Thread passt.
"document" = der Nutzer möchte einen eigenständigen Text (z. B. Pressemitteilung, Rede, Antrag, Brief, Konzept, längerer Entwurf; "schreib/erstelle/verfasse …").
"sheet" = der Nutzer bittet ausdrücklich um eine Tabelle / Spreadsheet / Kalkulation (Wörter wie "Tabelle", "Spreadsheet", "Liste als Tabelle", "Budget", "Übersicht in Spalten").
"presentation" = der Nutzer bittet ausdrücklich um eine Präsentation / Folien / Slides ("Präsentation", "Folien", "Slides", "Foliensatz").
"tasks" = der Nutzer möchte, dass neue Aufgaben/Karten im Board angelegt werden ("leg Aufgaben an", "zerlege das in To-Dos", "erstelle Karten für …", "unterteile die Aufgabe").
"tasks_run" = wie "tasks", UND der Nutzer verlangt ausdrücklich, dass der Grünerator die angelegten Aufgaben danach auch selbst bearbeitet ("zerlege das und erledige die Schritte", "leg Aufgaben an und arbeite sie ab").

Wähle "sheet" oder "presentation" NUR bei ausdrücklicher Bitte um dieses Format; sonst "document". Wähle "tasks_run" NUR, wenn das Selbst-Erledigen ausdrücklich verlangt ist; sonst "tasks". Im Zweifel: eine Frage → "comment"; ein Auftrag, einen Text zu erstellen → "document".`;

// Intents that produce a non-text artifact (image/sharepic/chart) the board
// agent can't deliver as a document — answered with a short explanation instead.
// Eine Aussage über diese FLÄCHE, nicht über die Intents: `social_post` und
// `artifact` tragen dieselbe Disposition und sind bewusst nicht dabei, weil sie
// als Text bzw. als Dokument ankommen.
const UNSUPPORTED_INTENTS: ReadonlySet<SearchIntent> = new Set([
  'image',
  'image_edit',
  'sharepic',
  'chart',
] as const satisfies readonly SearchIntent[]);

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

/** Eine Aufgabe ist endgültig gescheitert — vom catch UND vom Wächter genutzt. */
async function notifyAgentTaskFailed(task: AgentTask): Promise<void> {
  await createNotification({
    userId: task.requested_by,
    type: 'agent_task_failed',
    title: 'Aufgabe konnte nicht erledigt werden',
    body: 'Der Grünerator konnte deine Aufgabe leider nicht abschließen. Bitte versuche es erneut.',
    actionUrl: `/boards/${task.board_id}?card=${task.card_id}`,
    metadata: { boardId: task.board_id, cardId: task.card_id, taskId: task.id },
    groupKey: `agent-task-${task.id}`,
  }).catch((e: unknown) => log.warn('Failed to post failure notification', { error: errMsg(e) }));
}

/** Claim and process tasks until the queue is drained for this tick. */
async function drain(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    // ZUERST abräumen: eine Aufgabe, die den Prozess getötet hat, bekommt ihren
    // Endstatus sonst nie — der Übergang liegt im catch von processTask, den
    // genau dieser Absturz überspringt.
    for (const dead of await sweepDeadAgentTasks()) {
      log.warn(`Agent task ${dead.id} nach Absturz als fehlgeschlagen verbucht`);
      await notifyAgentTaskFailed(dead);
    }
    // Keine Benachrichtigung je Nachfolger: die Person hat schon die über den
    // gescheiterten Vorgänger bekommen; der Grund steht im Lauf jeder Karte.
    let cancelled: AgentTask[];
    while ((cancelled = await failTasksBlockedByFailure()).length > 0) {
      log.warn(
        `Agent task(s) ${cancelled.map((t) => t.id).join(', ')} abgebrochen: Vorgänger fehlgeschlagen`
      );
    }

    let task: AgentTask | null;
    while ((task = await claimNextAgentTask())) {
      // Siehe recurringTaskWorker: ohne Usage-Kontext bleibt der Verbrauch
      // eines Hintergrundlaufs unzugerechnet.
      const claimed = task;
      await runWithUsageContext(
        { req: { user: { id: claimed.requested_by } }, feature: 'boards' },
        () => processTask(claimed)
      );
    }
  } catch (err) {
    log.error(`Drain loop error: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    draining = false;
  }
}

async function processTask(task: AgentTask): Promise<void> {
  log.info(`Processing agent task ${task.id} (attempt ${task.attempts}/${task.max_attempts})`);

  // Art.-9-Einwilligung: der Worker hat keinen Request, `requireAiConsent` sieht
  // ihn nie — auch nicht die Läufe aus Zeitplänen. Endgültig scheitern statt
  // wiederholen: ein Retry ändert an der fehlenden Einwilligung nichts.
  // Keine Fehler-Benachrichtigung: deren „versuche es erneut" hilft hier nicht,
  // und ein Zeitplan feuerte sie sonst bei jedem Lauf.
  if (!(await hasAiConsent(task.requested_by))) {
    log.warn(`Agent task ${task.id} skipped: no AI consent`);
    await failOrRetryAgentTask({ ...task, attempts: task.max_attempts }, 'ai_consent_required');
    if (task.trigger_comment_id) {
      await postBotComment({
        boardId: task.board_id,
        cardId: task.card_id,
        parentId: task.trigger_comment_id,
        blocks: [
          {
            type: 'text',
            text: 'Für die KI-Funktionen fehlt deine Einwilligung nach Art. 9 DSGVO. Beim nächsten Öffnen des Grünerators kannst du sie erteilen.',
          },
        ],
      }).catch((e: unknown) => log.warn('Failed to post consent comment', { error: errMsg(e) }));
    }
    return;
  }

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

    // Gather the card's context (column + comments + linked-document contents) so the
    // agent doesn't work half-blind. Best-effort: undefined on any failure.
    const cardContext = await buildTaskContext(task);

    // Classify only — the model does its own retrieval via the search/research
    // tools during authoring. The classifier gives us the intent (for the
    // unsupported-artifact guard) and a locale/intent-aware system prompt. A picked
    // agent (task.agent_id) runs with its own persona/notebooks/tools; null → default.
    const prepared = await prepareAgentState(task.task_text, userLocale, {
      agentId: task.agent_id,
      userId: task.requested_by,
    });
    const { finalState } = prepared;

    // Decide the deliverable up front. Sheet/presentation/tasks are text-JSON
    // artifacts, so they bypass the image/sharepic/chart guard below.
    // A child of a decomposing run (#3549) works its card; splitting it again
    // would let one request fan out without bound.
    const classified = await classifyDeliverable(task.task_text);
    const deliverable =
      task.parent_task_id && (classified === 'tasks' || classified === 'tasks_run')
        ? 'document'
        : classified;
    const isStructured =
      deliverable === 'sheet' ||
      deliverable === 'presentation' ||
      deliverable === 'tasks' ||
      deliverable === 'tasks_run';

    // The board agent can't deliver image/sharepic/chart artifacts. For those
    // intents the graph would burn work producing something we can't attach, so
    // answer with a short explanation and finish cleanly (structured artifacts
    // are exempt — they are documents/cards, not media).
    if (!isStructured && UNSUPPORTED_INTENTS.has(finalState.intent)) {
      await completeAgentTask(task.id, null);
      await finishComment([
        {
          type: 'text',
          text: 'Ich kann auf Boards aktuell nur Text-Dokumente, Tabellen, Präsentationen und Aufgaben erstellen (keine Bilder, Sharepics oder Diagramme). Formuliere die Aufgabe gerne entsprechend.',
        },
      ]);
      log.info(`Agent task ${task.id} completed without document (intent: ${finalState.intent})`);
      return;
    }

    // Every path runs the full agentic loop headless (#3221) on the state the
    // classifier already produced.
    const turnParams: Omit<HeadlessTurnParams, 'longForm'> = {
      instruction: task.task_text,
      userId: task.requested_by,
      agentId: task.agent_id,
      userLocale,
      slotLabel: `board-agent-${task.id}`,
      deadlineMs: BOARD_TURN_DEADLINE_MS,
      prepared,
      ...(cardContext != null && { contextBlock: cardContext }),
    };

    // Research → prose. Structured artifacts always research first, then
    // structure the researched prose — the same split the chat compound loop
    // uses. Not checked: the checker would judge prose against a request for
    // a table/slides/cards and object to the format, not the content.
    const research = async (): Promise<string> => {
      const turn = await runHeadlessAgenticTurn({ ...turnParams, longForm: true });
      throwIfBroken(turn);
      return turn.degraded === 'none' ? turn.text : '';
    };

    if (deliverable === 'sheet' || deliverable === 'presentation') {
      const researched = await research();
      if (!researched) throw new Error('Der Agent lieferte kein Ergebnis');
      const artifact =
        deliverable === 'sheet'
          ? await createSheetFromText(researched, task.requested_by)
          : await createPresentationFromText(researched, task.requested_by);
      if (!artifact) throw new Error('Der Agent lieferte keine gültige Struktur');

      const kindLabel = deliverable === 'sheet' ? 'Tabelle' : 'Präsentation';
      await inheritBoardSharingToDocument(artifact.id, task.board_id);
      await linkAgentDocumentToCard(
        task.board_id,
        task.card_id,
        artifact.id,
        artifact.title,
        task.requested_by
      );
      await completeAgentTask(task.id, artifact.id);
      await createNotification({
        userId: task.requested_by,
        type: 'agent_task_completed',
        title: `Deine ${kindLabel} ist fertig: ${artifact.title}`,
        body: `Der Grünerator hat deine ${kindLabel} erstellt. Öffne sie, um das Ergebnis zu sehen.`,
        actionUrl: artifact.url,
        metadata: {
          boardId: task.board_id,
          cardId: task.card_id,
          documentId: artifact.id,
          taskId: task.id,
        },
        groupKey: `agent-task-${task.id}`,
      });
      await finishComment([
        { type: 'text', text: `✅ Fertig! ${kindLabel} erstellt und mit der Karte verknüpft: ` },
        { type: 'link', text: artifact.title, url: artifact.url },
      ]);
      log.info(`Agent task ${task.id} completed → ${deliverable} ${artifact.id}`);
      return;
    }

    if (deliverable === 'tasks' || deliverable === 'tasks_run') {
      const researched = await research();
      const tasks = await generateTaskList(researched || task.task_text);
      if (tasks.length === 0) throw new Error('Der Agent konnte keine Aufgaben ableiten');

      // Place new cards in the source card's column (fallback: first column).
      // Ids are chosen here so the children below can point at their cards.
      const statusId = await resolveNewCardColumn(task.board_id, task.card_id);
      const rows = tasks.map((t, i) => ({
        id: `row-${Date.now()}-${i}-${randomUUID().slice(0, 8)}`,
        title: t.title,
        status: statusId,
        ...(t.description != null && { description: t.description }),
        ...(t.dueDate != null && { dueDate: t.dueDate }),
      }));
      await addRowsToBoardLive(task.board_id, rows, task.requested_by);

      // tasks_run (#3549): the cards the Grünerator can do itself get their own
      // run; dependencies between them order the runs and carry results forward.
      const children: ChildAgentTask[] =
        deliverable === 'tasks_run'
          ? agentTaskSubset(tasks).map(({ index, dependsOn }) => ({
              cardId: rows[index].id,
              taskText: cardTaskText(tasks[index].title, tasks[index].description ?? null),
              dependsOn,
            }))
          : [];
      if (children.length > 0) {
        await completeWithChildAgentTasks(task, children);
      } else {
        await completeAgentTask(task.id, null);
      }

      const countLabel = tasks.length === 1 ? '1 Aufgabe' : `${tasks.length} Aufgaben`;
      const runLabel =
        deliverable !== 'tasks_run'
          ? ''
          : children.length === 0
            ? ' Keine davon kann ich selbst erledigen – sie brauchen Menschen.'
            : ` ${children.length === tasks.length ? 'Alle' : `${children.length} davon`} bearbeite ich jetzt selbst${
                children.some((c) => c.dependsOn.length > 0) ? ', aufeinander aufbauend' : ''
              }; die Ergebnisse landen auf den jeweiligen Karten.`;
      await createNotification({
        userId: task.requested_by,
        type: 'agent_task_completed',
        title: `${countLabel} angelegt`,
        body: `Der Grünerator hat ${countLabel} im Board erstellt.${runLabel}`,
        actionUrl: `/boards/${task.board_id}?card=${task.card_id}`,
        metadata: { boardId: task.board_id, cardId: task.card_id, taskId: task.id },
        groupKey: `agent-task-${task.id}`,
      });
      await finishComment([{ type: 'text', text: `✅ ${countLabel} angelegt.${runLabel}` }]);
      log.info(`Agent task ${task.id} created ${tasks.length} card(s)`);
      return;
    }

    // Text document / comment path.
    const isDocument = deliverable === 'document';

    const { turn, content, verdict } = await runVerifiedTurn(
      { ...turnParams, longForm: isDocument },
      { verifyInstruction: task.task_text, repairDeadlineMs: BOARD_REPAIR_DEADLINE_MS }
    );
    throwIfBroken(turn);
    if (!content) {
      throw new Error('Der Agent lieferte kein Ergebnis');
    }
    // Handoff: the result is delivered either way; a lingering objection is
    // said where the result lands, so a human looks before relying on it.
    const note = reviewNote(verdict);

    // Deliver a created text artifact: spin up a document and reply with a link.
    const deliverAsDocument = async (): Promise<void> => {
      const title = deriveTitle(task.task_text, content);
      const doc = await createDocumentWithContent(title, content, 'blank', task.requested_by);
      const relativeUrl = `/office/${doc.id}`;

      // Share the document with everyone who can access the board, and record it
      // in the card's "Grünerator-Dokumente" list (a reliable Postgres write; the
      // open card refetches live when the finish comment below bumps the card).
      // Best-effort: both log and swallow so the task still completes if one fails.
      await inheritBoardSharingToDocument(doc.id, task.board_id);
      await linkAgentDocumentToCard(task.board_id, task.card_id, doc.id, title, task.requested_by);

      await completeAgentTask(task.id, doc.id, verdict);

      // In-app + push + email (createNotification fans out per the user's prefs).
      await createNotification({
        userId: task.requested_by,
        type: 'agent_task_completed',
        title: `Dein Dokument ist fertig: ${title}`,
        body:
          note ??
          'Der Grünerator hat deine Aufgabe erledigt. Öffne das Dokument, um das Ergebnis zu sehen.',
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
        ...(note ? [{ type: 'text' as const, text: `\n\n${note}` }] : []),
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
      await completeAgentTask(task.id, null, verdict);
      await finishComment([{ type: 'text', text: note ? `${content}\n\n${note}` : content }]);
      await createNotification({
        userId: task.requested_by,
        type: 'agent_task_completed',
        title: 'Der Grünerator hat geantwortet',
        body: note ?? (content.length > 140 ? content.slice(0, 139) + '…' : content),
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
      await notifyAgentTaskFailed(task);

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
async function classifyDeliverable(taskText: string): Promise<DeliverableKind> {
  try {
    const content = await aiText({
      lane: 'chat_intent_classification',
      pinned: 'heavy',
      system: DELIVERABLE_PROMPT,
      prompt: taskText,
      maxOutputTokens: 20,
      temperature: 0,
      json: true,
    });
    const match = content.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match?.[0] || '{}') as { format?: unknown };
    const format = parsed.format;
    if (
      format === 'comment' ||
      format === 'sheet' ||
      format === 'presentation' ||
      format === 'tasks' ||
      format === 'tasks_run'
    ) {
      return format;
    }
    return 'document';
  } catch (err) {
    log.warn('Deliverable classification failed, defaulting to document', { error: errMsg(err) });
    return 'document';
  }
}

/**
 * The card's own context, plus — for a child of a decomposing run (#3549) — the
 * request it was split from and the context of each predecessor's card, which
 * carries its result comment and linked result document. That is how a later
 * step sees what an earlier one did. Kept out of task_text on purpose: the
 * deliverable classifier reads task_text and must see only the card's own ask.
 */
async function buildTaskContext(task: AgentTask): Promise<string | undefined> {
  const own = await buildCardAgentContext(task.board_id, task.card_id, task.requested_by);
  if (!task.parent_task_id) return own;
  const graph = await taskGraphContext(task);
  const predecessors = (
    await Promise.all(
      graph.predecessorCardIds.map((cardId) =>
        buildCardAgentContext(task.board_id, cardId, task.requested_by)
      )
    )
  ).filter((c): c is string => Boolean(c));
  const parts = [
    own,
    graph.parentTaskText &&
      `## Übergeordneter Auftrag, aus dem diese Karte entstand\n${graph.parentTaskText}`,
    predecessors.length > 0 &&
      `## Ergebnisse der vorausgehenden Aufgaben\n\n${predecessors.join('\n\n---\n\n')}`,
  ].filter((p): p is string => Boolean(p));
  return parts.length > 0 ? parts.join('\n\n') : undefined;
}

/**
 * The loop never throws; it replaces hard failures with apology text that must
 * not become a result. Throwing hands them to the retry/failure path below.
 */
function throwIfBroken(turn: HeadlessTurnResult): void {
  if (turn.degraded === 'aborted' || turn.degraded === 'failed') {
    throw new Error(turn.degradedReason ?? `agentic turn degraded: ${turn.degraded}`);
  }
}

/** The visible handoff for a result the check still objects to, or null. */
function reviewNote(verdict: RunVerdict | null): string | null {
  if (!needsHumanReview(verdict)) return null;
  return `⚠️ Die automatische Prüfung hat Zweifel am Ergebnis${
    verdict.hint ? ` („${verdict.hint}")` : ''
  }. Bitte sieh es dir genau an, bevor du dich darauf verlässt.`;
}

function errMsg(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
