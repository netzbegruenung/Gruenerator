/**
 * AI-column flow orchestrator: SOURCE → AI STEP → OUTPUT NODES.
 *
 * Called by boardAgentWorker for tasks that carry a flow_config. Throws on failure;
 * the worker's try/catch handles retry + the failure comment/notification (same as
 * the legacy @-mention path).
 */
import { type AgentTask } from '../../../database/schema/agentTasks.js';
import { createLogger } from '../../../utils/logger.js';
import { createNotification } from '../../notifications/NotificationService.js';
import { completeAgentTask, parkTaskForReview } from '../agentTaskService.js';

import { deriveTitle, generateFromState, prepareAgentState } from './generate.js';
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

  // 3) Stage 2 — AI step (reuses the existing agent generation).
  const prepared = await prepareAgentState(effectivePrompt, userLocale);
  const content = await generateFromState(prepared, {
    longForm: wantsLongForm(flow.outputs),
    slotLabel: `board-flow-${task.id}`,
  });
  if (!content) throw new Error('Der Agent lieferte kein Ergebnis');

  // 4) Stage 3 — output nodes.
  const title = deriveTitle(instruction, content);
  const { documentId } = await executeOutputs(flow.outputs, {
    task,
    content,
    title,
    cardContext: flow.cardContext,
  });

  // Review-enabled runs (Phase 2) park for a human Accept/Redo instead of
  // completing silently; the result comment/document is already posted either way.
  const boardCardUrl = `/boards/${task.board_id}?card=${task.card_id}`;
  if (task.require_review) {
    await parkTaskForReview(task.id, documentId);
    await createNotification({
      userId: task.requested_by,
      type: 'agent_task_awaiting_review',
      title: `Geplanter Lauf wartet auf Prüfung: ${title}`,
      body: 'Ein geplanter Grünerator-Lauf ist fertig und wartet auf deine Freigabe.',
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

  await completeAgentTask(task.id, documentId);

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
