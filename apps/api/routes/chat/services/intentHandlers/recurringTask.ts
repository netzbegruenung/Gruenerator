/**
 * EXPERIMENTAL: create_recurring_task — the one chat action that persists
 * without a confirmation step.
 */

import { createRecurringTaskBodySchema, type ScheduleRecurrence } from '@gruenerator/contracts';

import { createRecurringTask } from '../../../../services/recurringTasks/recurringTasksRepository.js';
import { createLogger } from '../../../../utils/logger.js';
import { failCreation, streamTextInChunks } from '../createTurnHelpers.js';
import { createMessage, touchThread } from '../threadPersistenceService.js';

import type { ChatGraphState } from '../../../../agents/langgraph/ChatGraph/types.js';
import type { SSEWriter } from '../sseHelpers.js';

const log = createLogger('ChatGraphController');

const WEEKDAY_LABELS_DE = [
  'Montag',
  'Dienstag',
  'Mittwoch',
  'Donnerstag',
  'Freitag',
  'Samstag',
  'Sonntag',
];
const DELIVERY_LABELS_DE: Record<string, string> = {
  document: 'als Dokument',
  summary: 'als Zusammenfassung (Benachrichtigung/E-Mail)',
  thread: 'als neuer Chat',
};

/**
 * Templated, like every other create failure (see failCreation): the previous
 * fall-through handed the turn to the generic responder, which typically
 * CONFIRMED the recurring task — while no row had been written.
 */
const RECURRING_TASK_FAILURE_TEXT =
  'Ich konnte die wiederkehrende Aufgabe nicht einrichten. Sie wurde **nicht** gespeichert — ' +
  'bitte formuliere sie noch einmal, zum Beispiel: „Erinnere mich jeden Montag um 9 Uhr an den Wochenbericht."';

const RECURRING_EXTRACTION_PROMPT = `Du extrahierst aus einer Nutzeranfrage die Konfiguration für eine WIEDERKEHRENDE Aufgabe und gibst NUR ein JSON-Objekt zurück (keine Erklärung, kein Markdown).

Schema:
{
  "title": string,            // kurzer Titel der Aufgabe (max 120 Zeichen)
  "instruction": string,      // die eigentliche Arbeitsanweisung an den Agenten, ausformuliert
  "delivery": "document" | "summary" | "thread",  // Standard: "document". "summary" wenn nur kurze Info/Erinnerung, "thread" wenn im Chat gewünscht.
  "recurrence": {
    "frequency": "daily" | "weekly" | "monthly",
    "hour": number,           // 0-23, Standard 9
    "minute": number,         // 0-59, Standard 0
    "byweekday": number[]?,   // NUR bei weekly: 0=Montag … 6=Sonntag
    "bymonthday": number?     // NUR bei monthly: Tag 1-31
  }
}

Regeln: Wenn keine Uhrzeit genannt ist, nutze 9:00. Bei "wöchentlich" ohne Wochentag byweekday weglassen. Gib ausschließlich das JSON zurück.`;

/** Strip code fences and parse the first JSON object in the model output. */
function parseExtractedJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced?.[1] ?? raw).trim();
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) throw new Error('no JSON object found');
  return JSON.parse(body.slice(start, end + 1));
}

function describeRecurrence(rec: ScheduleRecurrence): string {
  const time = `${String(rec.hour).padStart(2, '0')}:${String(rec.minute).padStart(2, '0')} Uhr`;
  if (rec.frequency === 'daily') return `täglich um ${time}`;
  if (rec.frequency === 'weekly') {
    const days = (rec.byweekday ?? [])
      .map((d) => WEEKDAY_LABELS_DE[d] ?? '')
      .filter(Boolean)
      .join(', ');
    return days ? `wöchentlich (${days}) um ${time}` : `wöchentlich um ${time}`;
  }
  return rec.bymonthday ? `monatlich am ${rec.bymonthday}. um ${time}` : `monatlich um ${time}`;
}

/**
 * EXPERIMENTAL — handle the create_recurring_task intent: extract a structured
 * schedule from the user message, create a recurring_tasks row, and confirm in
 * chat. Direct creation (no separate confirm step) — the task is flag-gated,
 * editable and deletable in the management UI. Returns true if a task was created.
 */
