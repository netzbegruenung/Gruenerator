/**
 * EXPERIMENTAL — executes one recurring task: run the assigned agent, deliver the
 * result (document / summary notification / new chat thread), and record the run.
 *
 * Seit #3221 läuft die Generierung über den VOLLEN agentischen Loop
 * (`runHeadlessAgenticTurn`: Budget, Stall-Guards, Quellen-Registry, kompletter
 * interner Werkzeugkatalog) statt über den 5-Schritt-Kern `generateFromState`
 * — der bleibt für die Board-Pfade. Dazu kommt die Ergebnis-Prüfung
 * (`verifyRecurringResult`): ein Verdikt pro Lauf, bei Beanstandung GENAU EINE
 * Reparatur-Runde (ein if, keine Schleife), geliefert wird IMMER — das Verdikt
 * ist Messwert, kein Gate, und steht als `recurring_task_runs.verdict` im
 * Verlauf.
 *
 * Der Loop wirft nie, sondern ersetzt harte Ausfälle durch Ersatztext — für
 * den Chat die ehrliche Auskunft, hier ein falsches Ergebnisdokument. Deshalb
 * entscheidet `degraded`, nicht der Text: 'no_answer' → Empty-Pfad,
 * 'aborted'/'failed' → Failed-Pfad, 'none' → prüfen und liefern.
 */
import { type RecurringTask } from '../../database/schema/recurringTasks.js';
import {
  runHeadlessAgenticTurn as runHeadlessAgenticTurnReal,
  type HeadlessTurnResult,
} from '../../routes/chat/services/agenticLoop/runHeadlessAgenticTurn.js';
import {
  createMessage,
  createThread,
} from '../../routes/chat/services/threadPersistenceService.js';
import { createLogger } from '../../utils/logger.js';
import { deriveTitle, type UserLocale } from '../boards/agentFlow/generate.js';
import { createDocumentWithContent } from '../docs/DocGenerationService.js';
import { createNotification } from '../notifications/NotificationService.js';

import { recordRecurringTaskRun, setConsecutiveEmptyCount } from './recurringTasksRepository.js';
import {
  verifyRecurringResult as verifyRecurringResultReal,
  type RunVerdict,
} from './runVerifier.js';

const log = createLogger('recurringTaskRunner');

/** Injizierbar (Repo-Muster: agenticRespondService, catalogAssembly), damit der
 *  Runner ohne Modell, DB und Redis prüfbar ist. */
export interface RecurringRunnerDeps {
  runTurn: typeof runHeadlessAgenticTurnReal;
  verify: typeof verifyRecurringResultReal;
}

const defaultDeps: RecurringRunnerDeps = {
  runTurn: runHeadlessAgenticTurnReal,
  verify: verifyRecurringResultReal,
};

function preview(text: string, max = 140): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? clean.slice(0, max - 1) + '…' : clean;
}

/**
 * Run a single recurring task end-to-end. Owns its own failure handling (records a
 * 'failed' run + fires agent_task_failed) so the worker loop can stay a thin drain.
 */
