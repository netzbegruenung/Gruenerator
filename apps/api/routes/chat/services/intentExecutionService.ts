/**
 * Intent Execution Service
 *
 * The turn handlers that are NOT plain artifact creation: recurring tasks,
 * share_doc, sharepic/social-post generation and the search/image/summary
 * pipeline. Artifact-creating turns live in createTurn.ts (choreography) and
 * artifactKinds.ts (per-kind data); the thin handlers below only name them.
 */

import { createRecurringTaskBodySchema, type ScheduleRecurrence } from '@gruenerator/contracts';
import { isGroundableProse } from '@gruenerator/shared/chat-intents';
import { buildChatThreadSlug, findBestMatch } from '@gruenerator/shared/utils';

import {
  briefGeneratorNode,
  searchNode,
  rerankNode,
  imageNode,
  imageEditNode,
  summarizeNode,
  computeNode,
  buildCitations,
} from '../../../agents/langgraph/ChatGraph/index.js';
import { hasExplicitSharepicWord } from '../../../agents/langgraph/ChatGraph/nodes/fastPathGuards.js';
import { partitionSearchErrors } from '../../../agents/langgraph/ChatGraph/types.js';
import { env } from '../../../config/env.js';
import { type ExpressRequest as SharepicExpressRequest } from '../../../services/chat/sharepicGenerationService.js';
import { createRecurringTask } from '../../../services/recurringTasks/recurringTasksRepository.js';
import { resolveSearchTier, resolveTier } from '../../../services/search/searchDepth.js';
import {
  formatSheetAsContext,
  loadSheetState,
} from '../../../services/sheets/SheetGenerationService.js';
import { toUserFacingMessage } from '../../../utils/errors/index.js';
import { createLogger } from '../../../utils/logger.js';
import { checkDocumentWriteAccess } from '../../docs/documentAccess.js';
import { generateSheetOperations } from '../../sheets/sheetAiService.js';

import { needsThreadGrounding } from './agenticLoop/routing.js';
import { renderSourceLines, withResearchedSources } from './agenticLoop/sourceRegistry.js';
import { resolveSharepicAuthorName } from './artifactGeneration.js';
import {
  BOARD_SPEC,
  makeDocumentSpec,
  PDF_SPEC,
  PRESENTATION_SPEC,
  SHEET_SPEC,
} from './artifactKinds.js';
import { CONFIRM_ACTION_CONFIG } from './confirmActionService.js';
import {
  buildCreateTurnContext,
  emitArtifactResult,
  runCreateTurn,
  SHAREPIC_CONTEXT_CHARS,
  type CreateTurnOpts,
} from './createTurn.js';
import { failCreation, rememberArtifact, streamTextInChunks } from './createTurnHelpers.js';
import { runDeepAgentTurn } from './deepAgentTurn.js';
import { runDeepResearchTurn } from './deepResearchTurn.js';
import { emitEditorOperations, planEditorOps } from './editorOpsCore.js';
import { finishEditTurn } from './editTurnCompletion.js';
import { extractTextContent } from './messageHelpers.js';
import {
  recallPastChats,
  recallOfficeDocuments,
  recallReels,
  rerankRecall,
  getThreadRecallContext,
  formatPastChatsBlock,
  formatOfficeDocsBlock,
  formatReelsBlock,
  getSpaceRecallScope,
} from './pastChatRecallService.js';
import { pendingActionStore } from './pendingActionStore.js';
import { resolveReferentialTopic } from './referentialTopic.js';
import { looksLikeRefusal } from './refusalDetection.js';
import { withImageProxy } from './searchImagePayload.js';
import {
  detectPreferredVariant,
  generateSharepicVariants,
  type PriorSharepic,
  type SharepicVariant,
} from './sharepicVariantHelpers.js';
import { generateSliderDeckVariant } from './sliderDeckService.js';
import {
  createDeferredSSE,
  PROGRESS_MESSAGES,
  sendChatWarning,
  sendSearchDegradedWarning,
} from './sseHelpers.js';
import {
  createMessage,
  getKeptResearchForRetry,
  getRecentThreadSources,
  touchThread,
} from './threadPersistenceService.js';

import type { SSEEmitter, SSEWriter, SearchResultPayload } from './sseHelpers.js';
import type {
  ChatGraphState,
  GeneratedImageResult,
  ImageAttachment,
  PendingAction,
  SearchIntent,
  SearchResult,
  SocialPostPayload,
} from '../../../agents/langgraph/ChatGraph/types.js';
import type { ModelMessage } from 'ai';
import type { Request } from 'express';

const log = createLogger('ChatGraphController');

/** Human label for a `<kind>:<id>` source key, for user- and model-facing copy. */
const SOURCE_KIND_LABELS: Record<string, string> = {
  wolke: 'Wolke-Datei',
  connect: 'verbundene Datei',
  doc_mention: 'verlinktes Dokument',
  notebook: 'Notizbuch',
};

function labelForSource(source: string): string {
  const kind = source.split(':')[0] ?? '';
  return SOURCE_KIND_LABELS[kind] ?? 'Quelle';
}

/**
 * Report sources the user explicitly attached that could not be read.
 *
 * Feeds BOTH channels from one fact: the warning is the telemetry signal, the
 * degradation note makes the answer itself say which source is missing —
 * otherwise the model quietly answers as though the file had never existed.
 */
export function reportUnavailableSources(
  sse: SSEWriter,
  state: ChatGraphState,
  sources: string[],
  needsReauth = false
): void {
  const labels = [...new Set(sources.map(labelForSource))].join(', ');
  // An expired connection is the one case the user can fix, so it gets its own
  // code and an actionable message instead of "try again later".
  if (needsReauth) {
    sendChatWarning(
      sse,
      'connect_reauth_required',
      `${labels}: Die Verbindung ist abgelaufen — bitte in den Einstellungen neu verbinden.`
    );
  } else {
    sendChatWarning(
      sse,
      'source_unavailable',
      `${labels} konnte nicht gelesen werden — die Antwort entstand ohne diese Quelle.`
    );
  }
  state.degradationNotes = [
    ...(state.degradationNotes ?? []),
    {
      code: needsReauth ? 'connect_reauth_required' : 'source_unavailable',
      modelHint: needsReauth
        ? `Die Verbindung zu dieser Quelle ist abgelaufen: ${labels}. Sag das ehrlich und weise darauf hin, dass sie in den Einstellungen neu verbunden werden muss.`
        : `Diese vom Nutzer angegebene(n) Quelle(n) konnten NICHT gelesen werden: ${labels}. Sag das ehrlich und tu nicht so, als hättest du ihren Inhalt gesehen.`,
    },
  ];
}

// The generation cores moved to artifactGeneration.ts (so the per-kind table
// can use them without an import cycle). Re-exported here because the loop's
// fat tools, the MCP server factory and the board agent flow all import them
// from this module — and because they are the seam both chat paths share.
export {
  pdfKindFromText,
  runBoardGeneration,
  runDocGeneration,
  runPdfGeneration,
} from './artifactGeneration.js';

/**
 * @board-erstellen. Unlike the others the topic is derived here: the board
 * branch predates the router-side resolution and still receives the raw
 * message.
 */
export async function handleBoardCreation(
  opts: Omit<CreateTurnOpts, 'userContent'> & { lastUserMessage: ModelMessage | undefined }
): Promise<boolean> {
  const lastUserText = opts.lastUserMessage ? extractTextContent(opts.lastUserMessage.content) : '';
  // A referential follow-up ("mach ein Board davon") names no subject; the
  // classifier resolved one against the history, with the heuristic as fallback
  // for turns that never reached the LLM.
  const userContent =
    opts.classifiedState.creationTopic ||
    resolveReferentialTopic(lastUserText, opts.classifiedState.messages ?? []).text;
  return runCreateTurn(BOARD_SPEC, { ...opts, userContent });
}

