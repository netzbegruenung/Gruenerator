/**
 * AI-column flow orchestrator: SOURCE → AI STEP → OUTPUT NODES.
 *
 * Called by boardAgentWorker for tasks that carry a flow_config. Throws on failure;
 * the worker's try/catch handles retry + the failure comment/notification (same as
 * the legacy @-mention path).
 */
import { type AgentTask } from '../../../database/schema/agentTasks.js';
import { createLogger } from '../../../utils/logger.js';
import { needsHumanReview, runVerifiedTurn } from '../../backgroundRuns/verifiedTurn.js';
import { createNotification } from '../../notifications/NotificationService.js';
import {
  BOARD_REPAIR_DEADLINE_MS,
  BOARD_TURN_DEADLINE_MS,
  completeAgentTask,
  parkTaskForReview,
} from '../agentTaskService.js';

import { deriveTitle } from './generate.js';
import { executeOutputs } from './outputs/index.js';
import { buildInstruction, wantsLongForm } from './presets.js';
import { resolveSourceText } from './sources/index.js';

const log = createLogger('boardFlow:runFlow');

export async function runFlow(task: AgentTask): Promise<void> {
  const flow = task.flow_config;
  if (!flow) throw new Error('runFlow called without flow_config');

  const userLocale = task.locale === 'de-AT' ? 'de-AT' : 'de-DE';

  // 1) Stage 1 — source (the only slow I/O: scrape / Apify).
  const sourceText = await resolveSourceText(flow.source, flow.cardContext);

  // 2) Build the instruction and append any source data as context.
  const instruction = buildInstruction(flow.task, flow.cardContext);
  const effectivePrompt = sourceText
    ? `${instruction}\n\n--- QUELLDATEN ---\n${sourceText}`
    : instruction;

  // 3) Stage 2 — AI step: the full agentic loop, checked against the task
  //    (not the source data — the checker never sees sources), with at most
  //    one repair round.
  const { turn, content, verdict } = await runVerifiedTurn(
    {
      instruction: effectivePrompt,
      userId: task.requested_by,
      userLocale,
      longForm: wantsLongForm(flow.outputs),
      slotLabel: `board-flow-${task.id}`,
      deadlineMs: BOARD_TURN_DEADLINE_MS,
    },
    { verifyInstruction: instruction, repairDeadlineMs: BOARD_REPAIR_DEADLINE_MS }
  );
  if (turn.degraded === 'aborted' || turn.degraded === 'failed') {
    throw new Error(turn.degradedReason ?? `agentic turn degraded: ${turn.degraded}`);
  }
  if (!content) throw new Error('Der Agent lieferte kein Ergebnis');

  // 4) Stage 3 — output nodes.
  const title = deriveTitle(instruction, content);
  const { documentId } = await executeOutputs(flow.outputs, {
    task,
    content,
    title,
    cardContext: flow.cardContext,
  });

  // Handoff: review-enabled runs, and runs the result check still objects to
  // after the repair round, park for a human Accept/Redo instead of completing
  // silently; the result comment/document is already posted either way.
  const boardCardUrl = `/boards/${task.board_id}?card=${task.card_id}`;
  const flagged = needsHumanReview(verdict);
  if (task.require_review || flagged) {
    await parkTaskForReview(task.id, documentId, verdict);
    await createNotification({
      userId: task.requested_by,
      type: 'agent_task_awaiting_review',
      title: flagged ? `Bitte prüfen: ${title}` : `Geplanter Lauf wartet auf Prüfung: ${title}`,
      body: flagged
        ? `Die automatische Prüfung hat Zweifel am Ergebnis${verdict.hint ? ` („${verdict.hint}")` : ''}. Sieh es dir an und gib es frei oder lass es neu erstellen.`
        : 'Ein geplanter Grünerator-Lauf ist fertig und wartet auf deine Freigabe.',
      actionUrl: boardCardUrl,
      metadata: {
        boardId: task.board_id,
        cardId: task.card_id,
        taskId: task.id,
        ...(documentId != null && { documentId }),
      },
      groupKey: `agent-task-${task.id}`,
    });
    log.info(
      `Board flow task ${task.id} awaiting review${documentId ? ` → document ${documentId}` : ''}`
    );
    return;
  }

  await completeAgentTask(task.id, documentId, verdict);

  await createNotification({
    userId: task.requested_by,
    type: 'agent_task_completed',
    title: documentId ? `Dein Dokument ist fertig: ${title}` : 'Der Grünerator hat geantwortet',
    body: documentId
      ? 'Der Grünerator hat deine Aufgabe erledigt. Öffne das Dokument, um das Ergebnis zu sehen.'
      : content.length > 140
        ? content.slice(0, 139) + '…'
        : content,
    actionUrl: documentId ? `/office/${documentId}` : boardCardUrl,
    metadata: {
      boardId: task.board_id,
      cardId: task.card_id,
      taskId: task.id,
      ...(documentId != null && { documentId }),
    },
    groupKey: `agent-task-${task.id}`,
  });

  log.info(`Board flow task ${task.id} completed${documentId ? ` → document ${documentId}` : ''}`);
}
