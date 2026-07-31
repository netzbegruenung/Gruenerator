/**
 * Runtime switches for passage distillation. Zero imports on purpose.
 *
 * Read straight from `process.env` rather than through `config/env.ts`, for the
 * same two reasons `agenticLoop/flags.ts` does:
 *
 *   1. `config/env.ts` is parsed once at startup and THROWS on a schema
 *      violation. A kill switch whose typo can stop the process from booting is
 *      not a kill switch.
 *   2. These are read from `services/search`, from ChatGraph nodes and from
 *      `routes/chat/agents` — a three-layer straddle. Staying import-free keeps
 *      that from becoming a cycle.
 *
 * The tuning values (target sizes, chunk sizes, score weights) go the other
 * way: they belong in `config/env.ts` next to the RERANK_* block, because they
 * want Zod coercion and nobody flips them under incident pressure.
 *
 * Default OFF for the first deploy, and listed in `.env.example` in the same
 * change. `CHAT_AGENT_LOOP` is the cautionary tale: it appeared in neither
 * `.env` nor `.env.example`, so "the loop is on" was an assumption nothing in
 * the repo supported. Flipping the polarity later is a reviewable code change.
 */

/** Master switch. Off ⇒ callers keep the raw crawl text, exactly as before. */
export function isPassageDistillEnabled(): boolean {
  return process.env.CHAT_PASSAGE_DISTILL === 'true';
}

/**
 * The expensive half, gated separately: passage selection costs ~300ms
 * (one cross-encoder call), LLM condensation adds ~2-3s per page.
 */
export function isDistillLlmEnabled(): boolean {
  return process.env.CHAT_PASSAGE_DISTILL_LLM === 'true';
}
