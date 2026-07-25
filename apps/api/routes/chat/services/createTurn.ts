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

import { createLogger } from '../../../utils/logger.js';

import { failCreation, rememberArtifact } from './createTurnHelpers.js';
import { createMessage, touchThread } from './threadPersistenceService.js';

import type { SSEWriter } from './sseHelpers.js';
import type {
  ChatGraphState,
  CreatedDocument,
  ThreadToolContext,
} from '../../../agents/langgraph/ChatGraph/types.js';

const log = createLogger('ChatGraphController');

/** Text is streamed in fixed-size slices, matching the previous handlers. */
const TEXT_CHUNK = 20;

export interface CreateTurnOpts {
  sse: SSEWriter;
  classifiedState: ChatGraphState;
  aiWorkerPool: ChatGraphState['aiWorkerPool'];
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
  aiWorkerPool: ChatGraphState['aiWorkerPool'];
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
 * Run one artifact-creating turn. ALWAYS returns true: the turn is owned either
 * way, because handing a failed create back to the generic responder is what
 * let it invent "copy this into the Office app and export as PDF" — prose that
 * then became the next artifact's input.
 */
export async function runCreateTurn<T>(
  spec: ArtifactSpec<T>,
  opts: CreateTurnOpts
): Promise<boolean> {
  const { sse, classifiedState, aiWorkerPool, req, actualThreadId, userId, userContent } = opts;

  let streamOpened = false;
  const openStream = (): void => {
    if (streamOpened) return;
    sse.send('response_start', { message: spec.progressMessage });
    streamOpened = true;
  };

  try {
    const result = await spec.generate(
      {
        aiWorkerPool,
        req,
        userId,
        userContent,
        ...(opts.userLocale != null && { userLocale: opts.userLocale }),
      },
      openStream
    );

    if (!result) {
      openStream();
      return failCreation(sse, actualThreadId, spec.intent, spec.failureText);
    }

    const responseText = spec.successText(result);
    for (let i = 0; i < responseText.length; i += TEXT_CHUNK) {
      sse.send('text_delta', { text: responseText.slice(i, i + TEXT_CHUNK) });
    }

    const card = spec.card?.(result);
    if (card) sse.send('document_created', card);

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
