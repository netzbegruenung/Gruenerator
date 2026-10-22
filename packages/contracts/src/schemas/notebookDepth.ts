/**
 * Notebook retrieval depth ("Suchtiefe") — the closed set on the wire.
 *
 * Mirrors searchGraph.ts's `searchModeSchema`: the notebook stream endpoint
 * (`POST /api/chat-service/notebook/stream`) writes SSE by hand, so only the
 * request-body value is modelled here. Web, mobile and the eval corpus all
 * derive from this enum instead of re-declaring the literal union.
 *
 * The ids are frozen (F0): shipped mobile binaries keep sending `fast`/`deep`
 * long after the labels changed, so the set only ever grows. The user-facing
 * labels (Klein / Mittel / Ultra) are display names and live with the UI.
 *
 * What each tier *does* — candidate limits, similarity threshold, rerank
 * window, query expansion — is server-side tuning and lives in
 * `apps/api/config/notebookDepthProfiles.ts`, keyed by these ids. Putting the
 * numbers here would ship retrieval internals into every client bundle and
 * make a tuning change a client-visible contract change.
 *
 * `panda` is not a search depth of its own: it is the `ultra` search answered
 * by the Panda model lane (`gruenerator-panda`, unlock required). The notebook
 * stream resolves it at the door (`resolveNotebookTier`), so retrieval only
 * ever sees a `NotebookSearchDepth`.
 */
import { z } from 'zod';

export const notebookDepthSchema = z.enum(['fast', 'deep', 'ultra', 'panda']);
export type NotebookDepth = z.infer<typeof notebookDepthSchema>;
/** The depths retrieval actually runs — every tier minus the model-only `panda`. */
export type NotebookSearchDepth = Exclude<NotebookDepth, 'panda'>;
