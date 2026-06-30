/**
 * LiteLLM (Ollama-backed) at Verdigado serves gemma4 models which default to
 * thinking mode, streaming long `reasoning` deltas with empty `content` until
 * the answer begins. Setting Ollama's top-level `think: false` makes gemma4
 * emit directly into `content`.
 *
 * This wrapper applies only on the **AI SDK path** — i.e. non-reasoning
 * Verdigado aliases (e.g. `verdigado-pro`/gpt-oss). The reasoning-surfacing
 * lane (`verdigado-think`) does NOT use this fetch: `@ai-sdk/openai`'s Chat
 * Completions schema has no reasoning field and would silently drop the
 * model's thinking, so that lane bypasses the SDK entirely and parses the raw
 * SSE `reasoning` field itself (see `regoloReasoningStream.ts`). For the lanes
 * that DO go through the SDK, thinking is invisible, so we strip it here.
 *
 * The proxy ignores `think: false` on think-enabled aliases, so this stays a
 * harmless no-op for those; it only bites on aliases that still honor the flag.
 */
export const litellmFetchWithThinkingDisabled: typeof fetch = async (input, init) => {
  if (init?.body && typeof init.body === 'string') {
    try {
      const parsed = JSON.parse(init.body) as Record<string, unknown>;
      if (parsed.model && parsed.messages) {
        parsed.think = false;
        init = { ...init, body: JSON.stringify(parsed) };
      }
    } catch {
      // Non-JSON body, pass through unchanged
    }
  }
  return fetch(input, init);
};
