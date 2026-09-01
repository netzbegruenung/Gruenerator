/**
 * `recurring_tasks` — die wiederkehrenden Aufgaben (Agentura) der Person im
 * agentischen Loop.
 *
 * EIN Werkzeug mit `action`-Enum wie `groupTools.ts` und `notebookTools.ts`
 * (Katalogbudget). Es löst den Intent `create_recurring_task` ab, der bis
 * 09/2026 EINEN Einzeldurchlauf trug: eigener Extraktions-LLM-Aufruf, und die
 * Zeile landete OHNE Bestätigung in der Datenbank. Jetzt füllt der Loop-Planer
 * die strukturierten Felder des Contract-Schemas selbst (Takt, Zustellung,
 * Agent), und alles andere — auflisten, ändern, pausieren, sofort laufen,
 * löschen — geht erstmals überhaupt im Chat.
 *
 * Gatter, nach Wirkung sortiert:
 * - Karte (`confirm_action`): Anlegen. Die Aufgabe handelt danach selbstständig
 *   und kostet je Lauf einen Modellaufruf; ein Fehlalarm des Bestell-Detektors
 *   darf nicht mehr still schreiben. Ausgeführt in
 *   `confirmController.executeAction`.
 * - `confirm=true` im Werkzeug: Löschen.
 * - direkt: ändern, pausieren, fortsetzen, sofort ausführen — privat,
 *   umkehrbar, Owner-Scope liegt in der Repository-Query.
 *
 * Nur die userId-gescopten Repository-Funktionen werden gerufen. Was der
 * Worker braucht (`claimDueRecurringTasks`, `getRecurringTaskById`,
 * `recordRecurringTaskRun`, `setConsecutiveEmptyCount`) bleibt hier bewusst
 * unerreichbar — es kennt keinen Besitzer.
 *
 * Dienste kommen über `ctx.deps` herein, damit der Test ohne Postgres jede
 * Aktion durchspielen kann.
 */
import {
  createRecurringTaskBodySchema,
  recurringTaskDeliverySchema,
  scheduleRecurrenceSchema,
  type RecurringTask,
  type RecurringTaskRun,
  type UpdateRecurringTaskBody,
} from '@gruenerator/contracts';
import { tool, type Tool } from 'ai';
import { z } from 'zod';

import {
  DELIVERY_LABELS_DE,
  describeRecurrence,
  formatNextRun,
} from '../../../services/recurringTasks/recurringTaskLabels.js';
import {
  deleteRecurringTask,
  getRecurringTask,
  getRecurringTaskRow,
  listRecurringTaskRuns,
  listRecurringTasks,
  updateRecurringTask,
} from '../../../services/recurringTasks/recurringTasksRepository.js';
import { emitToolConfirmAction, newActionId } from '../services/confirmActionService.js';

import { getAgentForUser } from './agentLoader.js';
import {
  groundNote,
  groundRows,
  makeRow,
  NO_SESSION,
  refuseForbiddenAction,
  requireUserId,
  type PersonalToolCtx,
} from './personalDataTools.js';

import type { PendingAction } from '../../../agents/langgraph/ChatGraph/types.js';
import type { RecurringTask as RecurringTaskRow } from '../../../database/schema/recurringTasks.js';

export interface RecurringTaskToolDeps {
  listRecurringTasks: typeof listRecurringTasks;
  getRecurringTask: typeof getRecurringTask;
  getRecurringTaskRow: typeof getRecurringTaskRow;
  updateRecurringTask: typeof updateRecurringTask;
  deleteRecurringTask: typeof deleteRecurringTask;
  listRecurringTaskRuns: typeof listRecurringTaskRuns;
  /** Was `POST /api/recurring-tasks/:id/run` ruft — Feuer und vergessen. */
  runRecurringTask: (row: RecurringTaskRow) => Promise<void>;
  getAgentForUser: typeof getAgentForUser;
}

/** `PersonalToolCtx` plus optionale Fakes — der Katalog reicht den Ctx ohne `deps`. */
export type RecurringTaskToolCtx = PersonalToolCtx & { deps?: Partial<RecurringTaskToolDeps> };

