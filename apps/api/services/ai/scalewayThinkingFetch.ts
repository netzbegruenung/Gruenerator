/**
 * Scaleway's Generative APIs, for the models we run there as a lane of their
 * own (today: Gemma 4 26B-A4B on the `heavy` intermediate stage).
 *
 * WHY A WRAPPER AT ALL. Gemma 4 26B-A4B thinks by DEFAULT, puts the chain of
 * thought in `message.reasoning` — which the Vercel AI SDK's Chat Completions
 * schema does not read — and still bills it against `max_tokens`. Measured
 * 2026-08-01 against this exact model:
 *
 *   nackt, max_tokens=400    → content EMPTY, 1729 chars reasoning, finish=length
 *   nackt, max_tokens=1500   → content EMPTY, 5386 chars reasoning, finish=length
 *   reasoning_effort=none    → content 880 chars, 0 reasoning, finish=stop, 1.36s
 *
 * An empty answer is NOT an error for `aiService`: it triggers the whole
 * fallback chain. So without this wrapper the cheap lane would cost a full
 * Scaleway round trip PLUS the chain, on every call.
 *
 * WHICH FLAG — the opposite decision to greenptThinkingFetch, and deliberately
 * so. Scaleway's own model documentation states that
 * `chat_template_kwargs.enable_thinking` is "not supported on Generative APIs"
 * and points at `reasoning_effort` instead. The probe above confirms it: both
 * `enable_thinking: false` and Ollama's `think: false` were accepted and
 * IGNORED (empty content either way); only `reasoning_effort: 'none'` worked.
 *
 * Unlike GreenPT, Scaleway is not a fan-out over many backends, so there is no
 * lane here that might reject the enum value — the risk that ruled
 * `reasoning_effort` out for GreenPT does not exist on this host.
 *
 * NOT applied to Mistral Medium 3.5 on Scaleway: that lane is reached through
 * `routeMistralModel` under `provider: 'mistral'` and MUST keep its thinking
 * turns (they are served by `regoloReasoningStream`). This client is only
 * constructed for `provider: 'scaleway'`.
 */
export const scalewayFetchWithThinkingDisabled: typeof fetch = async (input, init) => {
  if (init?.body && typeof init.body === 'string') {
    try {
      const parsed = JSON.parse(init.body) as Record<string, unknown>;
      if (parsed.model && parsed.messages) {
        parsed.reasoning_effort = 'none';
        init = { ...init, body: JSON.stringify(parsed) };
      }
    } catch {
      // Non-JSON body (e.g. multipart upload), pass through unchanged
    }
  }
  return fetch(input, init);
};
