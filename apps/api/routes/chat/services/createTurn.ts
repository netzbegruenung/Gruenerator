/**
 * One choreography for every artifact-creating turn.
 *
 * The four turn-owning handlers (sheet, presentation, pdf, board) ran the exact
 * same sequence — 374 lines of it, copied four times:
 *
 *   response_start → generate → (failure ⇒ failCreation) → text_delta
 *     → document_created → done → createMessage → touchThread
 *     → rememberArtifact → end
 *
 * A diff of the sheet and presentation handlers showed 32 differing lines, all
 * of them pure data: label, intent string, confirmation text, error text. That
 * is a descriptor table, not five functions.
 *
 * The loop path reached this conclusion first: `makeCreateDocTool`
 * (domainTools.ts) already covers presentation/sheet/document with one factory
 * plus a label table. This is the single-pass counterpart.
 *
 * Divergences are FIELDS, not branches:
 *  - board emits no `document_created` card (the client seeds Yjs from the
 *    `done` payload instead) → `card` is undefined, `doneExtras` carries
 *    boardId + structure;
 *  - pdf folds its self-check report into the confirmation text, and its `ref`
 *    is the '<uuid>.pdf' asset file name rather than a document UUID;
 *  - board reports `intent: 'direct'` on success (it predates the create_*
 *    intents) → `doneIntent`.
 */

import { applyContextCap } from '../../../utils/contextCap.js';
import { createLogger } from '../../../utils/logger.js';

import { renderSourceLines, withResearchedSources } from './agenticLoop/sourceRegistry.js';
import { failCreation, rememberArtifact, streamTextInChunks } from './createTurnHelpers.js';
import { extractTextContent } from './messageHelpers.js';
import { createMessage, getRecentThreadSources, touchThread } from './threadPersistenceService.js';

import type { SSEWriter } from './sseHelpers.js';
import type {
  ChatGraphState,
  CreatedDocument,
  ThreadToolContext,
} from '../../../agents/langgraph/ChatGraph/types.js';

const log = createLogger('ChatGraphController');

/**
 * How much conversation a create turn is handed.
 *
 * Bounded in CHARACTERS, not messages. A message COUNT is the wrong unit here:
 * in the thread that exposed this, messages ranged from "Notiert." to a
 * 1700-character essay, so "the last four" meant anything between 30 and 7000
 * characters — and a short run of confirmations would push the very answer the
 * user said "mach ein PDF draus" about right out of the window.
 *
 * 24000 is sized against a measured thread rather than guessed: a 39-message QA
 * session logged 3195 tokens (~12000 chars) in total, so this carries a whole
 * conversation with headroom while staying near 6k tokens — a fraction of the
 * ~41.8k the direct lane already budgets, so it cannot crowd out the artifact
 * prompt or the generation itself.
 */
const CONTEXT_CHARS = 24_000;
/** Per-message cap, so one pasted wall of text cannot eat the whole budget. */
const PER_MESSAGE_CHARS = 4_000;

/**
 * What a sharepic gets. A document generator turns a whole conversation into
 * pages; a sharepic turns it into three lines of at most 35 characters, at
 * temperature 0.9. Past a few thousand characters the extra transcript stops
 * being material and starts being noise the slogan has to survive.
 */
export const SHAREPIC_CONTEXT_CHARS = 4_000;

/**
 * The thread as a plain transcript, newest-first-bounded.
 *
 * Why this exists: a single-pass create turn used to build NO history — the
 * generator saw one string. "jetzt als PDF exportieren" therefore reached it as
 * exactly that sentence, and the answer it referred to was structurally
 * invisible. Observed live: the PDF was filled from the only other material in
 * scope, a Kanban confirmation line, and cited it as a source.
 *
 * The LAST user message is skipped — it IS the brief, passed separately.
 *
 * `maxChars` exists for callers whose generator has a much smaller appetite than
 * a document generator's (see SHAREPIC_CONTEXT_CHARS).
 */
export function buildCreateTurnContext(
  messages: ChatGraphState['messages'],
  maxChars: number = CONTEXT_CHARS
): string {
  const history = messages.slice(0, -1);
  const lines: string[] = [];
  let budget = maxChars;
  for (let i = history.length - 1; i >= 0 && budget > 0; i--) {
    const message = history[i];
    if (!message) continue;
    const text = extractTextContent(message.content).trim();
    if (!text) continue;
    const clipped = applyContextCap(
      text,
      Math.min(PER_MESSAGE_CHARS, budget),
      'createTurn:context',
      false
    );
    lines.unshift(`${message.role}: ${clipped}`);
    budget -= clipped.length;
  }
  return lines.join('\n');
}

