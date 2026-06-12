/**
 * LiteLLM (Ollama-backed) at Verdigado serves gemma4 models which default to
 * thinking mode. Historically the OpenAI-compat layer streamed long
 * `reasoning` deltas with empty `content` until the budget ran out, and
 * setting Ollama's top-level `think: false` made gemma4 emit directly into
 * `content`.
 *
 * The proxy now ignores `think: false` on think-enabled aliases (e.g.
 * `verdigado-think`) and returns reasoning in a separate `reasoning` field
 * that no longer blocks `content` — the streaming layer surfaces it via
 * fullStream as reasoning deltas. The wrapper stays as a harmless no-op
 * safeguard for models/aliases that still honor the flag.
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
