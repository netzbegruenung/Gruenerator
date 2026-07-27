/**
 * Zod schemas for the /api/search-graph SSE endpoint (SearchGraph, the
 * Perplexity-style search pipeline behind /suche).
 *
 * Mirrors schemas/chatGraph.ts: the response is a manually written SSE stream,
 * so only the request body and the HTTP-level error shape are modelled here.
 *
 * `searchModeSchema` is the single source of truth for the search-depth value
 * on the wire. `packages/chat` re-exports the inferred type as `SearchMode`,
 * and the API derives its `SearchMode` from it too, so the closed set is
 * declared exactly once instead of once per package.
 */
import { z } from 'zod';

import { chatWireMessageSchema } from './chatGraph.js';

// ── Search depth ────────────────────────────────────────────────────────────

/**
 * Search depth ("Recherchetiefe"): `web` = one pass over web + documents,
 * `deep` = multi-pass deep research producing a dossier. Drives node selection
 * in SearchGraph (searchExecutorNode vs deepResearchNode), the token budget and
 * the persisted intent (`web_search` vs `research`).
 */
export const searchModeSchema = z.enum(['web', 'deep']);
export type SearchMode = z.infer<typeof searchModeSchema>;

// ── Request body ────────────────────────────────────────────────────────────
//
// Optional fields use `.nullish()` for the same reason as chatGraph.ts: the
// frontend follows the no-`undefined` convention and sends `null` for unset
// values, so plain `.optional()` would 400 every request.

export const searchGraphStreamBodySchema = z
  .object({
    /**
     * The bare query string. The chat adapter sends both this (last user text)
     * and the full `messages` array; older/simpler callers may send only this.
     */
    query: z.string().nullish(),
    /**
     * Conversation history. Same two wire formats as chat (`parts` from the
     * chat UI, `content` from plain callers) — hence the shared message schema.
     */
    messages: z.array(chatWireMessageSchema).nullish(),
    threadId: z.string().nullish(),
    searchMode: searchModeSchema.nullish(),
    // Persisted verbatim into chat_threads.agent_id (VARCHAR(100)) — bounded here
    // so an over-long id is a 400 rather than a Postgres error mid-stream.
    agentId: z.string().max(100).nullish(),
  })
  .refine((b) => (b.query != null && b.query !== '') || (b.messages?.length ?? 0) > 0, {
    message: 'query or messages required',
  });

export type SearchGraphStreamBody = z.infer<typeof searchGraphStreamBodySchema>;

// ── Response schemas ────────────────────────────────────────────────────────

// The 200 response is declared as c.noBody() in searchGraphContract.ts (the SSE
// stream is written by hand) — only the error shape needs a schema.
export const searchGraphErrorResponseSchema = z.object({
  error: z.string(),
});