function resolveDeps(partial: Partial<RecurringTaskToolDeps> | undefined): RecurringTaskToolDeps {
  return {
    listRecurringTasks: partial?.listRecurringTasks ?? listRecurringTasks,
    getRecurringTask: partial?.getRecurringTask ?? getRecurringTask,
    getRecurringTaskRow: partial?.getRecurringTaskRow ?? getRecurringTaskRow,
    updateRecurringTask: partial?.updateRecurringTask ?? updateRecurringTask,
    deleteRecurringTask: partial?.deleteRecurringTask ?? deleteRecurringTask,
    listRecurringTaskRuns: partial?.listRecurringTaskRuns ?? listRecurringTaskRuns,
    // Lazy: der Runner zieht die Generierungsdienste und den Loop nach sich,
    // und dieses Modul hängt am Katalog des Loops — ein statischer Import wäre
    // ein Zyklus.
    runRecurringTask:
      partial?.runRecurringTask ??
      (async (row) => {
        const { runRecurringTask } =
          await import('../../../services/recurringTasks/recurringTaskRunner.js');
        await runRecurringTask(row);
      }),
    getAgentForUser: partial?.getAgentForUser ?? getAgentForUser,
  };
}

const NOT_FOUND = 'Aufgabe nicht gefunden, oder sie gehört dir nicht.';
export const RECURRING_TASKS_URL = '/wiederkehrend';

const RUN_STATUS_LABEL: Record<RecurringTaskRun['status'], string> = {
  completed: 'erledigt',
  empty: 'ohne Ergebnis',
  failed: 'fehlgeschlagen',
};

function statusLabel(task: RecurringTask): string {
  return task.enabled ? 'aktiv' : 'pausiert';
}

function agentLabel(task: RecurringTask, agentTitle: string | null): string {
  return agentTitle ?? task.agentIdentifier ?? 'Grünerator (Standard)';
}