/**
 * The brief asks the model to judge what it ITSELF said earlier: "Prüfe deine
 * Antworten auf Follow-up 1 bis 9", "Bewerte deine bisherigen Angaben".
 */
const SELF_AUDIT_BRIEF_RE =
  /\bselbst(?:pr[üu]fung|kontrolle)\b|\b(?:pr[üu]f|[üu]berpr[üu]f|kontrollier|bewert|evaluier|beurteil)\w*\b[^.!?\n]{0,40}?\b(?:deine|meine|eigene|eigenen|bisherige|bisherigen|obige|obigen|vorherige|vorherigen)\b[^.!?\n]{0,20}?\b(?:antwort\w*|angaben|aussage\w*|ergebnis\w*|ausgabe\w*)\b/i;

/**
 * Frames the transcript so the model knows which half is the instruction. The
 * brief goes LAST: it is what the turn is for, and recency is the cheapest way
 * to say so.
 *
 * On a self-audit the label flips from "Hintergrund" to "Prüfgegenstand". The
 * word matters because the two readings license opposite behaviour: background
 * may be summarised generously, a subject of examination may not. Live on
 * 03.08.2026 the transcript said an earlier task had gone unanswered, and the
 * check reported it as PASS with a freshly computed, correct result attached —
 * it graded the solvable task instead of the answer that was actually given.
 *
 * Exported because the agentic loop's artifact tools need the identical framing:
 * a generator is a SEPARATE model call with no access to the chat's system
 * prompt, so whatever is not threaded through here is structurally invisible to
 * it — see `makeCreateDocTool` in `agents/domainTools.ts`.
 */
export function withConversationContext(brief: string, transcript: string): string {
  if (!transcript.trim()) return brief;
  const frame = SELF_AUDIT_BRIEF_RE.test(brief)
    ? 'BISHERIGES GESPRÄCH (PRÜFGEGENSTAND — bewerte ausschließlich, was hier TATSÄCHLICH steht. Eine Aufgabe ohne Antwort ist nicht bestanden, auch wenn du sie jetzt lösen könntest; trage keine nachträglich richtige Lösung in die Bewertung ein):'
    : 'BISHERIGES GESPRÄCH (Hintergrund — ein Auftrag wie „mach ein PDF daraus" bezieht sich auf den letzten Beitrag darin):';
  return `${frame}\n${transcript}\n\nAUFTRAG:\n${brief}`;
}

export interface CreateTurnOpts {
  sse: SSEWriter;
  classifiedState: ChatGraphState;
  aiClient: ChatGraphState['aiClient'];
  req: Express.Request;
  actualThreadId?: string;
  userId: string;
  /** Topic for the generator — already referentially resolved by the caller. */
  userContent: string;
  /** create_pdf only: drives letterhead wording and PDF language. */
  userLocale?: 'de-DE' | 'de-AT';
}

/** What the generator needs; deliberately narrower than the turn options. */
interface GenerateContext {
  aiClient: ChatGraphState['aiClient'];
  req: Express.Request;
  userId: string;
  userContent: string;
  userLocale?: 'de-DE' | 'de-AT';
}

export interface ArtifactSpec<T> {
  /** `metadata.intent` on the failure path, and the failure-policy key. */
  intent: string;
  /** `metadata.intent` on success when it differs (board: 'direct'). */
  doneIntent?: string;
  progressMessage: string;
  /** Shown when the model produced nothing usable. */
  failureText: string;
  /** Shown when generation threw. */
  errorText: string;
  /** Sticky-pointer kind. A function when it depends on the result — a
   *  generated document may turn out to be a presentation or a sheet. */
  contextKind: ThreadToolContext['kind'] | ((result: T) => ThreadToolContext['kind']);
  /**
   * Runs the generator. `onCommit` MUST be invoked once a usable structure
   * exists but before the write, so the stream opens at the same point it did
   * before — a failure then surfaces in-stream instead of falling through.
   */
  generate(ctx: GenerateContext, onCommit: () => void): Promise<T | null>;
  successText(result: T): string;
  /** Omitted for kinds without a chat card (board). */
  card?(result: T): CreatedDocument;
  /** Extra top-level fields on the `done` event. */
  doneExtras?(result: T): Record<string, unknown>;
  /** Extra metadata on the persisted assistant message. */
  persistMetadata?(result: T): Record<string, unknown>;
  /** Sticky thread pointer for the next turn's classifier. */
  ref(result: T): { ref: string; label: string };
  /** Human-readable kind for the log line ('Sheet', 'PDF', …). */
  logLabel: string;
}