/**
 * create_sheet / @sheet-erstellen. Shape and SSE contract live in
 * runCreateTurn + SHEET_SPEC; this keeps the call-site name stable.
 */
export async function handleSheetCreation(opts: CreateTurnOpts): Promise<boolean> {
  return runCreateTurn(SHEET_SPEC, opts);
}

/**
 * edit_sheet — Tier-2.7 follow-up on a chat-created sheet ("mach die erste
 * Zeile fett"). Plans typed ops with the same planner the in-editor AI
 * assistant uses (generateSheetOperations) and hands them to the client as an
 * `editor_operations` SSE event, same shape as the agentic loop's edit tool
 * (editorTools.ts). No server-side op execution here — only the client's live
 * Univer instance computes styles/formulas correctly; ArtifactPanel relays
 * the event into the docked sheet-editor iframe via postMessage, which
 * applies it through the same applySheetOperations() the in-editor assistant
 * uses. If the sheet isn't open anywhere, the client's existing "no handler
 * registered" fallback tells the user to open it — there is deliberately no
 * second, less-correct execution path for that case.
 */
export async function handleSheetEdit(opts: {
  sse: SSEWriter;
  classifiedState: ChatGraphState;
  actualThreadId?: string;
  userId: string;
  userContent: string;
}): Promise<boolean> {
  const { sse, classifiedState, actualThreadId, userId, userContent } = opts;
  const sheetId = classifiedState.sheetEditId;

  sse.send('response_start', { message: 'Bearbeite Tabelle...' });

  const fail = async (text: string): Promise<boolean> => {
    sse.send('text_delta', { text });
    await finishEditTurn({
      sse,
      threadId: actualThreadId ?? null,
      text,
      intent: 'edit_sheet',
      persistLabel: 'editSheet:persist',
      logPrefix: '[SheetEdit]',
      startTime: classifiedState.startTime,
      classificationTimeMs: classifiedState.classificationTimeMs,
      streamed: true,
    });
    return true;
  };

  if (!sheetId) {
    return fail(
      'Ich konnte die Tabelle nicht zuordnen. Öffne sie kurz, dann kann ich sie bearbeiten.'
    );
  }

  if (!(await checkDocumentWriteAccess(sheetId, userId))) {
    return fail('Du hast keine Bearbeitungsrechte für diese Tabelle.');
  }

  const state = await loadSheetState(sheetId, userId);
  if (!state) {
    return fail('Ich konnte die Tabelle nicht finden — vielleicht wurde sie gelöscht.');
  }

  const planned = await planEditorOps({
    log,
    logLabel: '[SheetEdit]',
    plan: () =>
      generateSheetOperations({
        userPrompt: userContent,
        sheetContext: formatSheetAsContext(state),
        referenceContent: null,
      }),
  });

  if (!planned.ok) {
    return fail(
      planned.reason === 'planning_failed'
        ? 'Die Änderung an der Tabelle konnte nicht geplant werden. Versuch es bitte noch einmal.'
        : 'Ich konnte daraus keine konkrete Tabellen-Änderung ableiten. Beschreib bitte genauer, was sich ändern soll.'
    );
  }

  const { operations, summary } = planned;
  const responseText = `Ich habe die Änderung an **"${state.title}"** vorbereitet (${summary}).`;
  streamTextInChunks(sse, responseText);

  emitEditorOperations(sse, 'sheet', sheetId, operations, summary);
  log.info(`[SheetEdit] planned ${operations.length} op(s) for sheet ${sheetId}`);

  if (actualThreadId) {
    await rememberArtifact(actualThreadId, 'sheet', sheetId, state.title);
  }

  await finishEditTurn({
    sse,
    threadId: actualThreadId ?? null,
    text: responseText,
    intent: 'edit_sheet',
    persistLabel: 'editSheet:persist',
    logPrefix: '[SheetEdit]',
    startTime: classifiedState.startTime,
    classificationTimeMs: classifiedState.classificationTimeMs,
    streamed: true,
  });
  return true;
}

/** create_presentation / @praesentation-erstellen. */
export async function handlePresentationCreation(opts: CreateTurnOpts): Promise<boolean> {
  return runCreateTurn(PRESENTATION_SPEC, opts);
}

/** create_pdf / @pdf-erstellen — produces a finished, downloadable file. */
export async function handlePdfCreation(
  opts: CreateTurnOpts & { userLocale: 'de-DE' | 'de-AT' }
): Promise<boolean> {
  return runCreateTurn(PDF_SPEC, opts);
}