export function makeRecurringTasksTool(ctx: RecurringTaskToolCtx): Tool {
  const { state, sse, threadId, sourceRegistry } = ctx;
  const deps = resolveDeps(ctx.deps);
  const locale = state.userLocale === 'de-AT' ? 'de-AT' : 'de-DE';

  return tool({
    description: `Zugriff auf die wiederkehrenden Aufgaben der Person (Agentura): ein Grünerator-Agent läuft von selbst in einem festen Takt — täglich, wöchentlich, monatlich — und liefert jedes Mal ein Ergebnis als Dokument, als neuen Chat oder als Benachrichtigung.

NUTZE FÜR: bestehende Aufgaben auflisten (list), Details samt letzten Läufen ansehen (get mit taskId), eine neue Aufgabe einrichten — „erinnere mich jeden Montag um 9 an …", „schick mir täglich eine Übersicht zu …" (create mit title, instruction, recurrence; optional delivery, agentIdentifier, emailNotify, timezone), Titel/Anweisung/Takt/Zustellung ändern (update), pausieren (pause) und fortsetzen (resume), einmal sofort laufen lassen (run_now), löschen (delete mit confirm=true nach Zustimmung).

NICHT für: Aufgaben oder Karten auf einem Kanban-Board (dafür 'boards_tasks'), einen Grünerator-Agent anlegen oder ändern (im Chat nicht möglich — auf die Agentura verweisen), einmalige Aufträge, die jetzt erledigt werden sollen (die führst du selbst aus).

Für create formulierst du instruction als vollständige Arbeitsanweisung an den Agenten und wählst recurrence selbst: ohne genannte Uhrzeit 9:00; „wöchentlich" ohne Wochentag → byweekday weglassen. Eine Aufgabe wird über taskId (aus list, Feld ref) benannt. Das Einrichten wird der Person als Karte zur Bestätigung angezeigt — kündige nichts als eingerichtet an, was nur angefordert ist.`,
    inputSchema: z.object({
      action: z.enum(['list', 'get', 'create', 'update', 'pause', 'resume', 'run_now', 'delete']),
      taskId: z
        .string()
        .optional()
        .describe('Aufgaben-ID aus list, Feld ref (get, update, pause, resume, run_now, delete)'),
      title: z.string().max(120).optional().describe('Kurzer Titel der Aufgabe (create; update)'),
      instruction: z
        .string()
        .max(4000)
        .optional()
        .describe('Die ausformulierte Arbeitsanweisung an den Grünerator-Agent (create; update)'),
      recurrence: scheduleRecurrenceSchema
        .optional()
        .describe(
          'Takt (create; update): frequency daily|weekly|monthly, hour 0–23, minute 0–59; bei weekly byweekday als Liste (0=Montag … 6=Sonntag), bei monthly bymonthday 1–31'
        ),
      delivery: recurringTaskDeliverySchema
        .optional()
        .describe(
          'Zustellung (create; update): document = als Dokument (Standard), thread = als neuer Chat, summary = nur Benachrichtigung/E-Mail'
        ),
      agentIdentifier: z
        .string()
        .max(64)
        .optional()
        .describe(
          'Grünerator-Agent, der die Aufgabe ausführt (create; update). Standard: der Agent dieses Chats.'
        ),
      emailNotify: z
        .boolean()
        .optional()
        .describe('Zusätzlich per E-Mail benachrichtigen (create, Standard true; update)'),
      timezone: z
        .string()
        .optional()
        .describe('IANA-Zeitzone, z. B. Europe/Berlin oder Europe/Vienna (Standard nach Locale)'),
      confirm: z
        .boolean()
        .default(false)
        .describe('Nur bei delete: erst true setzen, nachdem die Person zugestimmt hat.'),
      limit: z.number().int().min(1).max(30).default(15),
    }),
    execute: async (args) => {
      const userId = requireUserId(state);
      if (!userId) return { error: NO_SESSION };
      const { action } = args;

      if (action === 'list') {
        const tasks = (await deps.listRecurringTasks(userId)).slice(0, args.limit);
        if (tasks.length === 0) {
          const note = 'Es sind noch keine wiederkehrenden Aufgaben eingerichtet.';
          groundNote(sourceRegistry, 'Wiederkehrende Aufgaben', note);
          return { resultCount: 0, results: [], note };
        }
        const results = tasks.map((t) =>
          makeRow(
            t.title,
            RECURRING_TASKS_URL,
            'Wiederkehrende Aufgabe',
            `${describeRecurrence(t.recurrence)} · ${DELIVERY_LABELS_DE[t.delivery]} · ${statusLabel(t)} · nächste Ausführung ${formatNextRun(t.nextRunAt, locale)}`,
            t.id
          )
        );
        groundRows(sourceRegistry, results);
        return { resultCount: results.length, results };
      }

      if (action === 'create') return createCard(userId, args);

      // Alle weiteren Aktionen zielen auf EINE Aufgabe.
      const id = args.taskId?.trim();
      if (!id) return { error: 'Diese Aktion braucht taskId (aus list, Feld ref).' };
      const task = await deps.getRecurringTask(userId, id);
      if (!task) return { error: NOT_FOUND };

      if (action === 'get') return getTask(userId, task);

      // Jede Schreibaktion — auch pause/resume/run_now: sie ändern, was von
      // selbst läuft und kostet, und ein Turn, der Änderungen ausschließt,
      // bekommt keine angeboten.
      const forbidden = refuseForbiddenAction(state);
      if (forbidden) return forbidden;

      if (action === 'update') return updateTask(userId, task, args);

      if (action === 'pause' || action === 'resume') {
        const enabled = action === 'resume';
        if (task.enabled === enabled) {
          const note = `Aufgabe „${task.title}" ist schon ${statusLabel(task)}.`;
          groundNote(sourceRegistry, 'Wiederkehrende Aufgabe', note);
          return { ok: true, note };
        }
        const updated = await deps.updateRecurringTask(userId, task.id, { enabled });
        if (!updated) return { error: NOT_FOUND };
        const note = enabled
          ? `Aufgabe „${updated.title}" läuft wieder — nächste Ausführung ${formatNextRun(updated.nextRunAt, locale)}.`
          : `Aufgabe „${updated.title}" ist pausiert.`;
        groundNote(sourceRegistry, enabled ? 'Aufgabe fortgesetzt' : 'Aufgabe pausiert', note);
        return { ok: true, note };
      }

      if (action === 'run_now') {
        const row = await deps.getRecurringTaskRow(userId, task.id);
        if (!row) return { error: NOT_FOUND };
        // Wie der ts-rest-Handler `runNow`: einmal sofort, unabhängig vom
        // Pausenstand, ohne next_run_at anzurühren; Feuer und vergessen, weil
        // ein Lauf Minuten dauern kann und der Runner selbst benachrichtigt.
        void deps.runRecurringTask(row);
        const note = `Aufgabe „${task.title}" wurde gestartet — das Ergebnis kommt ${DELIVERY_LABELS_DE[task.delivery]}, sobald der Lauf fertig ist.`;
        groundNote(sourceRegistry, 'Aufgabe gestartet', note);
        return { ok: true, note };
      }

      // delete
      if (!args.confirm) {
        const ask = `Soll die wiederkehrende Aufgabe „${task.title}" wirklich gelöscht werden? Frage die Person und rufe delete erst mit confirm=true erneut auf.`;
        groundNote(sourceRegistry, 'Bestätigung nötig', ask);
        return { needsConfirmation: true, note: ask };
      }
      const deleted = await deps.deleteRecurringTask(userId, task.id);
      if (!deleted) return { error: NOT_FOUND };
      const note = `Aufgabe „${task.title}" wurde gelöscht.`;
      groundNote(sourceRegistry, 'Gelöscht', note);
      return { ok: true, note };
    },
  });

  async function resolveAgentTitle(
    userId: string,
    identifier: string | null
  ): Promise<{ title: string | null } | { error: string }> {
    if (!identifier) return { title: null };
    const agent = await deps.getAgentForUser(identifier, userId);
    if (!agent) return { error: `Grünerator-Agent „${identifier}" nicht gefunden.` };
    return { title: agent.title };
  }

  // -------------------------------------------------------------------------
  // create — Karte
  // -------------------------------------------------------------------------

  async function createCard(
    userId: string,
    args: {
      title?: string | undefined;
      instruction?: string | undefined;
      recurrence?: z.infer<typeof scheduleRecurrenceSchema> | undefined;
      delivery?: z.infer<typeof recurringTaskDeliverySchema> | undefined;
      agentIdentifier?: string | undefined;
      emailNotify?: boolean | undefined;
      timezone?: string | undefined;
    }
  ): Promise<Record<string, unknown>> {
    if (!threadId) return { error: 'Einrichten ist in diesem Kontext nicht möglich.' };
    // Kein Artefakt-Substantiv zum Binden — nur ein Verbot auf Aktionsebene
    // („nichts speichern", „keine Aktion") kann eine Aufgabe ausschließen.
    const forbidden = refuseForbiddenAction(state);
    if (forbidden) return forbidden;
    if (!args.title?.trim() || !args.instruction?.trim() || !args.recurrence) {
      return { error: 'create braucht title, instruction und recurrence.' };
    }
    // Der Agent dieses Chats führt die Aufgabe aus, wenn die Person keinen
    // anderen nennt — so hielt es schon der Intent-Handler. Geprüft wird er
    // jetzt (heute ungeprüft): ein erfundener Identifier liefe sonst als
    // Standard-Agent, ohne dass die Karte das sagte.
    const agentIdentifier = args.agentIdentifier?.trim() || state.agentConfig?.identifier || null;
    const agent = await resolveAgentTitle(userId, agentIdentifier);
    if ('error' in agent) return agent;

    const validated = createRecurringTaskBodySchema.safeParse({
      title: args.title.trim(),
      instruction: args.instruction.trim(),
      recurrence: args.recurrence,
      ...(args.delivery ? { delivery: args.delivery } : {}),
      ...(args.emailNotify !== undefined ? { emailNotify: args.emailNotify } : {}),
      agentIdentifier,
      timezone: args.timezone?.trim() || (locale === 'de-AT' ? 'Europe/Vienna' : 'Europe/Berlin'),
      locale,
    });
    if (!validated.success) {
      return {
        error: `Ungültige Angaben: ${validated.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
      };
    }
    const body = validated.data;
    const takt = describeRecurrence(body.recurrence);
    const zustellung = DELIVERY_LABELS_DE[body.delivery];
    const agentTitle = agent.title;

    const pending: PendingAction = {
      actionId: newActionId(),
      threadId,
      userId,
      title: 'Wiederkehrende Aufgabe einrichten',
      preview: `„${body.title}" — ${takt}`,
      createdAt: Date.now(),
      type: 'create_recurring_task',
      payload: { ...body, agentTitle },
    };
    await emitToolConfirmAction(sse, pending, [
      { key: 'Aufgabe', value: body.title },
      { key: 'Takt', value: takt },
      { key: 'Zustellung', value: zustellung },
      { key: 'Agent', value: agentTitle ?? 'Grünerator (Standard)' },
    ]);
    const note = `Bestätigung angefordert: wiederkehrende Aufgabe „${body.title}" (${takt}, ${zustellung}) einrichten.`;
    groundNote(sourceRegistry, 'Wiederkehrende Aufgabe einrichten', note);
    return { ok: true, needsConfirmation: true, note };
  }

  // -------------------------------------------------------------------------
  // get — Details samt letzten Läufen als EIN Quellenblock
  // -------------------------------------------------------------------------

  async function getTask(userId: string, task: RecurringTask): Promise<Record<string, unknown>> {
    const runs = await deps.listRecurringTaskRuns(userId, task.id, 5);
    const agent = await resolveAgentTitle(userId, task.agentIdentifier);
    const agentTitle = 'title' in agent ? agent.title : null;
    const takt = describeRecurrence(task.recurrence);
    const zustellung = DELIVERY_LABELS_DE[task.delivery];
    const lines = [
      `Wiederkehrende Aufgabe „${task.title}" — ${RECURRING_TASKS_URL}`,
      `Anweisung: ${task.instruction}`,
      `Takt: ${takt} (${task.timezone})`,
      `Zustellung: ${zustellung}${task.emailNotify ? ', zusätzlich per E-Mail' : ''}`,
      `Agent: ${agentLabel(task, agentTitle)}`,
      `Status: ${statusLabel(task)}; nächste Ausführung ${formatNextRun(task.nextRunAt, locale)}${task.lastRunAt ? `; zuletzt ${formatNextRun(task.lastRunAt, locale)}` : ''}`,
      runs.length
        ? `Letzte Läufe: ${runs
            .map(
              (r) =>
                `${formatNextRun(r.createdAt, locale)} ${RUN_STATUS_LABEL[r.status]}${r.error ? ` (${r.error})` : ''}`
            )
            .join('; ')}`
        : 'Noch kein Lauf',
    ];
    sourceRegistry.register([
      {
        source: 'eigene-inhalte',
        title: `Wiederkehrende Aufgabe: ${task.title}`,
        content: lines.join('\n'),
        url: RECURRING_TASKS_URL,
      },
    ]);
    return {
      task: {
        id: task.id,
        title: task.title,
        instruction: task.instruction,
        recurrence: task.recurrence,
        recurrenceLabel: takt,
        delivery: task.delivery,
        deliveryLabel: zustellung,
        emailNotify: task.emailNotify,
        agentIdentifier: task.agentIdentifier,
        agentTitle,
        enabled: task.enabled,
        nextRunAt: task.nextRunAt,
        lastRunAt: task.lastRunAt,
        url: RECURRING_TASKS_URL,
      },
      runs: runs.map((r) => ({
        status: r.status,
        statusLabel: RUN_STATUS_LABEL[r.status],
        createdAt: r.createdAt,
        resultUrl: r.resultUrl,
        error: r.error,
      })),
    };
  }

  // -------------------------------------------------------------------------
  // update — direkt
  // -------------------------------------------------------------------------

  async function updateTask(
    userId: string,
    task: RecurringTask,
    args: {
      title?: string | undefined;
      instruction?: string | undefined;
      recurrence?: z.infer<typeof scheduleRecurrenceSchema> | undefined;
      delivery?: z.infer<typeof recurringTaskDeliverySchema> | undefined;
      agentIdentifier?: string | undefined;
      emailNotify?: boolean | undefined;
      timezone?: string | undefined;
    }
  ): Promise<Record<string, unknown>> {
    const patch: UpdateRecurringTaskBody = {};
    const changes: string[] = [];
    const title = args.title?.trim();
    if (title) {
      patch.title = title;
      changes.push(`heißt jetzt „${title}"`);
    }
    const instruction = args.instruction?.trim();
    if (instruction) {
      patch.instruction = instruction;
      changes.push('neue Anweisung');
    }
    if (args.recurrence) {
      patch.recurrence = args.recurrence;
      changes.push(`läuft ${describeRecurrence(args.recurrence)}`);
    }
    if (args.delivery) {
      patch.delivery = args.delivery;
      changes.push(`Zustellung ${DELIVERY_LABELS_DE[args.delivery]}`);
    }
    if (args.emailNotify !== undefined) {
      patch.emailNotify = args.emailNotify;
      changes.push(args.emailNotify ? 'mit E-Mail' : 'ohne E-Mail');
    }
    const timezone = args.timezone?.trim();
    if (timezone) {
      patch.timezone = timezone;
      changes.push(`Zeitzone ${timezone}`);
    }
    const agentIdentifier = args.agentIdentifier?.trim();
    if (agentIdentifier) {
      const agent = await resolveAgentTitle(userId, agentIdentifier);
      if ('error' in agent) return agent;
      patch.agentIdentifier = agentIdentifier;
      changes.push(`Agent ${agent.title ?? agentIdentifier}`);
    }
    if (changes.length === 0) {
      return {
        error:
          'update braucht mindestens eines von title, instruction, recurrence, delivery, agentIdentifier, emailNotify, timezone.',
      };
    }
    const updated = await deps.updateRecurringTask(userId, task.id, patch);
    if (!updated) return { error: NOT_FOUND };
    const note = `Aufgabe „${task.title}" — ${changes.join('; ')}. Nächste Ausführung ${formatNextRun(updated.nextRunAt, locale)}.`;
    groundNote(sourceRegistry, 'Aufgabe geändert', note);
    return { ok: true, note };
  }
}
