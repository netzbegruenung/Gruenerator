import { captureImpact, modelFromRequestBody } from './greenptImpact.js';

/**
 * How long one GreenPT request may take before its own fetch gives up.
 *
 * Worth knowing when reading a slow turn: this is a PROVIDER deadline, but at
 * 120s it used to be the SHARPEST clock in a chat turn — under the turn ceiling
 * (`turnDeadline.ts`, 360s), the loop hard cap (`types.ts`, 300s) and the tool
 * wall clock (120s). It, not any chat policy, decided when a hung request
 * ended. Live on 20.08.2026 the loop planner (which runs on GreenPT, see
 * LOOP_PLANNER_PRIMARY) went silent after its last tool returned and the turn
 * sat here for exactly 120s, finishing in 139.7s.
 *
 * Deliberately NOT lowered to fix that: the loop grew its own idle guard
 * (`mountedToolCeilingMs` in loopEngine.ts), which now trips first — around 35s
 * on a turn without generation tools — and can still answer from what was
 * gathered. Cutting this value instead would also cap every legitimate
 * long-streaming GreenPT answer, which is a different and worse failure.
 * `GREENPT_FETCH_TIMEOUT_MS` overrides it per environment.
 */
export const GREENPT_FETCH_TIMEOUT_MS = (() => {
  const n = Number.parseInt(process.env.GREENPT_FETCH_TIMEOUT_MS ?? '', 10);
  return Number.isInteger(n) && n > 0 ? n : 120_000;
})();

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
 *
 * Confirmed live on 06.08.2026: gemma4 ran into a Gateway Timeout on
 * `doc_generation`. `services/ai/execution/execute.ts` now gives greenpt only one
 * retry instead of two — the identical request was near-certain to time out
 * again, and burning less time on it reaches the provider-fallback chain
 * (`services/ai/generate.ts`) sooner. That's a latency mitigation, not the
 * output-budget floor above — the underlying cause is still open.
 *
 * EIGENE FRIST. Der Gateway-Timeout oben ist der Fall, in dem GreenPT die
 * Verbindung offen hält und nichts schickt. Ohne eigene Frist wartet der Aufruf
 * dann bis zur Turn-Decke (`routes/chat/services/turnDeadline.ts`, 360 s) oder
 * — auf Pfaden ohne Zug, etwa Einbettungen — bis undici seine
 * Vorgabe-Header-Frist zieht. Beides ist zu spät, um noch in die
 * Provider-Fallback-Kette zu kommen, die genau für diesen Fall existiert.
 * 120_000 liegt über der gemessenen p99-Antwortzeit eines Zuges (159 s ist die
 * Zeit des ganzen Zuges, nicht die einer Anfrage) und unter jeder Turn-Decke,
 * lässt die Kette also noch greifen. Das Signal des Aufrufers bleibt daneben
 * bestehen — wer zuerst abbricht, gewinnt.
 *
 * NACHTRAG 28.08.2026 — der Satz „lässt die Kette also noch greifen" stimmte
 * NICHT. `env.REQUEST_TIMEOUT` ist ebenfalls 120_000, und diese Uhr deckte die
 * ganze Kette: beide liefen im selben Moment ab, also kam hinter GreenPT nie
 * ein Anbieter dran. `doc_generation` scheiterte deshalb nach zwei
 * `aiObject`-Versuchen à 120 s mit HTTP 500, ohne dass ein einziger Ausweich
 * gelaufen wäre. Was die Kette jetzt greifen lässt, ist NICHT diese Zahl,
 * sondern `attemptBudget` in `services/ai/generate.ts`: dort bekommt jeder
 * Anbieter eine eigene Scheibe der Restfrist, und die reicht als `abortSignal`
 * bis hierher durch. Wer diese Konstante ändert, ändert damit nicht mehr, ob
 * die Kette läuft.
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
  // Doubles as the impact tap: this is the last point where GreenPT's
  // sustainability figures still exist — see greenptImpact.ts. Das Signal des
  // Aufrufers geht mit: der Tap hängt am tee-Zweig derselben Antwort und darf
  // die Anfrage nicht überleben.
  const model = modelFromRequestBody(init?.body);
  const deadline = AbortSignal.timeout(GREENPT_FETCH_TIMEOUT_MS);
  const signal = init?.signal ? AbortSignal.any([init.signal, deadline]) : deadline;
  const response = await fetch(input, { ...init, signal });
  return captureImpact(response, model, signal);
};
