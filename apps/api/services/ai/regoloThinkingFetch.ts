/**
 * Regolo's Qwen3 family (qwen3.5-122b, qwen3.6-27b, …) defaults to thinking
 * mode, emitting the final answer into a non-standard `reasoning_content`
 * response field and leaving `content` null. The Vercel AI SDK only reads
 * `content` from OpenAI-compat streams, so chat UIs see 0 chars.
 *
 * Der Hebel dagegen ist `reasoning_effort: 'none'` und nicht der
 * chat-template-Flag `chat_template_kwargs.enable_thinking: false`, der hier bis
 * 13.08.2026 stand. Gemessen an jenem Tag gegen api.regolo.ai, Zeichen
 * Reasoning je Modell bei identischem Prompt:
 *
 *   gpt-oss-120b    enable_thinking:false → 208   ·   reasoning_effort:'none' → 0
 *   qwen3.5-122b    enable_thinking:false →   0   ·   reasoning_effort:'none' → 0
 *   qwen3.6-27b     enable_thinking:false →   0   ·   reasoning_effort:'none' → 0
 *   gemma4-31b      enable_thinking:false →   0   ·   reasoning_effort:'none' → 0
 *   mistral-small   enable_thinking:false →   0   ·   reasoning_effort:'none' → 0
 *
 * Für gpt-oss war der alte Flag also wirkungslos — ausgerechnet auf der Lane,
 * die als Loop-Fallback (`verdigado-pro`) und Überlauf läuft: unsichtbares
 * Denken, das nur Ausgabebudget kostet. Die vollständige Messtabelle steht in
 * `regoloReasoningStream.ts`.
 *
 * We apply this on the **AI SDK path** because (a) the SDK's Chat Completions
 * schema does not read `reasoning_content`, so thinking mode would be invisible
 * and waste tokens, and (b) `none` is accepted by every Regolo model measured.
 * The reasoning-surfacing lanes (qwen3.x, gpt-oss-120b, gemma4-31b) bypass the
 * SDK entirely — they send the same field with a real effort instead (see
 * `regoloReasoningStream.ts`), so this wrapper never runs for them.
 */
export const regoloFetchWithThinkingDisabled: typeof fetch = async (input, init) => {
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