// ── EXPERIMENTAL: create_recurring_task ────────────────────────────────────────

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
  aiWorkerPool: ChatGraphState['aiWorkerPool'];
  req: Express.Request;
  actualThreadId?: string;
  userId: string;
  userContent: string;
  agentId?: string | null;
  userLocale: 'de-DE' | 'de-AT';
}): Promise<boolean> {
  const { sse, classifiedState, aiWorkerPool, req, actualThreadId, userId, userContent } = opts;

  try {
    const genResult = await aiWorkerPool.processRequest(
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

/**
 * Document creation, in two genuinely different modes.
 *
 * The default mode OWNS the turn and is an ordinary entry in the artifact
 * table. `skipTerminate` (save_as_doc) does NOT: it writes the card and text
 * into a stream its caller already opened and will close, so it deliberately
 * emits no `done`, persists no message and returns false on failure to let the
 * caller decide. Keeping the fork explicit at the top beats the previous
 * version, where `if (!skipTerminate)` was threaded through 167 lines.
 */
export async function generateAndCreateDocument(opts: {
  sse: SSEWriter;
  classifiedState: ChatGraphState;
  aiWorkerPool: ChatGraphState['aiWorkerPool'];
  req: Express.Request;
  actualThreadId?: string;
  userId: string;
  userContent: string;
  subtypeOverride?: string | null;
  conversationContext?: string;
  intent: string;
  skipTerminate?: boolean;
}): Promise<boolean> {
  const spec = makeDocumentSpec({
    intent: opts.intent,
    subtypeOverride: opts.subtypeOverride ?? null,
    ...(opts.conversationContext != null && { conversationContext: opts.conversationContext }),
  });
  if (!opts.skipTerminate) return runCreateTurn(spec, opts);
  return contributeDocumentToOpenTurn(spec, opts);
}

/**
 * save_as_doc: contribute a document to a turn somebody else owns.
 *
 * Emits the same text + card as the owning path so the chat looks identical,
 * remembers the artifact (this path never reaches persistAssistantResponse's
 * deriveToolContext, so without it the follow-up edit gate has no target), and
 * then stops — no `done`, no message, no `sse.end()`.
 */
async function contributeDocumentToOpenTurn(
  spec: ReturnType<typeof makeDocumentSpec>,
  opts: CreateTurnOpts
): Promise<boolean> {
  const { sse, aiWorkerPool, req, userId, userContent, actualThreadId } = opts;
  try {
    const doc = await spec.generate({ aiWorkerPool, req, userId, userContent }, () => {});
    if (!doc) return false;

    emitArtifactResult(sse, spec, doc);
    log.info(`[ChatGraph] Document created (${spec.intent}): "${doc.title}" (${doc.documentId})`);

    const contextKind =
      typeof spec.contextKind === 'function' ? spec.contextKind(doc) : spec.contextKind;
    await rememberArtifact(actualThreadId, contextKind, doc.documentId, doc.title);
    return true;
  } catch (err) {
    log.error(
      `[ChatGraph] Document creation failed (${spec.intent}): ${err instanceof Error ? err.message : String(err)}`
    );
    return false;
  }
}

/**
 * Handle share_doc intent (short-circuit — no LLM response needed).
 * Returns true if handled (caller should return early).
 */
export async function handleShareDoc(opts: {
  sse: SSEWriter;
  classifiedState: ChatGraphState;
  actualThreadId: string;
  userId: string;
  lastUserMessage?: ModelMessage;
  rawDocMentionIds?: string[];
  rawDocumentChatIds?: string[];
}): Promise<boolean> {
  const {
    sse,
    classifiedState,
    actualThreadId,
    userId,
    lastUserMessage,
    rawDocMentionIds,
    rawDocumentChatIds,
  } = opts;

  const shareDocDoneMeta = {
    intent: classifiedState.intent,
    searchCount: 0,
    totalTimeMs: Date.now() - classifiedState.startTime,
    classificationTimeMs: classifiedState.classificationTimeMs,
    searchTimeMs: 0,
  };

  async function sendShareDocError(text: string) {
    sse.send('response_start', { message: 'Antwort wird erstellt...' });
    sse.send('text_delta', { text });
    await createMessage(actualThreadId, 'assistant', text);
    await touchThread(actualThreadId);
    sse.send('done', { threadId: actualThreadId, citations: [], metadata: shareDocDoneMeta });
    sse.end();
  }

  const { targetGroupName } = classifiedState;
  if (!targetGroupName) {
    await sendShareDocError(
      'Bitte gib an, mit welcher Gruppe du das Dokument teilen möchtest. Beispiel: „Teile das mit AG Umwelt"'
    );
    return true;
  }

  const docId = rawDocMentionIds?.[0] || rawDocumentChatIds?.[0] || null;
  if (!docId) {
    await sendShareDocError(
      'Kein Dokument gefunden. Bitte erwähne ein Dokument mit @Dokument oder erstelle zuerst eins.'
    );
    return true;
  }

  const { getPostgresInstance } = await import('../../../database/services/PostgresService.js');
  const pg = getPostgresInstance();

  const [docRows, userGroups] = await Promise.all([
    pg.query('SELECT title FROM collaborative_documents WHERE id = $1 AND is_deleted = false', [
      docId,
    ]) as Promise<{ title: string }[]>,
    pg.query(
      `SELECT g.id, g.name FROM groups g
       INNER JOIN group_memberships gm ON gm.group_id = g.id
       WHERE gm.user_id = $1 ORDER BY g.name ASC`,
      [userId]
    ) as Promise<{ id: string; name: string }[]>,
  ]);

  if (!docRows.length) {
    await sendShareDocError('Das referenzierte Dokument wurde nicht gefunden.');
    return true;
  }

  const docTitle = docRows[0].title || 'Unbenanntes Dokument';

  if (userGroups.length === 0) {
    await sendShareDocError(
      'Du bist noch keiner Gruppe beigetreten. Erstelle oder tritt einer Gruppe bei, um Dokumente zu teilen.'
    );
    return true;
  }

  const groupNames = userGroups.map((g) => g.name);
  const match = findBestMatch(targetGroupName, groupNames, 0.5);
  const matchedGroup = match ? userGroups.find((g) => g.name === match.match) : null;

  if (!matchedGroup) {
    const groupList = groupNames.map((n) => `• ${n}`).join('\n');
    await sendShareDocError(
      `Keine passende Gruppe für „${targetGroupName}" gefunden.\n\nDeine Gruppen:\n${groupList}`
    );
    return true;
  }

  const lastUserText = lastUserMessage
    ? extractTextContent(lastUserMessage.content).toLowerCase()
    : '';
  const isReadOnly = /nur lesen|read.?only|leserecht|ansehen|viewer|lesezugriff/.test(lastUserText);
  const permissionLevel = isReadOnly ? ('viewer' as const) : ('editor' as const);
  const permissionLabel = permissionLevel === 'editor' ? 'Bearbeiten' : 'Nur lesen';

  const pendingAction: PendingAction = {
    actionId: `action_${Date.now()}`,
    threadId: actualThreadId,
    userId,
    title: 'Dokument teilen',
    preview: `${docTitle} → ${matchedGroup.name}`,
    createdAt: Date.now(),
    type: 'share_doc',
    payload: {
      docId,
      docTitle,
      groupId: matchedGroup.id,
      groupName: matchedGroup.name,
      permissionLevel,
    },
  };

  sse.send('response_start', { message: 'Antwort wird erstellt...' });
  const responseText = `Dokument **„${docTitle}"** mit **${matchedGroup.name}** teilen (${permissionLabel}):`;
  sse.send('text_delta', { text: responseText });
  await createMessage(actualThreadId, 'assistant', responseText);
  await touchThread(actualThreadId);

  const ssePayload = CONFIRM_ACTION_CONFIG[pendingAction.type];
  sse.send('confirm_action', {
    actionId: pendingAction.actionId,
    type: pendingAction.type,
    title: ssePayload.title,
    description: ssePayload.description,
    icon: ssePayload.icon,
    metadata: [
      { key: 'Dokument', value: docTitle },
      { key: 'Gruppe', value: matchedGroup.name },
      { key: 'Berechtigung', value: permissionLabel },
    ],
    confirmLabel: ssePayload.confirmLabel,
    cancelLabel: 'Abbrechen',
    threadId: actualThreadId,
  });

  await pendingActionStore.store(pendingAction);
  log.info(
    `[ChatGraph] Share confirm action stored: ${pendingAction.actionId} (${docTitle} → ${matchedGroup.name})`
  );

  sse.send('done', { threadId: actualThreadId, citations: [], metadata: shareDocDoneMeta });
  sse.end();
  return true;
}

/**
 * Sharepic-variant generation shared by the `sharepic` intent and the
 * sharepic half of the EXPERIMENTAL `social_post` intent. Emits its own
 * `sharepic_complete` (including error payloads) and returns the variants
 * ([] on failure) so callers never have to duplicate the SSE handling.
 */
/**
 * The material a sharepic is built from: the thread transcript plus whatever
 * research the thread already carries.
 *
 * This is the same briefing `runCreateTurn` gives documents, sheets and
 * presentations — the sharepic lane never went through it, so `{{details}}` in
 * every sharepic template stayed empty on fresh generations and the model had
 * to invent the substance behind a three-word topic.
 *
 * Never throws: a sharepic without background is the old behaviour, a 500 is
 * not.
 */
async function buildSharepicBackground(
  state: ChatGraphState,
  threadId: string | null
): Promise<string | null> {
  const transcript = buildCreateTurnContext(state.messages ?? [], SHAREPIC_CONTEXT_CHARS);
  let background = transcript.trim();
  if (threadId) {
    try {
      const carried = await getRecentThreadSources(threadId, 6);
      if (carried.length > 0) {
        background = withResearchedSources(background, renderSourceLines(carried));
      }
    } catch (err) {
      log.warn(`[Sharepic] source briefing skipped: ${err instanceof Error ? err.message : err}`);
    }
  }
  return background || null;
}

export async function runSharepicGeneration(opts: {
  state: ChatGraphState;
  sse: SSEWriter;
  req?: Request | undefined;
  threadId?: string | null;
  sharepicRefinement?: { instruction: string; prior: PriorSharepic };
  /**
   * Receives `sharepic_complete` instead of the live stream. The social_post
   * branch passes a buffer so the graphic can still be revoked if the text half
   * turns out to be a refusal (fabricated-quote gate).
   */
  emitTo?: SSEEmitter;
}): Promise<SharepicVariant[]> {
  const { state, sse } = opts;
  const emit = opts.emitTo ?? sse;
  try {
    const lastMsg = state.messages?.[state.messages.length - 1];
    const rawText = lastMsg ? extractTextContent(lastMsg.content) : '';
    const messageText = rawText.replace(/@sharepic\b/gi, '').trim();
    const refinement = opts.sharepicRefinement;
    const preferredVariant = refinement ? null : detectPreferredVariant(messageText);
    // WHAT it is about. A follow-up like "jetzt noch ein normales sharepic"
    // names no subject, so the classifier resolves one against the history —
    // it already runs on exactly these vague turns with the conversation in
    // context. `resolveReferentialTopic` is the fallback for turns that never
    // reached the LLM (heuristic classification, forced tools). Variant
    // preference is still read from the CURRENT message above.
    const resolvedTopic = refinement
      ? { text: messageText, inherited: false }
      : state.creationTopic
        ? { text: state.creationTopic, inherited: true }
        : resolveReferentialTopic(messageText, state.messages ?? []);
    const topicText = resolvedTopic.text;

    // WHAT it is built FROM. Same thread transcript + carried research the
    // document/sheet/presentation generators get from runCreateTurn; a sharepic
    // condenses far harder, hence the smaller window.
    const background = refinement
      ? null
      : await buildSharepicBackground(state, opts.threadId ?? null);

    // Quote sharepics are attributed to the person creating them — default the
    // author to the user's profile display name. Empty when no profile name
    // exists, in which case the quote renders without an author line.
    const authorName = await resolveSharepicAuthorName(state.agentConfig?.userId);

    log.info(
      `[ChatGraph] Sharepic topic: "${topicText.slice(0, 100)}"${resolvedTopic.inherited ? ` (resolved from context, message was "${messageText.slice(0, 60)}")` : ''}, ` +
        `background: ${background ? `${background.length} chars` : 'none'}, ` +
        `${refinement ? `refinement: "${refinement.instruction}" (${refinement.prior.canvasType})` : `preferredVariant: ${preferredVariant ?? 'all'}`}, ` +
        `author: ${authorName || '(none)'}`
    );

    if (!opts.req) throw new Error('Express request required for sharepic generation');
    // Slider = multi-page deck, a different artifact: ONE deck variant,
    // minted at generation time (studio open/editing need the pages).
    let variants: SharepicVariant[];
    let declinedReason: string | null = null;
    if (preferredVariant === 'slider') {
      const userId = state.agentConfig?.userId;
      if (!userId) throw new Error('User required for slider deck creation');
      variants = [
        await generateSliderDeckVariant({
          req: opts.req,
          text: topicText,
          threadId: opts.threadId ?? null,
          userId,
        }),
      ];
    } else {
      const generated = await generateSharepicVariants({
        req: opts.req as SharepicExpressRequest,
        text: topicText,
        ...(refinement ? { refinement } : preferredVariant ? { preferredVariant } : {}),
        ...(background && { background }),
        ...(authorName && { authorName }),
        ...(state.userLocale && { userLocale: state.userLocale }),
      });
      variants = generated.variants;
      declinedReason = generated.declinedReason;
    }

    if (variants.length === 0) {
      // A policy decline is not an outage. The combined social_post path already
      // says so ("dabei entstünde ein erfundenes Zitat…"); the pure sharepic
      // path used to report the model's correct refusal as a technical failure,
      // which invites the user to simply try again.
      if (declinedReason) {
        log.info(`[ChatGraph] Sharepic declined on policy grounds — ${declinedReason}`);
        emit.send('sharepic_complete', {
          message: `Dieses Sharepic kann ich nicht erstellen: ${declinedReason}`,
          variants: [],
          declined: true,
        });
        return [];
      }
      emit.send('sharepic_complete', {
        message: 'Sharepic-Erstellung fehlgeschlagen',
        variants: [],
        error: 'All variant generations failed',
      });
      return [];
    }
    emit.send('sharepic_complete', {
      message: `${variants.length} Sharepic-Varianten erstellt`,
      variants,
    });
    return variants;
  } catch (error) {
    log.error('[ChatGraph] Sharepic variant generation failed:', error);
    emit.send('sharepic_complete', {
      message: 'Sharepic-Erstellung fehlgeschlagen',
      variants: [],
      error: toUserFacingMessage(error, 'Unknown error'),
    });
    return [];
  }
}

/**
 * Ground a vague continuation on the research this thread already paid for.
 *
 * A `direct` turn skips the whole retrieval block in executeIntentPipeline, so
 * "Mehr dazu bitte" after a sourced answer arrived with NO sources — and the
 * model regenerated from its own previous prose: ungrounded, uncitable, and to
 * the reader indistinguishable from research. Same helper and same reasoning
 * the agentic loop (agenticRespondService) and the artifact-creating turns
 * (createTurn) already use.
 *
 * Called AFTER the intent loop, never as a branch inside it: a `direct` turn
 * with a secondaryIntent runs two iterations, and a branch would carry sources
 * on the first only to have the real search overwrite them on the second.
 *
 * Self-limiting: a thread with no prior research returns [] and this is a
 * no-op, so the extra query only ever buys something on turns that were about
 * those sources. Never throws — an ungrounded answer beats a 500.
 *
 * Note the carried sources are re-persisted as THIS turn's searchResults, which
 * extends how far back getRecentThreadSources reaches in a long continuation
 * thread. That is a memory horizon, not a correctness bug, but it is why the
 * predicate demands an anaphor: topical continuity is the licence.
 */
/**
 * Which verdicts may inherit the thread's earlier research.
 *
 * `produktion` is the one that matters now: the classifier prompt sends a
 * reference to THIS running conversation there ("vorhin", "deine letzte
 * Antwort"), which is exactly the "Mehr dazu bitte" shape this carry was built
 * for. `direct` stays because the parser and the heuristic can still produce
 * it. `greeting` is absent on purpose — a greeting has nothing to ground — and
 * so is `agentic`, which does its own retrieval inside the loop and would
 * otherwise start every turn with a stale source block.
 *
 * That set is `isGroundableProse`: the `prose` disposition without `greeting`,
 * derived in `@gruenerator/shared/chat-intents`. `agentic` is excluded by the
 * disposition itself (it is `loop`, not `prose`), so only the `greeting` cut
 * needs stating — and it is stated there, once, instead of here for the third
 * time.
 */
export async function carryThreadSourcesIfNeeded(
  state: ChatGraphState,
  threadId: string | null
): Promise<ChatGraphState> {
  if (!isGroundableProse(state.intent) || state.searchResults.length > 0 || !threadId) return state;
  const lastUser = [...state.messages].reverse().find((m) => m.role === 'user');
  if (!needsThreadGrounding(lastUser ? extractTextContent(lastUser.content) : '')) return state;
  try {
    // 6, not the default 10: a continuation asks for depth on a known topic,
    // not a fresh dossier.
    const carried = await getRecentThreadSources(threadId, 6);
    if (carried.length === 0) return state;
    log.info(`[Direct] grounded on ${carried.length} prior source(s) from this thread`);
    return {
      ...state,
      searchResults: carried,
      citations: buildCitations(carried),
      sourcesCarriedFromThread: true,
    };
  } catch (err) {
    log.warn(`[Direct] source carry skipped: ${err instanceof Error ? err.message : err}`);
    return state;
  }
}

export async function executeIntentPipeline(opts: {
  classifiedState: ChatGraphState;
  sse: SSEWriter;
  forcedTool: boolean;
  enabledTools?: Record<string, boolean>;
  imageAttachments: ImageAttachment[];
  req?: Request;
  /** Thread id for deck mints (chat_thread_canvases binding). */
  threadId?: string | null;
  /** When set, the sharepic branch refines the previous sharepic instead of starting fresh. */
  sharepicRefinement?: { instruction: string; prior: PriorSharepic };
}): Promise<{
  finalState: ChatGraphState;
  generatedImage: GeneratedImageResult | null;
  sharepicVariants: SharepicVariant[];
  /** Text half of the EXPERIMENTAL social_post intent; null otherwise. */
  socialPost: SocialPostPayload | null;
  /** The text model refused: no post, no sharepic, and no success copy. */
  socialPostRefused: boolean;
  /** Whether that refusal is backed by a POLICY decline (the sharepic half
   *  declined too) rather than only by the text half failing. Drives which
   *  explanation the turn's answer gives — see the gate for the reasoning. */
  socialPostRefusalIsPolicy: boolean;
}> {
  const { classifiedState, sse, forcedTool, enabledTools, imageAttachments } = opts;

  let finalState = classifiedState;
  let generatedImage: GeneratedImageResult | null = null;
  let sharepicVariants: SharepicVariant[] = [];
  let socialPost: SocialPostPayload | null = null;
  let socialPostRefused = false;
  let socialPostRefusalIsPolicy = false;

  // Build ordered list of intents to execute (primary first, then secondary).
  // social_post handles pasted URLs inline BEFORE text generation — a
  // trailing scrape_url iteration would crawl after the post is written.
  const intentsToExecute: SearchIntent[] = [classifiedState.intent];
  if (
    classifiedState.secondaryIntent &&
    classifiedState.secondaryIntent !== classifiedState.intent &&
    !(classifiedState.intent === 'social_post' && classifiedState.secondaryIntent === 'scrape_url')
  ) {
    intentsToExecute.push(classifiedState.secondaryIntent);
    log.info(`[ChatGraph] Multi-intent: ${intentsToExecute.join(' → ')}`);
  }

  // Sources already gathered by an earlier iteration of this loop, so a second
  // search branch unions instead of replacing (see the merge below).
  let priorIntentResults: SearchResult[] = [];

  for (const currentIntent of intentsToExecute) {
    log.info(
      `[ChatGraph] Stage 2 — intent=${currentIntent}, forcedTool=${forcedTool}, enabledTools.image=${enabledTools?.['image']}`
    );
    if (currentIntent === 'image') {
      const imageToolEnabled = forcedTool || enabledTools?.['image'] !== false;
      log.info(
        `[ChatGraph] Image branch — imageToolEnabled=${imageToolEnabled}, userId=${classifiedState.agentConfig.userId}, BFL_KEY_SET=${!!env.BFL_API_KEY}`
      );
      if (imageToolEnabled) {
        sse.send('image_start', { message: PROGRESS_MESSAGES.imageStart });
        const imageResult = await imageNode(finalState);
        log.info(
          `[ChatGraph] imageNode result — hasImage=${!!imageResult.generatedImage}, error=${imageResult.error || 'none'}, timeMs=${imageResult.imageTimeMs}`
        );
        finalState = { ...finalState, ...imageResult } as ChatGraphState;

        if (finalState.generatedImage) {
          generatedImage = finalState.generatedImage;
          sse.send('image_complete', {
            message: PROGRESS_MESSAGES.imageComplete,
            image: generatedImage,
          });
        } else if (finalState.error) {
          sse.send('image_complete', {
            message: PROGRESS_MESSAGES.imageError(finalState.error),
            error: finalState.error,
          });
        }
      }
    } else if (currentIntent === 'image_edit') {
      const imageEditToolEnabled = forcedTool || enabledTools?.['image_edit'] !== false;
      if (imageEditToolEnabled) {
        if (!imageAttachments || imageAttachments.length === 0) {
          sse.send('image_complete', {
            message: PROGRESS_MESSAGES.imageEditNoAttachment,
            error: PROGRESS_MESSAGES.imageEditNoAttachment,
          });
        } else {
          sse.send('image_start', { message: PROGRESS_MESSAGES.imageEditStart });
          const imageEditResult = await imageEditNode(finalState);
          finalState = { ...finalState, ...imageEditResult } as ChatGraphState;

          if (finalState.generatedImage) {
            generatedImage = finalState.generatedImage;
            sse.send('image_complete', {
              message: PROGRESS_MESSAGES.imageEditComplete,
              image: generatedImage,
            });
          } else if (finalState.error) {
            sse.send('image_complete', {
              message: PROGRESS_MESSAGES.imageError(finalState.error),
              error: finalState.error,
            });
          }
        }
      }
    } else if (currentIntent === 'sharepic') {
      sse.send('image_start', { message: 'Erstelle Sharepic-Varianten...' });
      sharepicVariants = await runSharepicGeneration({
        state: finalState,
        sse,
        req: opts.req,
        threadId: opts.threadId ?? null,
        ...(opts.sharepicRefinement && { sharepicRefinement: opts.sharepicRefinement }),
      });
    } else if (currentIntent === 'social_post') {
      // A post is TEXT ONLY unless the user named a sharepic ("Post mit
      // Sharepic"). Producing a branded graphic for every "schreib einen
      // Insta-Post zu X" was the largest source of sharepics nobody asked for.
      // When a sharepic IS wanted, both halves run in parallel and each emits
      // its SSE event as soon as it resolves (text usually lands first, so the
      // card shows it while thumbnails render).
      //
      // Read from finalState.messages, not from the router's
      // lastUserTextNoMentions: the resume path appends the answered
      // clarification as a NEW user message (resumePipeline), so the original
      // "mit Sharepic" wording is still the last user turn there and that path
      // needs no separate handling.
      const sharepicToolAllowed = forcedTool || enabledTools?.['sharepic'] !== false;
      const lastUserMsg = [...finalState.messages].reverse().find((m) => m.role === 'user');
      const wantsSharepic =
        sharepicToolAllowed &&
        hasExplicitSharepicWord(lastUserMsg ? extractTextContent(lastUserMsg.content) : '');
      sse.send('image_start', {
        message: wantsSharepic ? 'Texte und gestalte deinen Post...' : 'Texte deinen Post...',
      });

      // The sharepic half streams `sharepic_complete` itself, so its output is
      // buffered until the text half is known: a graphic must never ship when
      // the text model refused the request (live: an invented Kickl quote with
      // an invented ORF source rendered in party design while the text said
      // "I'm sorry, but I can't help with that"). Buffering keeps both halves
      // parallel — the gate costs no latency, only revocability.
      const sharepicBuffer = createDeferredSSE();
      const postBuffer = createDeferredSSE();
      const sharepicHalf: Promise<SharepicVariant[]> = wantsSharepic
        ? runSharepicGeneration({
            state: finalState,
            sse,
            req: opts.req,
            threadId: opts.threadId ?? null,
            emitTo: sharepicBuffer,
          })
        : Promise.resolve([]);

      const stateForText = finalState;
      const textHalf: Promise<{
        state: ChatGraphState;
        post: SocialPostPayload;
      }> = (async () => {
        // Pasted URLs must ground the text ("schreib einen Tweet zu <URL>"),
        // so crawl them HERE, before generation — the secondary-intent loop
        // iteration would run only after the text already exists (it is
        // skipped for social_post, see intentsToExecute above).
        let urlContext: ChatGraphState['searchResults'] = [];
        if ((stateForText.detectedUrls?.length ?? 0) > 0) {
          try {
            const scrape = await searchNode({
              ...stateForText,
              intent: 'scrape_url',
            } as ChatGraphState);
            urlContext = scrape.searchResults ?? [];
          } catch (error) {
            log.warn(`[ChatGraph] social_post URL crawl failed: ${error}`);
          }
        }
        // Ground the text on real posts (same retrieval as `examples`) —
        // unless the agent/user disabled the examples tool; the composer
        // prompt handles zero examples ("Keine Vorlagen verfügbar"). A
        // failed search degrades the same way.
        let textState = stateForText;
        const examplesEnabled = forcedTool || enabledTools?.['examples'] !== false;
        if (examplesEnabled) {
          try {
            const searchResult = await searchNode(stateForText);
            textState = { ...stateForText, ...searchResult } as ChatGraphState;
          } catch (error) {
            log.warn(`[ChatGraph] social_post examples search failed: ${error}`);
          }
        }
        if (urlContext.length > 0) {
          // Keep crawled pages on state too so citations persist with the turn.
          textState = {
            ...textState,
            searchResults: [...(textState.searchResults ?? []), ...urlContext],
            citations: [...(textState.citations ?? []), ...buildCitations(urlContext)],
          } as ChatGraphState;
        }
        const { generateSocialPostText } = await import('./socialPostService.js');
        const post = await generateSocialPostText({
          state: textState,
          urlContext,
          ...(opts.req && { req: opts.req }),
        });
        postBuffer.send('social_post_complete', {
          message: `${post.platform === 'generic' ? 'Social-Media' : post.platform}-Post erstellt`,
          post,
        });
        return { state: textState, post };
      })();

      const [variantsSettled, textSettled] = await Promise.allSettled([sharepicHalf, textHalf]);

      // The gate: a refusal from the text model invalidates the whole turn, not
      // just its own half. Both buffers are dropped so no graphic, no download
      // button and no success copy survive the refusal.
      const refusedText =
        textSettled.status === 'fulfilled' && looksLikeRefusal(textSettled.value.post.text);
      // WHY the text model declined is not something `looksLikeRefusal` can
      // tell us — it only sees that it declined. The sharepic half ran the SAME
      // request through its own ABLEHNUNG channel, so its outcome is the one
      // piece of evidence available: both halves declining is a policy problem,
      // while a text-only decline beside working variants is usually a broken
      // task (live: an unresolvable "Jetzt eine Version davon auf Englisch."
      // made the composer answer "ich kann keinen Post erstellen …", which was
      // then shown to the user as a refusal about FABRICATED QUOTES — a reason
      // that had nothing to do with the request).
      //
      // The gate itself does NOT change: both halves are discarded either way,
      // because a text refusal beside a rendered sharepic is exactly the
      // disinformation case this was built for. Only the explanation adapts to
      // what is actually known.
      //
      // No sharepic half ⇒ no second opinion on the same request ⇒ no evidence
      // that this was a policy decision. `wantsSharepic` is load-bearing here:
      // without it a text-only post would report EVERY refusal as a fabricated
      // quote, which is precisely the false accusation described above.
      const sharepicAlsoDeclined =
        wantsSharepic &&
        (variantsSettled.status !== 'fulfilled' || variantsSettled.value.length === 0);
      if (refusedText) {
        log.warn(
          `[ChatGraph] social_post: text model refused — discarding sharepic variants and post ` +
            `(sharepicAlsoDeclined=${sharepicAlsoDeclined})`
        );
        sharepicBuffer.discard();
        postBuffer.discard();
        socialPostRefused = true;
        socialPostRefusalIsPolicy = sharepicAlsoDeclined;
        sse.send('social_post_complete', {
          message: sharepicAlsoDeclined ? 'Anfrage abgelehnt' : 'Post nicht erstellt',
          error: sharepicAlsoDeclined
            ? 'Diese Anfrage kann ich nicht umsetzen — dabei entstünde ein erfundenes Zitat oder eine irreführende Aussage im Namen der Partei.'
            : 'Daraus konnte ich keinen Post erzeugen. Sag mir bitte konkret, worum es gehen soll — oder worauf du dich beziehst.',
        });
      } else {
        sharepicBuffer.flush(sse);
        postBuffer.flush(sse);
      }

      if (variantsSettled.status === 'fulfilled') {
        sharepicVariants = refusedText ? [] : variantsSettled.value;
      } else if (!refusedText) {
        // Mirror the text half below: without this the sharepic simply never
        // arrived and the turn reported success with only the post text.
        log.error('[ChatGraph] social_post sharepic generation failed:', variantsSettled.reason);
        sse.send('sharepic_complete', {
          message: 'Sharepic konnte nicht erstellt werden',
          variants: [],
          error: 'Das Sharepic konnte nicht erstellt werden — der Text steht trotzdem bereit.',
        });
      }
      if (textSettled.status === 'fulfilled') {
        // A refusal is not a post: leaving it on state would persist it as one
        // and make the router's confirmation line promise a post that isn't there.
        socialPost = refusedText ? null : textSettled.value.post;
        // Keep the examples retrieval on state so persistence/citations work
        // like the examples flow.
        finalState = {
          ...textSettled.value.state,
          ...(socialPost && { socialPostResult: socialPost }),
        } as ChatGraphState;
      } else {
        log.error('[ChatGraph] social_post text generation failed:', textSettled.reason);
        sse.send('social_post_complete', {
          message: 'Post-Text konnte nicht erstellt werden',
          error: textSettled.reason instanceof Error ? textSettled.reason.message : 'Unknown error',
        });
      }
    } else if (currentIntent === 'summary') {
      const docCount =
        (finalState.documentChatIds?.length || 0) + (finalState.documentIds?.length || 0);
      sse.send('summary_start', {
        message: PROGRESS_MESSAGES.summaryStart,
        documentCount: docCount,
      });
      const summaryResult = await summarizeNode(finalState);
      finalState = { ...finalState, ...summaryResult } as ChatGraphState;
      const summaryLength = finalState.summaryContext?.length || 0;
      sse.send('summary_complete', {
        message: PROGRESS_MESSAGES.summaryComplete(summaryLength, finalState.summaryTimeMs || 0),
        summaryLength,
        timeMs: finalState.summaryTimeMs || 0,
      });
    } else if (currentIntent === 'compute') {
      // Deterministic calculation. computeNode runs the math in plain JS and
      // stores the verified result on finalState.computedResult; the respond
      // node then injects it into the prompt so the model only phrases (never
      // recomputes) the number. The `compute` SSE event drives the inline
      // "Berechnung" card so the user sees a tool produced the figure.
      const computeResult = await computeNode(finalState);
      finalState = { ...finalState, ...computeResult } as ChatGraphState;
      if (finalState.computedResult) {
        finalState.computedResultFresh = true;
        sse.send('compute', { compute: finalState.computedResult });
      }
    } else if (currentIntent === 'chat_history') {
      // Recall the user's own past work — chat threads (deep-reading the top
      // match), office documents (docs/presentations/sheets) and reels
      // (subtitled videos, matched on their spoken transcript). Runs its own
      // retrieval (not searchNode, which targets party documents/web).
      const userId = finalState.agentConfig.userId;
      if (userId) {
        sse.send('search_start', { message: 'Durchsuche frühere Inhalte…' });
        const query =
          finalState.searchQuery ||
          (finalState.messages.length
            ? (extractTextContent(
                finalState.messages[finalState.messages.length - 1].content
              ) as string)
            : '');
        const dateFrom = finalState.detectedFilters?.date_from;
        const dateTo = finalState.detectedFilters?.date_to;
        // Space scope: restrict recall to the current Space's chats + roster.
        // null ist hier der definierte Normalfall — ein Thread ohne Space
        // liefert ihn ohnehin.
        const spaceScope = opts.threadId
          ? // swallow-ok: scheitert die Einengung, sucht der Recall ungescopet weiter statt den Turn abzubrechen
            await getSpaceRecallScope(opts.threadId, userId).catch(() => null)
          : null;
        const [rawChats, rawOfficeDocs, rawReels] = await Promise.all([
          recallPastChats(userId, query, {
            limit: 5,
            ...(opts.threadId != null && { excludeThreadId: opts.threadId }),
            ...(dateFrom && { startDate: new Date(`${dateFrom}T00:00:00.000Z`) }),
            // Das Fenster ist INKLUSIV erzeugt (`parseRelativeDateRange`), die
            // SQL-Klausel ist `created_at <= $n`, und `new Date('2026-07-30')`
            // ist Mitternacht. Beides zusammen machte aus jedem Ein-Tages-Fenster
            // („gestern") einen einzigen Zeitpunkt: nur eine Nachricht, die
            // exakt um 00:00:00 UTC geschrieben wurde, konnte noch treffen — und
            // „letzte Woche" verlor den ganzen Sonntag. Genau die „0 Treffer →
            // keine Quellen gefunden"-Antwort, gegen die diese Stufe gebaut ist.
            ...(dateTo && { endDate: new Date(`${dateTo}T23:59:59.999Z`) }),
            ...(spaceScope && { threadIds: spaceScope.threadIds }),
          }),
          // BEKANNTE LÜCKE: das Datumsfenster geht nur an den Chat-Recall.
          // `searchOfficeContent`/`searchReels` nehmen keine Datumsparameter, ein
          // Durchreichen wäre also eine Änderung an beiden Suchdiensten und ihrem
          // SQL — eigener Schnitt. Folge heute: „meine Dokumente vom letzten
          // Monat" filtert die CHATS auf den Monat, die Dokumente und Reels aber
          // nicht. Das untertreibt nie (es fehlt kein Treffer), es übertreibt.
          recallOfficeDocuments(userId, query, 5),
          recallReels(userId, query, 5),
        ]);
        // Cross-source rerank so the most relevant few survive across chats +
        // office content + reels, rather than 5 of each.
        const {
          chats: hits,
          officeDocs,
          reels,
        } = await rerankRecall(query, rawChats, rawOfficeDocs, 6, rawReels);

        const deepRead = hits[0] ? await getThreadRecallContext(hits[0].threadId, userId) : null;

        const searchResults: SearchResult[] = [
          ...hits.map((h) => ({
            source: 'chat_history',
            title: h.threadTitle ?? 'Unbenannter Chat',
            content: h.snippet,
            url: `/chat/${h.threadSlugSuffix ? buildChatThreadSlug(h.threadTitle, h.threadSlugSuffix) : h.threadId}`,
          })),
          ...officeDocs.map((d) => ({
            source: 'office_document',
            title: d.title ?? 'Unbenanntes Dokument',
            content: d.snippet || d.kind,
            url: d.url,
          })),
          ...reels.map((r) => ({
            source: 'reel',
            title: r.title,
            content: r.snippet || 'Reel',
            url: r.url,
          })),
        ];

        const contextBlocks = [
          spaceScope?.rosterBlock ?? '',
          hits.length ? formatPastChatsBlock(hits, deepRead) : '',
          formatOfficeDocsBlock(officeDocs),
          formatReelsBlock(reels),
        ].filter(Boolean);
        finalState = {
          ...finalState,
          searchResults,
          chatHistoryContext: contextBlocks.length ? contextBlocks.join('\n\n') : null,
        } as ChatGraphState;

        const payloadResults: SearchResultPayload[] = searchResults.map((r) => ({
          source: r.source,
          title: r.title,
          content: r.content,
          ...(r.url != null && { url: r.url }),
        }));
        sse.send('search_complete', {
          message: PROGRESS_MESSAGES.searchComplete(searchResults.length),
          resultCount: searchResults.length,
          results: payloadResults,
        });
      }
    } else if (
      currentIntent !== 'produktion' &&
      currentIntent !== 'direct' &&
      currentIntent !== 'greeting' &&
      currentIntent !== 'save_as_doc' &&
      currentIntent !== 'modify_doc' &&
      currentIntent !== 'modify_board'
    ) {
      const toolEnabled = forcedTool || enabledTools?.[currentIntent] !== false;
      if (toolEnabled) {
        // `intent` must follow the LOOP, not the classifier's primary verdict.
        // searchNode switches on `state.intent`, and the state threaded through
        // here still carried the primary — so a secondary search intent ran the
        // PRIMARY branch a second time. Live: "<tagesschau-URL> zusammenfassen"
        // classified web → scrape_url and issued the identical Linkup search
        // twice (paid, ~2 s each) while the pasted page was never crawled.
        let searchInputState = { ...finalState, intent: currentIntent } as ChatGraphState;

        // @deepresearch has two engines, tried in this order. Both replace BOTH
        // halves of the turn — retrieval and synthesis — and must therefore skip
        // everything below, not just the search node: reranking reorders
        // `searchResults`, and a finished answer's [N] point at the original
        // order. For both, `null` means "not served" (quota spent, no key,
        // failed run) and falls through to the next one, with the warning
        // already sent.

        // First the agent, whenever it can run at all: it answers with a DOCUMENT
        // rather than a dossier, so on success there is nothing to rerank and no
        // source list to emit — only the short summary it put in
        // `deepResearchAnswer`.
        let allowanceGone = false;
        if (searchInputState.deepResearchRequested === true) {
          const outcome = await runDeepAgentTurn({ state: searchInputState, sse });
          if (outcome.kind === 'served') {
            finalState = { ...searchInputState, ...outcome.state } as ChatGraphState;
            continue;
          }
          // Both engines meter through one Redis key, the agent's limit being
          // the higher one. A spent agent allowance therefore also exceeds the
          // dossier path's — skipping it saves a doomed call and, more to the
          // point, a second warning naming a different number.
          allowanceGone = outcome.kind === 'quota_spent';
        }

        // Then Linkup's one-shot dossier, the path that always existed.
        if (searchInputState.deepResearchRequested === true && !allowanceGone) {
          const dossier = await runDeepResearchTurn({ state: searchInputState, sse });
          if (dossier) {
            finalState = { ...searchInputState, ...dossier } as ChatGraphState;
            sse.send('search_complete', {
              message: PROGRESS_MESSAGES.searchComplete(finalState.searchResults?.length ?? 0),
              resultCount: finalState.searchResults?.length ?? 0,
              results: (finalState.searchResults ?? []).slice(0, 10).map((r) => {
                const result: SearchResultPayload = {
                  source: r.source,
                  title: r.title,
                  content: r.content,
                };
                if (r.url != null) result.url = r.url;
                return result;
              }),
            });
            continue;
          }
        }

        // A retry of a research turn whose GENERATION failed: the sources are
        // already on the thread. Re-running Linkup costs ~17s and a paid call
        // to answer the identical question a second time (observed live, 36s
        // after the sources had been persisted). Checked before the brief
        // generator so the whole retrieval half is skipped, not just the search.
        const reused =
          currentIntent === 'research' && finalState.threadId
            ? // swallow-ok: reine Ersparnis — scheitert sie, läuft die Recherche normal durch, teurer aber richtig
              await getKeptResearchForRetry(
                finalState.threadId,
                finalState.searchQuery ?? ''
              ).catch(() => null)
            : null;
        if (reused) {
          log.info(
            `[Research] Reusing ${reused.searchResults.length} source(s) kept from the failed attempt — skipping the repeat Linkup run`
          );
          searchInputState = {
            ...finalState,
            searchResults: reused.searchResults,
            citations: buildCitations(reused.searchResults),
          } as ChatGraphState;
        }

        const willGenerateBrief =
          !reused &&
          ['complex', 'moderate'].includes(finalState.complexity) &&
          currentIntent === 'research';
        const briefStepId = willGenerateBrief ? `brief_${Date.now()}` : null;
        if (willGenerateBrief && briefStepId) {
          // brief generator is a silent LLM call (~1–3s); ping so the UI doesn't
          // sit on the stale "intent" message during this window.
          sse.send('progress_step', {
            stepId: briefStepId,
            toolName: 'brief',
            title: 'Plane Recherche…',
            status: 'in_progress',
          });
          const briefResult = await briefGeneratorNode(finalState);
          searchInputState = { ...finalState, ...briefResult } as ChatGraphState;
          // The flag was set all along but only read by runChatGraph, which has
          // no callers — so a deep-research turn silently degraded to a flat
          // search while the progress copy still promised deep research.
          if (searchInputState.briefGenerationFailed) {
            sendChatWarning(sse, 'research_plan_failed');
          }
          sse.send('progress_step', {
            stepId: briefStepId,
            toolName: 'brief',
            title: 'Plane Recherche…',
            status: 'completed',
          });
        }

        // The progress line now follows the TIER, not the intent: "recherchiere"
        // no longer means a different engine, so promising "dauert 15–20s" on
        // every such turn would be a lie about a search that takes two.
        const searchTier = resolveSearchTier({
          intent: currentIntent,
          explicitDeep: searchInputState.explicitDeepRequest ?? false,
        });
        if (!reused) {
          const baseProgress =
            searchTier === 'standard'
              ? PROGRESS_MESSAGES.searchStart
              : resolveTier(searchTier).progress;
          // A site scope must be VISIBLE. It was extracted heuristically from the
          // user's wording, so a wrong read has to be recognisable as such —
          // otherwise the user sees results missing and has no way to tell that
          // the search was narrowed at all. Named in the progress line rather than
          // a new event field, because that line is already rendered everywhere.
          const scopeDomains = searchInputState.webSiteScope?.include ?? [];
          sse.send('search_start', {
            message:
              scopeDomains.length > 0
                ? `${baseProgress.replace(/[…\s]+$/, '')} — nur auf ${scopeDomains.join(', ')}…`
                : baseProgress,
            ...(finalState.subQueries?.length && { subQueries: finalState.subQueries }),
          });
          if (searchTier !== 'standard') {
            searchInputState = {
              ...searchInputState,
              onResearchProgress: (message: string) => {
                sse.send('search_start', { message });
              },
            } as ChatGraphState;
          }
        }
        // Reused sources ARE the search result — running the node would issue the
        // very Linkup call this branch exists to avoid.
        const searchResult = reused ? {} : await searchNode(searchInputState);
        finalState = { ...searchInputState, ...searchResult } as ChatGraphState;
        // searchNode REPLACES `searchResults`. With the loop now running two
        // genuinely different branches (e.g. web → scrape_url), the second one
        // would drop the first one's sources on the floor. Union them, this
        // iteration's results first (the secondary is the more specific ask —
        // a pasted page beats hits the engine merely found). Deduped by URL;
        // rerank re-orders right below.
        //
        // The guard reads the PRIOR results only, deliberately: an empty second
        // branch (crawl blocked by robots.txt, zero hits) still overwrites
        // `searchResults` with [] one line above, so also requiring the CURRENT
        // branch to be non-empty would wipe the first branch's sources — the
        // very failure this union exists to prevent, with the roles swapped.
        if (priorIntentResults.length > 0) {
          const merged = [...(finalState.searchResults ?? []), ...priorIntentResults];
          const seen = new Set<string>();
          const deduped = merged.filter((r) => {
            const key = r.url ?? `${r.source}:${r.title}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          finalState = {
            ...finalState,
            searchResults: deduped,
            citations: buildCitations(deduped),
          } as ChatGraphState;
        }

        if (finalState.searchResults?.length > 2) {
          const rerankStepId = `rerank_${Date.now()}`;
          sse.send('progress_step', {
            stepId: rerankStepId,
            toolName: 'rerank',
            title: 'Bewerte Quellen…',
            status: 'in_progress',
          });
          const rerankResult = await rerankNode(finalState);
          finalState = { ...finalState, ...rerankResult } as ChatGraphState;
          if (finalState.searchResults.length > 0) {
            finalState.citations = buildCitations(finalState.searchResults);
          }
          // Same dead-flag story as briefGenerationFailed: without reranking the
          // model grounds on input order, so the top sources may be the weakest.
          if (finalState.rerankFailed) sendChatWarning(sse, 'rerank_degraded');
          sse.send('progress_step', {
            stepId: rerankStepId,
            toolName: 'rerank',
            title: 'Bewerte Quellen…',
            status: 'completed',
          });
        }

        const resultCount = finalState.searchResults?.length || 0;
        const payloadResults =
          finalState.searchResults?.slice(0, 10).map((r) => {
            const result: SearchResultPayload = {
              source: r.source,
              title: r.title,
              content: r.content,
            };
            if (r.url != null) result.url = r.url;
            if (r.relevance != null) result.relevance = r.relevance;
            return result;
          }) || [];
        // Degraded search (Qdrant/web source unreachable) must be
        // distinguishable from a genuine zero-hit — both for the user
        // (warning toast + status copy) and for monitoring.
        const {
          coreDegraded: searchDegraded,
          unavailableSources,
          needsReauth,
        } = partitionSearchErrors(finalState.searchErrors);
        if (searchDegraded) sendSearchDegradedWarning(sse, resultCount);
        // A file the user explicitly attached or @-mentioned that could not be
        // read. These were collected but filtered away by the availability
        // predicate, so the answer simply omitted the source without a word.
        if (unavailableSources.length > 0) {
          reportUnavailableSources(sse, finalState, unavailableSources, needsReauth);
        }
        sse.send('search_complete', {
          message:
            searchDegraded && resultCount === 0
              ? PROGRESS_MESSAGES.searchDegraded
              : PROGRESS_MESSAGES.searchComplete(resultCount),
          resultCount,
          results: payloadResults,
          // Only present on a turn that explicitly asked for images. Travels
          // beside `results`, never inside it — an image has no text, so as a
          // source it would be a numbered citation with an empty snippet.
          ...(finalState.webImageResults?.length
            ? { images: finalState.webImageResults.map(withImageProxy) }
            : {}),
          ...((currentIntent === 'examples' || currentIntent === 'pressemitteilung_examples') &&
          finalState.examplesResult
            ? { examplesResult: finalState.examplesResult }
            : {}),
        });
      }
    }

    // Carried at the END of every iteration, not inside the search branch:
    // `chat_history` (and any future branch) writes `searchResults` directly, and
    // a following scrape_url would otherwise overwrite sources this loop never
    // recorded as "prior".
    priorIntentResults = finalState.searchResults ?? [];
  }

  finalState = await carryThreadSourcesIfNeeded(finalState, opts.threadId ?? null);

  return {
    finalState,
    generatedImage,
    sharepicVariants,
    socialPost,
    socialPostRefused,
    socialPostRefusalIsPolicy,
  };
}
