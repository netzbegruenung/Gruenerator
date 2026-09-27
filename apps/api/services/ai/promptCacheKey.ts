import { createHash } from 'node:crypto';

/**
 * Mistral's `prompt_cache_key` for a chat thread.
 *
 * The key routes consecutive turns of one thread to the same cache, so the
 * shared prefix (system prompt + history) is billed as cached input. It is a
 * hash, not the thread id: internal UUIDs do not leave the house.
 *
 * Sent as `providerOptions.mistral.promptCacheKey`, which only `@ai-sdk/mistral`
 * reads. Every other client — including Scaleway's OpenAI-compatible one when
 * `SCALEWAY_MISTRAL_ROUTING` is on — ignores the `mistral` block, so the field
 * never reaches a host that does not know it.
 */
export function promptCacheKeyForThread(threadId: string | null): string | null {
  if (!threadId) return null;
  return createHash('sha256').update(`gruenerator:thread:${threadId}`).digest('hex').slice(0, 32);
}
