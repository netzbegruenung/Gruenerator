/**
 * How this service touches a canvas Y.Doc's page state: through `@ggraphic/core/ydoc`, nowhere
 * else. Since document version 4 a page's `state` map may hold Yjs structures (one Y.Map per
 * element) instead of one JSON value per key. `Y.Map#get`/`set`/`toJSON` on such a map read the
 * wrong shape or write plain JSON over the structure, so every read goes through `readState`
 * and every write through `writeStateKeys`/`buildStateMap`. The format and the rules for
 * server-side writers: `packages/schema/DOCUMENT_VERSIONING.md` in Movm/ggraphic, "Server-side
 * writers".
 *
 * The rules, as this file implements them:
 * 1. Page state is read and written only through the codec.
 * 2. A document this service creates is stamped (`meta.schemaVersion`) in the transaction that
 *    creates it, with `CANVAS_DOCUMENT_VERSION` of the schema package this build was compiled
 *    against, never a literal.
 * 3. A document whose stamp, or a host kind's version, is newer than this build knows (or is
 *    malformed) is refused: nothing is written (`assertCanvasDocumentWritable`).
 * 4. The stamp of an existing document is never touched. This service cannot run the host's kind
 *    migrations; an unstamped document is version 1. In a document below version 4 the codec
 *    writes plain JSON, so its values stay plain until an editor opens and lifts the document.
 * 5. The host's collection keys are passed to the codec (`CANVAS_HOST_COLLECTION_KEYS`).
 * 6. A refusal is an error. The caller must not answer it by patching a flat JSON mirror.
 */
import {
  YDOC_KEYS,
  buildStateMap,
  mayWriteStructured,
  readState,
  stateKeyClasses,
  writeStateKeys,
  type StateKeyClasses,
} from '@ggraphic/core/ydoc';
import { CANVAS_DOCUMENT_VERSION } from '@ggraphic/schema';
import { CANVAS_HOST_COLLECTION_KEYS } from '@gruenerator/contracts/canvas-host-keys';

import type * as Y from 'yjs';

export { YDOC_KEYS, readState };

/** The error code the internal API answers a refusal with, and the API's typed error reads. */
export const CANVAS_DOCUMENT_NEWER_CODE = 'CANVAS_DOCUMENT_NEWER';

/**
 * The version of every host kind's list this build knows. The host's kinds register no
 * migrations (`packages/canvas-editor/src/brand/balkenKind.ts`), so each list is at version 1.
 * A kind that gets its first migration raises this number in the same change.
 */
const KNOWN_KIND_VERSION = 1;

/** The key classes for this host: the core's plus the host's collection keys. */
export const CANVAS_KEY_CLASSES: StateKeyClasses = stateKeyClasses(CANVAS_HOST_COLLECTION_KEYS);

/** A write into a canvas document this build must not touch. */
export class CanvasDocumentNewerError extends Error {
  readonly code = CANVAS_DOCUMENT_NEWER_CODE;

  constructor(
    readonly reason: string,
    /** The stored value that caused the refusal (a stamp, or a kind's version), as found. */
    readonly found: unknown,
    /** What this build knows. */
    readonly known: number
  ) {
    super(`canvas document refused: ${reason}`);
    this.name = 'CanvasDocumentNewerError';
  }
}

const isVersion = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1;

/**
 * Throws `CanvasDocumentNewerError` when `meta.schemaVersion` is above this build's
 * `CANVAS_DOCUMENT_VERSION` or malformed, or when a `kindVersion:<stateKey>` entry is above
 * what this build knows for that list or malformed. An absent stamp is version 1 and passes.
 * Reads only. A kind version of a key this service does not know counts as newer from 2 on:
 * it cannot tell what that list's later format looks like.
 */
export function assertCanvasDocumentWritable(doc: Y.Doc): void {
  const meta = doc.getMap<unknown>(YDOC_KEYS.meta);
  const stamp = meta.get(YDOC_KEYS.schemaVersion);
  if (stamp !== undefined) {
    if (!isVersion(stamp)) {
      throw new CanvasDocumentNewerError('malformed schemaVersion', stamp, CANVAS_DOCUMENT_VERSION);
    }
    if (stamp > CANVAS_DOCUMENT_VERSION) {
      throw new CanvasDocumentNewerError(
        `schemaVersion ${stamp} is newer than ${CANVAS_DOCUMENT_VERSION}`,
        stamp,
        CANVAS_DOCUMENT_VERSION
      );
    }
  }
  meta.forEach((value, key) => {
    if (!key.startsWith(YDOC_KEYS.kindVersionPrefix)) return;
    if (!isVersion(value)) {
      throw new CanvasDocumentNewerError(`malformed ${key}`, value, KNOWN_KIND_VERSION);
    }
    if (value > KNOWN_KIND_VERSION) {
      throw new CanvasDocumentNewerError(
        `${key} ${value} is newer than ${KNOWN_KIND_VERSION}`,
        value,
        KNOWN_KIND_VERSION
      );
    }
  });
}

/**
 * Stamp the document this transaction creates, unless something stamped it already. Call it in
 * the transaction that writes the first pages (or the first seed) and before any page value is
 * written, so the codec sees the stamp (`mayWriteStructured`).
 */
export function stampCreatedDocument(doc: Y.Doc): void {
  const meta = doc.getMap<unknown>(YDOC_KEYS.meta);
  if (!meta.has(YDOC_KEYS.schemaVersion)) {
    meta.set(YDOC_KEYS.schemaVersion, CANVAS_DOCUMENT_VERSION);
  }
}

/** Codec options for one write: structure only where the document is (or was just stamped) 4+. */
export const writeOptions = (doc: Y.Doc) => ({
  classes: CANVAS_KEY_CLASSES,
  lift: mayWriteStructured(doc),
});

/** Write `partial` into a page's state map through the codec. Inside the caller's transaction. */
export function writePageState(
  doc: Y.Doc,
  stateY: Y.Map<unknown>,
  partial: Record<string, unknown>
): void {
  writeStateKeys(stateY, partial, writeOptions(doc));
}

/** A fresh state map for a new page; structured only if the document allows it. */
export function buildPageState(doc: Y.Doc, state: Record<string, unknown>): Y.Map<unknown> {
  return buildStateMap(state, writeOptions(doc));
}
