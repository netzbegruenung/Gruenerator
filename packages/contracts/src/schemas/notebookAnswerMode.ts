/**
 * Notebook answer mode ("Antwortmodus") — how the notebook page answers a
 * question, separate from the retrieval depth (`notebookDepthSchema`, wire
 * field `mode`).
 *
 * - `chat`: the notebook RAG pipeline (search → cut → one streamed answer).
 * - `praezision`: the agentic loop with `notebook_quellen` pinned, locked to
 *   the page's notebooks and read-only.
 * - `auto`: the server decides per question.
 *
 * Wire field `answerMode` on `POST /api/chat-service/notebook/stream`. An
 * omitted field means `chat` on the server, so shipped mobile binaries, the
 * eval corpus and the Grün-O-Mat keep today's behaviour. Which mode a fresh UI
 * preselects is a UI decision (`DEFAULT_NOTEBOOK_ANSWER_MODE` in
 * `@gruenerator/chat`).
 *
 * The ids are frozen (F0): the set only ever grows.
 */
import { z } from 'zod';

export const notebookAnswerModeSchema = z.enum(['auto', 'chat', 'praezision']);
export type NotebookAnswerMode = z.infer<typeof notebookAnswerModeSchema>;

/** The mode a turn actually ran in — `auto` always resolves to one of these. */
export const notebookResolvedAnswerModeSchema = z.enum(['chat', 'praezision']);
export type NotebookResolvedAnswerMode = z.infer<typeof notebookResolvedAnswerModeSchema>;

/**
 * Why the turn runs in `resolved`:
 * - `explicit`: the client asked for exactly this mode.
 * - `pregate`: `auto`, decided by the deterministic pre-filter.
 * - `guard`: `auto`, decided by the LLM guard.
 * - `guard_fallback`: `auto`, the guard failed or answered garbage → `chat`.
 * - `ineligible`: no notebook on the page the loop could read → `chat`.
 * - `default`: nothing asked for, or nothing decided yet → `chat`.
 */
export const notebookAnswerModeReasonSchema = z.enum([
  'explicit',
  'pregate',
  'guard',
  'guard_fallback',
  'ineligible',
  'default',
]);
export type NotebookAnswerModeReason = z.infer<typeof notebookAnswerModeReasonSchema>;

/**
 * Payload of the `answer_mode` SSE event, sent once per turn before the
 * answer. `requested` is null when the request carried no `answerMode`.
 */
export const notebookAnswerModeEventSchema = z.object({
  requested: notebookAnswerModeSchema.nullable(),
  resolved: notebookResolvedAnswerModeSchema,
  reason: notebookAnswerModeReasonSchema,
});
export type NotebookAnswerModeEvent = z.infer<typeof notebookAnswerModeEventSchema>;