/**
 * Emit what the chat SHOWS for a finished artifact: the confirmation text, then
 * the card. Shared with save_as_doc, which contributes both to a turn somebody
 * else owns and so cannot reuse the whole choreography.
 *
 * Returns the text, because both callers persist or log it afterwards.
 */
export function emitArtifactResult<T>(sse: SSEWriter, spec: ArtifactSpec<T>, result: T): string {
  const responseText = spec.successText(result);
  streamTextInChunks(sse, responseText);
  const card = spec.card?.(result);
  if (card) sse.send('document_created', card);
  return responseText;
}

/**
 * Run one artifact-creating turn. ALWAYS returns true: the turn is owned either
 * way, because handing a failed create back to the generic responder is what
 * let it invent "copy this into the Office app and export as PDF" — prose that
 * then became the next artifact's input.
 */
export async function runCreateTurn<T>(
  spec: ArtifactSpec<T>,
  opts: CreateTurnOpts
): Promise<boolean> {
  const { sse, classifiedState, aiClient, req, actualThreadId, userId, userContent } = opts;

  let streamOpened = false;
  const openStream = (): void => {
    if (streamOpened) return;
    sse.send('response_start', { message: spec.progressMessage });
    streamOpened = true;
  };

  // A single-pass create turn builds no message history of its own, so the
  // generator would see one string. Two enrichments fix that, in this order:
  //
  //  1. the thread transcript — what "mach ein PDF daraus" POINTS AT. Without
  //     it the referenced answer is invisible and the generator falls back on
  //     whatever else is in scope (live: a Kanban confirmation line became the
  //     document's entire content, cited as source [1]);
  //  2. the thread's most recent research, in the numbered shape the artifact
  //     prompts are told to expect, so "erstelle ein PDF mit den Quellen aus
  //     der Recherche" gets real sources instead of placeholders.
  let enrichedContent = withConversationContext(
    userContent,
    buildCreateTurnContext(classifiedState.messages ?? [])
  );
  if (actualThreadId) {
    try {
      const carried = await getRecentThreadSources(actualThreadId);
      if (carried.length > 0) {
        enrichedContent = withResearchedSources(enrichedContent, renderSourceLines(carried));
        log.info(`[${spec.logLabel}] briefed with ${carried.length} prior source(s)`);
      }
    } catch (err) {
      log.warn(
        `[${spec.logLabel}] source briefing skipped: ${err instanceof Error ? err.message : err}`
      );
    }
  }

  try {
    const result = await spec.generate(
      {
        aiClient,
        req,
        userId,
        userContent: enrichedContent,
        ...(opts.userLocale != null && { userLocale: opts.userLocale }),
      },
      openStream
    );

    if (!result) {
      openStream();
      return failCreation(sse, actualThreadId, spec.intent, spec.failureText);
    }

    const responseText = emitArtifactResult(sse, spec, result);

    const { ref, label } = spec.ref(result);
    log.info(`[ChatGraph] ${spec.logLabel} created: "${label}" (${ref})`);

    sse.sendRaw('done', {
      threadId: actualThreadId,
      citations: [],
      ...spec.doneExtras?.(result),
      metadata: {
        intent: spec.doneIntent ?? spec.intent,
        searchCount: 0,
        totalTimeMs: Date.now() - classifiedState.startTime,
        classificationTimeMs: classifiedState.classificationTimeMs,
        searchTimeMs: 0,
      },
    });

    if (actualThreadId) {
      await createMessage(
        actualThreadId,
        'assistant',
        responseText,
        spec.persistMetadata?.(result)
      );
      await touchThread(actualThreadId);
      const contextKind =
        typeof spec.contextKind === 'function' ? spec.contextKind(result) : spec.contextKind;
      await rememberArtifact(actualThreadId, contextKind, ref, label);
    }

    sse.end();
    return true;
  } catch (err) {
    log.error(
      `[ChatGraph] ${spec.logLabel} creation failed: ${err instanceof Error ? err.message : String(err)}`
    );
    openStream();
    return failCreation(sse, actualThreadId, spec.intent, spec.errorText);
  }
}