export async function handleRecurringTaskCreation(opts: {
  sse: SSEWriter;
  classifiedState: ChatGraphState;
  aiClient: ChatGraphState['aiClient'];
  req: Express.Request;
  actualThreadId?: string;
  userId: string;
  userContent: string;
  agentId?: string | null;
  userLocale: 'de-DE' | 'de-AT';
}): Promise<boolean> {
  const { sse, classifiedState, aiClient, req, actualThreadId, userId, userContent } = opts;

  try {
    const genResult = await aiClient.processRequest(
      {
        type: 'doc_generation',
        systemPrompt: RECURRING_EXTRACTION_PROMPT,
        messages: [{ role: 'user', content: userContent }],
        options: { temperature: 0.2 },
      },
      req as Express.Request & { user?: { id?: string }; sessionID?: string }
    );
    if (!genResult.success || !genResult.content) {
      log.warn(
        `[ChatGraph] Recurring task extraction produced nothing: ${genResult.error ?? 'no content'}`
      );
      return failCreation(
        sse,
        actualThreadId,
        'create_recurring_task',
        RECURRING_TASK_FAILURE_TEXT
      );
    }

    const parsed = parseExtractedJson(genResult.content) as Record<string, unknown>;
    const candidate = {
      title: parsed.title,
      instruction: parsed.instruction,
      delivery: parsed.delivery ?? 'document',
      recurrence: parsed.recurrence,
      // A dedicated agent in this chat runs the recurring task too, unless the
      // user targeted a different one (none in v1 — the current agent is used).
      agentIdentifier: opts.agentId ?? null,
      locale: opts.userLocale,
    };
    const validated = createRecurringTaskBodySchema.safeParse(candidate);
    if (!validated.success) {
      log.warn(`[ChatGraph] Recurring task extraction invalid: ${validated.error.message}`);
      return failCreation(
        sse,
        actualThreadId,
        'create_recurring_task',
        RECURRING_TASK_FAILURE_TEXT
      );
    }

    const task = await createRecurringTask(userId, validated.data);

    sse.send('response_start', { message: 'Richte wiederkehrende Aufgabe ein...' });
    // `toLocaleString` ohne `timeZone` nimmt die Zeitzone des SERVERS, und der
    // Container läuft in UTC. Gemessen: „um 09:00 Uhr" korrekt angelegt, in
    // derselben Nachricht als „Nächste Ausführung: 07:00" gemeldet — die Aufgabe
    // war richtig, die Bestätigung log. Wien und Berlin teilen sich CET/CEST,
    // die Wahl ändert also nur den Namen, nicht die Stunde; sie steht hier
    // trotzdem am Locale, weil eine österreichische Nutzerin keine deutsche
    // Zeitzone genannt bekommen soll, wenn das Feld einmal sichtbar wird.
    const displayZone = opts.userLocale === 'de-AT' ? 'Europe/Vienna' : 'Europe/Berlin';
    const nextRun = new Date(task.nextRunAt).toLocaleString('de-DE', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: displayZone,
    });
    const responseText =
      `Wiederkehrende Aufgabe **„${task.title}"** eingerichtet — läuft ${describeRecurrence(task.recurrence)}, ` +
      `${DELIVERY_LABELS_DE[task.delivery] ?? ''}. Nächste Ausführung: ${nextRun}. ` +
      `Du kannst sie jederzeit unter „Wiederkehrende Aufgaben" bearbeiten oder löschen.`;
    streamTextInChunks(sse, responseText);

    const totalTimeMs = Date.now() - classifiedState.startTime;
    sse.sendRaw('done', {
      threadId: actualThreadId,
      citations: [],
      metadata: {
        intent: 'create_recurring_task',
        searchCount: 0,
        totalTimeMs,
        classificationTimeMs: classifiedState.classificationTimeMs,
        searchTimeMs: 0,
      },
    });

    if (actualThreadId) {
      await createMessage(actualThreadId, 'assistant', responseText, {
        intent: 'create_recurring_task',
      });
      await touchThread(actualThreadId);
    }

    // Takt und nächster Lauf gehören in die Zeile: das ist die einzige Aktion im
    // Chat, die OHNE Bestätigungsschritt persistiert, und bis hierher stand im
    // Log nur, DASS etwas angelegt wurde — nicht, mit welchem Zeitplan. Bei
    // einer Beschwerde („die Erinnerung kommt zur falschen Zeit") war damit
    // nicht nachvollziehbar, ob die Extraktion oder der Scheduler danebenlag.
    log.info(
      `[ChatGraph] Recurring task created: "${task.title}" (${task.id}) — ` +
        `${describeRecurrence(task.recurrence)}, next=${new Date(task.nextRunAt).toISOString()}`
    );
    sse.end();
    return true;
  } catch (err) {
    log.error(
      `[ChatGraph] Recurring task creation failed: ${err instanceof Error ? err.message : String(err)}`
    );
    return failCreation(sse, actualThreadId, 'create_recurring_task', RECURRING_TASK_FAILURE_TEXT);
  }
}
