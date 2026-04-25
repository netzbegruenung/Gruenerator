/**
 * Regolo's Qwen3 family (qwen3.5-122b, qwen3.6-27b, …) defaults to thinking
 * mode, emitting the final answer into a non-standard `reasoning_content`
 * response field and leaving `content` null. The Vercel AI SDK only reads
 * `content` from OpenAI-compat streams, so chat UIs see 0 chars.
 *
 * vLLM (Regolo's backend) exposes the chat-template flag
 * `chat_template_kwargs.enable_thinking`. Setting it to `false` makes Qwen3
 * skip the `<think>…</think>` block and stream the answer into `content` —
 * restoring standard OpenAI behavior. Non-Qwen models ignore the flag.
 *
 * We apply this unconditionally to every chat completion request because
 * (a) our current UI does not render `reasoning_content`, so thinking mode
 * is invisible and wastes tokens, and (b) the flag is a safe no-op on the
 * other Regolo-hosted models.
 */
export const regoloFetchWithThinkingDisabled: typeof fetch = async (input, init) => {
  if (init?.body && typeof init.body === 'string') {
    try {
      const parsed = JSON.parse(init.body) as Record<string, unknown>;
      if (parsed.model && parsed.messages) {
        const existing = (parsed.chat_template_kwargs as Record<string, unknown> | undefined) ?? {};
        parsed.chat_template_kwargs = { ...existing, enable_thinking: false };
        init = { ...init, body: JSON.stringify(parsed) };
      }
    } catch {
      // Non-JSON body (e.g. multipart upload), pass through unchanged
    }
  }
  return fetch(input, init);
};
