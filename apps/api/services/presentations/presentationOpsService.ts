/**
 * Applies AI-planned operations to a deck where the editor reads it: the live
 * Yjs doc in Hocuspocus. Hocuspocus has no cross-package deps, so the ops run
 * here, on a copy of the doc's state, with the editor's own applier
 * (`@gruenerator/contracts/presentations-ops`); only the resulting diff goes
 * back. An open editor shows the change right away, a closed deck has it on
 * the next open — streaming ops to a browser lost them whenever the deck was
 * not open (#4456).
 */
import { type PresentationOperation } from '@gruenerator/contracts';
import { applyPresentationOperations } from '@gruenerator/contracts/presentations-ops';
import * as Y from 'yjs';

import { createLogger } from '../../utils/logger.js';
import { hocuspocusInternal } from '../collab/hocuspocusInternal.js';

const log = createLogger('presentationOps');

export interface AppliedPresentationOps {
  applied: number;
  skipped: string[];
  /** An editor had the deck open while the change landed. */
  live: boolean;
}

/** Throws when the change could not be written — callers must not report success. */
export async function applyPresentationOpsLive(
  presentationId: string,
  operations: readonly PresentationOperation[]
): Promise<AppliedPresentationOps> {
  const path = `/internal/doc/${encodeURIComponent(presentationId)}/yjs`;
  const current = (await hocuspocusInternal('GET', path)) as { update?: unknown };
  if (typeof current.update !== 'string') throw new Error('no Yjs state for the deck');

  const doc = new Y.Doc();
  try {
    Y.applyUpdate(doc, new Uint8Array(Buffer.from(current.update, 'base64')));
    const before = Y.encodeStateVector(doc);
    const { applied, skipped } = applyPresentationOperations(doc, operations);
    if (applied === 0) return { applied, skipped, live: false };

    const diff = Y.encodeStateAsUpdate(doc, before);
    const written = (await hocuspocusInternal('POST', path, {
      update: Buffer.from(diff).toString('base64'),
      kind: 'presentations',
    })) as { live?: unknown };
    log.info(`applied ${applied} op(s) to deck ${presentationId} (skipped ${skipped.length})`);
    return { applied, skipped, live: written.live === true };
  } finally {
    doc.destroy();
  }
}
