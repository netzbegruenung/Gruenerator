/**
 * GreenPT (api.greenpt.ai) fronts many backends behind one OpenAI-compatible
 * surface. Its thinking lanes (gemma4, glm-5.2, kimi-*, minimax-m2.5,
 * qwen3.5/3.6, green-r, gpt-oss-120b) put the chain of thought in
 * `message.reasoning` — a field the Vercel AI SDK's Chat Completions schema
 * does not read — while it still bills against `max_tokens`. A tight output
 * budget therefore burns out inside the invisible reasoning block and the user
 * gets an empty answer (probed 2026-07-24: gemma4 spent 15s and 297 reasoning
 * tokens on "17*24" and returned no content).
 *
 * We disable thinking on the SDK path for the same reason as the Regolo and
 * LiteLLM wrappers: the SDK cannot surface it, so paying for it is pure waste.
 *
 * WHICH flags — this is the load-bearing decision. GreenPT is a fan-out, so
 * the flag has to be a no-op wherever it is not understood:
 *
 *  - `chat_template_kwargs.enable_thinking: false` — vLLM's chat-template flag
 *    (the Qwen/gpt-oss lanes). Unknown kwargs are ignored by templates that
 *    don't declare them.
 *  - `think: false` — Ollama's top-level flag (the gemma lanes). Ignored by
 *    non-Ollama backends.
 *
 * Deliberately NOT `reasoning_effort`. This repo's own probe of all 25 servable
 * models found it is per-backend and enum-restricted — Mistral lanes accept
 * only none|high, most vLLM lanes only low|medium|high. Sending `none` to a
 * lane that rejects it turns a degraded answer into a 400, which is worse than
 * the bug being fixed.
 *
 * Known residue: the same probe recorded that gemma4 ignores reasoning controls
 * entirely. If that holds for `think` too, that one lane needs an output-budget
 * floor rather than a flag — tracked as follow-up, not solved here.
 */
export const greenptFetchWithThinkingDisabled: typeof fetch = async (input, init) => {
  if (init?.body && typeof init.body === 'string') {
    try {
      const parsed = JSON.parse(init.body) as Record<string, unknown>;
      if (parsed.model && parsed.messages) {
        const existing = (parsed.chat_template_kwargs as Record<string, unknown> | undefined) ?? {};
        parsed.chat_template_kwargs = { ...existing, enable_thinking: false };
        parsed.think = false;
        init = { ...init, body: JSON.stringify(parsed) };
      }
    } catch {
      // Non-JSON body (e.g. multipart upload), pass through unchanged
    }
  }
  return fetch(input, init);
};
