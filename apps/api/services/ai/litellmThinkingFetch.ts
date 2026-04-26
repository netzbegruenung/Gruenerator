/**
 * LiteLLM (Ollama-backed) at Verdigado serves gemma4 models which default to
 * thinking mode: the OpenAI-compat layer streams long `reasoning` deltas with
 * empty `content` until the budget runs out. The Vercel AI SDK only reads
 * `delta.content`, so chat UIs see 0 chars before `finish_reason: length`.
 *
 * Ollama exposes a top-level `think` parameter on chat completions. Setting it
 * to `false` makes gemma4 emit content directly into `content` (after a brief
 * upstream reasoning preamble that the SDK silently drops). Models that don't
 * support thinking ignore the flag, so it's a safe no-op elsewhere on the
 * proxy.
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