export async function runRecurringTask(
  task: RecurringTask,
  deps: RecurringRunnerDeps = defaultDeps
): Promise<void> {
  const startedAt = Date.now();
  const userLocale: UserLocale = task.locale === 'de-AT' ? 'de-AT' : 'de-DE';
  const longForm = task.delivery !== 'summary';

  // Phase 1 — generation + delivery. A failure HERE is a genuine task failure.
  let delivered: { actionUrl: string | null; notifyTitle: string; notifyBody: string };
  let content: string;
  let verdict: RunVerdict | null = null;
  let turn: HeadlessTurnResult;
  try {
    const turnParams = {
      instruction: task.instruction,
      userId: task.user_id,
      agentId: task.agent_identifier,
      userLocale,
      longForm,
      slotLabel: `recurring-task-${task.id}`,
      // Honor the bound agent's tool selection; the default universal agent
      // (no agent_identifier) keeps the full tool set.
      restrictToAgentTools: !!task.agent_identifier,
    };
    turn = await deps.runTurn(turnParams);

    // Ersatztext des Nie-Werfen-Vertrags ist KEIN Ergebnis. 'aborted'/'failed'
    // gehen in den bestehenden Catch (wie früher ein Timeout des alten Kerns).
    if (turn.degraded === 'aborted' || turn.degraded === 'failed') {
      throw new Error(`agentic turn degraded: ${turn.degraded}`);
    }
    content = turn.degraded === 'no_answer' ? '' : turn.text;

    // Empty-suppression: nothing to deliver → record 'empty', bump the counter,
    // do NOT notify (avoids recurring noise). Output resets the counter.
    // Läuft VOR der Prüfung — Leeres wird nicht verifiziert.
    if (!content) {
      await setConsecutiveEmptyCount(task.id, task.consecutive_empty_count + 1);
      await recordRecurringTaskRun({
        taskId: task.id,
        status: 'empty',
        durationMs: Date.now() - startedAt,
      });
      log.info(`Recurring task ${task.id} produced no output (empty run)`);
      return;
    }

    // Ergebnis-Prüfung + höchstens EINE Reparatur-Runde. Scheitert die
    // Reparatur (degraded oder leer), bleibt der Erstentwurf — fail-open
    // schlägt Zurückhalten, es wartet niemand, der nachbessern könnte.
    verdict = await deps.verify({ instruction: task.instruction, resultText: content });
    if (!verdict.ok && verdict.hint) {
      const second = await deps.runTurn({
        ...turnParams,
        feedback: { hint: verdict.hint, priorDraft: content },
      });
      if (second.degraded === 'none' && second.text.trim()) {
        content = second.text;
        verdict = {
          ...(await deps.verify({ instruction: task.instruction, resultText: content })),
          repaired: true,
        };
      } else {
        verdict = { ...verdict, repaired: false };
      }
    }

    delivered = await deliver(task, content);
  } catch (error) {
    const err = error as Error;
    log.error(`Recurring task ${task.id} failed:`, err);
    await recordRecurringTaskRun({
      taskId: task.id,
      status: 'failed',
      error: err.message,
      durationMs: Date.now() - startedAt,
    }).catch((e) => log.error(`Failed to record failed run for ${task.id}:`, e as Error));
    await createNotification({
      userId: task.user_id,
      type: 'agent_task_failed',
      title: `Wiederkehrende Aufgabe fehlgeschlagen: ${task.title}`,
      body: 'Ein geplanter Lauf konnte nicht ausgeführt werden. Bitte prüfe die Aufgabe.',
      metadata: { taskId: task.id },
      groupKey: `recurring-task-${task.id}`,
    }).catch((e) => log.error(`Failed to notify failure for ${task.id}:`, e as Error));
    return;
  }

  // Phase 2 — bookkeeping. The artifact is already delivered; a failure here must
  // NOT be recorded as a failed run (that would double-count + falsely alarm the
  // user). Best-effort: log and move on.
  try {
    await setConsecutiveEmptyCount(task.id, 0);
    await recordRecurringTaskRun({
      taskId: task.id,
      status: 'completed',
      resultsSummary: task.delivery === 'summary' ? content : preview(content, 280),
      resultUrl: delivered.actionUrl,
      durationMs: Date.now() - startedAt,
      verdict,
    });
    await createNotification({
      userId: task.user_id,
      type: 'agent_task_completed',
      title: delivered.notifyTitle,
      body: delivered.notifyBody,
      ...(delivered.actionUrl != null && { actionUrl: delivered.actionUrl }),
      metadata: { taskId: task.id, delivery: task.delivery },
      groupKey: `recurring-task-${task.id}`,
      // The per-task toggle can only SUPPRESS the completion email; when on it
      // defers to the user's global prefs (never forces past a global opt-out).
      ...(task.email_notify ? {} : { channelOverride: { email: false } }),
    });
    log.info(`Recurring task ${task.id} completed (${task.delivery})`);
  } catch (error) {
    log.error(
      `Recurring task ${task.id} delivered but post-run bookkeeping failed:`,
      error as Error
    );
  }
}

/** Deliver the generated content per the task's delivery method. */
async function deliver(
  task: RecurringTask,
  content: string
): Promise<{ actionUrl: string | null; notifyTitle: string; notifyBody: string }> {
  if (task.delivery === 'document') {
    const docTitle = deriveTitle(task.title, content);
    const doc = await createDocumentWithContent(docTitle, content, 'blank', task.user_id);
    return {
      actionUrl: `/office/${doc.id}`,
      notifyTitle: `Dein Dokument ist fertig: ${docTitle}`,
      notifyBody:
        'Der Grünerator hat deine wiederkehrende Aufgabe erledigt. Öffne das Dokument, um das Ergebnis zu sehen.',
    };
  }

  if (task.delivery === 'thread') {
    const agentId = task.agent_identifier ?? 'gruenerator-universal';
    const thread = await createThread(task.user_id, agentId, task.title, 'chat');
    await createMessage(thread.id, 'user', task.instruction, undefined, task.user_id);
    await createMessage(
      thread.id,
      'assistant',
      content,
      { intent: 'create_recurring_task' },
      task.user_id
    );
    return {
      actionUrl: `/chat/${thread.id}`,
      notifyTitle: `Neues Ergebnis: ${task.title}`,
      notifyBody: 'Der Grünerator hat deine wiederkehrende Aufgabe im Chat beantwortet.',
    };
  }

  // summary: the generated text IS the deliverable (in-app + email body).
  return {
    actionUrl: null,
    notifyTitle: task.title,
    notifyBody: preview(content, 480),
  };
}
