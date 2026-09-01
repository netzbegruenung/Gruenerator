/**
 * Response Streaming Service
 *
 * Handles AI model resolution and text streaming:
 * - Model selection (user override vs agent default)
 * - Building the final messages array for AI
 * - Streaming text via SSE with first-token deadline + cross-provider fallback
 */

import { streamText, type ModelMessage, type LanguageModel } from 'ai';

import { isReasoningCapable } from '../../../services/ai/modelDiscovery.js';
import { recordSlowVerdict } from '../../../services/ai/modelHealth.js';
import { clampToModelOutputLimit } from '../../../services/ai/modelOutputLimits.js';
import {
  isReasoningStreamModel,
  ReasoningStreamUnavailableError,
  streamWithReasoning,
  type ThinkingEffort,
} from '../../../services/ai/regoloReasoningStream.js';
import { classifyProviderError } from '../../../services/providers/providerErrors.js';
import { createLogger } from '../../../utils/logger.js';
import {
  mayWriteAnswer,
  resolveAutoSelection,
  type Complexity,
  type ReasoningSetting,
  type TaskShape,
} from '../agents/autoPolicy.js';
import {
  getModel,
  resolveModelTuple,
  VISION_MODEL,
  isVisionCapable,
  type ResolvedModelTuple,
} from '../agents/providers.js';

import { sanitizeContentPartsForModel, stripEmptyAssistantMessages } from './messageHelpers.js';
import { PROGRESS_MESSAGES, type FallbackReason, type SSEWriter } from './sseHelpers.js';
import { createIdleDeadline, type IdleDeadline } from './streamIdleDeadline.js';
import { resolveAbortOutcome } from './turnAbortOutcome.js';
import { TURN_CEILING_MS } from './turnDeadline.js';

const log = createLogger('ResponseStreaming');

/**
 * How long the upstream model may stay SILENT before it is declared dead and
 * the fallback fires. Generous enough for gemma's reasoning preamble on LiteLLM
 * (~10s observed), with headroom for production load. Idle-based: any output
 * rearms it — see createFirstTokenDeadline.
 */
const FIRST_TOKEN_DEADLINE_MS = 20_000;

// Turn-level wall-clock for the single-pass streaming path. The first-token
// deadline is CLEARED once text starts, leaving Phase 2 (the drain loop)
// uncapped — a slow/trickling generation ran 338 s live. This ceiling composes
// into the streamText abortSignal and is NEVER cleared, so it bounds the whole
// attempt (both phases). The agentic loop has its own wall-clock budget and
// does not use these functions.
const SINGLE_PASS_WALL_CLOCK_MS = (() => {
  const n = Number.parseInt(process.env.CHAT_SINGLE_PASS_WALL_CLOCK_MS ?? '', 10);
  return Number.isInteger(n) && n > 0 ? n : 180_000;
})();

/**
 * Dieselbe Uhr für eine DENKENDE Lane — sie muss Denken UND Schreiben tragen.
 *
 * Gemessen 13.08.2026 gegen regolo/gemma4-31b mit der echten Aufgabe des
 * Agenten „Einfache Sprache" (5.979 Zeichen Fachtext, `max_tokens: 12000`):
 * 31 s bis zum ersten Antworttext, 61 s bis fertig, 8.267 Zeichen Denken,
 * 9.514 Zeichen Antwort, keine Zahl verloren. Derselbe Zug ohne Denken war
 * nach 6,5 s fertig — mit 1.927 Zeichen, also einer Zusammenfassung statt einer
 * Übertragung, und drei fehlenden Zahlen. Das Denken trägt hier, es ist kein
 * Luxus; die Uhr muss also Platz dafür lassen statt es abzuschneiden.
 *
 * 280 s bleibt unter dem `proxy_read_timeout 300s` von nginx für `/api/`
 * (nginx.conf) — jenseits davon schneidet ohnehin der Proxy.
 */
const THINKING_WALL_CLOCK_MS = (() => {
  const n = Number.parseInt(process.env.CHAT_THINKING_WALL_CLOCK_MS ?? '', 10);
  return Number.isInteger(n) && n > 0 ? n : 280_000;
})();

/**
 * Wie lange eine DENKENDE Lane insgesamt brauchen darf, bis das erste
 * Antwort-Token da ist.
 *
 * Die Leerlauf-Frist oben kann das nicht: jedes Denk-Delta stellt sie neu
 * scharf (`touch()`), also bindet sie ein Modell, das ununterbrochen denkt,
 * überhaupt nicht. Am 13.08.2026 dachte Mistral Medium 3.5 über eine
 * Übertragung von 5.838 Zeichen drei Minuten lang — inhaltlich brauchbar, aber
 * stark wiederholend —, schrieb kein Antwort-Token und starb an der Turn-Uhr:
 * kein Text, keine gespeicherte Antwort, drei Minuten Wartezeit für nichts.
 *
 * Läuft das Budget ab, ist NICHTS beim Nutzer angekommen ausser Denk-Deltas —
 * derselbe sichere Zustand, in dem `streamForResolution` schon heute den
 * Reasoning-Pfad wiederholt. Der Zug wird deshalb einmal ohne Denken neu
 * gefahren, statt den Turn zu verlieren.
 *
 * 120 s ist bewusst grosszügig, und die Zahl ist gemessen statt geschätzt:
 * gemma4-31b denkt über 5.979 Zeichen Fachtext 31 s (siehe
 * THINKING_WALL_CLOCK_MS). Ein Budget knapp darüber würde genau die langen
 * Dokumente abwürgen, für die das Denken gebraucht wird — und der Ersatzlauf
 * ohne Denken ist bei dieser Aufgabe messbar SCHLECHTER (Zusammenfassung statt
 * Übertragung, drei Zahlen verloren). Das Budget fängt die Entgleisung, nicht
 * das gründliche Denken.
 */
const REASONING_PHASE_BUDGET_MS = (() => {
  const n = Number.parseInt(process.env.CHAT_REASONING_PHASE_BUDGET_MS ?? '', 10);
  return Number.isInteger(n) && n > 0 ? n : 120_000;
})();
/**
 * Reasoning models (Regolo vLLM) hold back answer text until thinking
 * completes, so the wait for the first TEXT token is legitimately longer than
 * on a plain lane.
 *
 * This is an IDLE window, not a total budget: reasoning deltas rearm it (see
 * createFirstTokenDeadline), so a genuine 60s thinking phase runs to completion
 * as long as the model keeps emitting. It only trips on true silence — which is
 * what "hung" actually means. Before that fix the same 20s was a hard ceiling
 * on thinking, and a research turn died on verdigado-think at exactly 20s, then
 * on its regolo/gemma4-31b sibling at exactly 20s again.
 *
 * Dass die Zahl der oben gleicht, ist ein MESSERGEBNIS und keine Definition:
 * beide Fristen messen Schweigen, und 20 s hat sich für beide Arten von
 * Schweigen bewährt. Sie stehen deshalb getrennt — wer eine bewegt, soll nicht
 * ungefragt die andere mitbewegen.
 */
const REASONING_FIRST_TOKEN_DEADLINE_MS = 20_000;

/**
 * `thinking` defaults to true so an unqualified call keeps the pre-policy
 * behaviour. When the auto policy turned reasoning OFF for a lane that would
 * normally think, there is no thinking phase to wait through — it should be
 * held to the ordinary deadline, not the generous reasoning one.
 *
 * ── Warum hier KEIN Zweig pro Anbieter mehr steht ──
 *
 * Bis zum 01.09.2026 stand hier `if (provider === 'litellm') return 30_000`,
 * begründet mit „LiteLLM overflow lane can queue behind its single Verdigado
 * slot". Der Zweig war zuletzt UNERREICHBAR: `resolution.provider` kommt
 * unverändert aus `AVAILABLE_MODELS` (`resolveModelTuple`), und seit dem
 * Umzug der Gemma-Lane auf Cortecs am 21.08.2026 deklariert keine Lane mehr
 * `provider: 'litellm'` — der Lane-NAME `gemma-litellm` blieb als F0 stehen,
 * der Host darunter ist Cortecs. `retireLiteLLM` biegt einen gespeicherten
 * litellm-Zeiger zwar um, aber erst später in `getModel` und ohne
 * `resolution.provider` anzufassen. Die Frist dieser Lane fiel damit still von
 * 30 s auf 20 s, ohne Fehler und ohne Warnung.
 *
 * Wiederhergestellt wird sie NICHT, und das ist gemessen statt vermutet
 * (01.09.2026, live gegen api.cortecs.ai, `gemma-4-31b-it`, gestreamt):
 *
 *   ohne Vorgabe, 46 Läufe          TTFT  298–1517 ms
 *   1/2/4/8 gleichzeitig, 15 Läufe  TTFT  max 1517 ms, kein Fehlschlag
 *   Prefill: 234 tok → 435 ms, 13 508 → 1894 ms, 53 828 → 7651 ms (~7100 tok/s)
 *
 * Die Warteschlange, für die die Ausnahme geschrieben wurde, gibt es auf
 * diesem Host nicht — ein einzelner Slot war die Eigenheit des Verdigado-
 * Proxys. 20 s bleibt trotzdem nicht knapp bemessen: derselbe Messtag zeigte
 * einen Zug über infercom, der für 234 Eingabe-Tokens 13,2 s bis zum ersten
 * Token brauchte. Die Frist fängt den Stillstand, nicht den langsamen Zug.
 */
export function getFirstTokenDeadlineMs(
  provider: string,
  modelName: string,
  thinking = true
): number {
  if (thinking && isReasoningStreamModel(provider, modelName)) {
    return REASONING_FIRST_TOKEN_DEADLINE_MS;
  }
  return FIRST_TOKEN_DEADLINE_MS;
}

interface ModelResolution {
  model: LanguageModel;
  provider: string;
  modelName: string;
  /** User-facing model ID (key in AVAILABLE_MODELS), if set by the user. */
  modelId?: string;
  /** Single-step first-token-timeout fallback target. */
  sibling?: { provider: string; model: string };
  /** Set when the user requested a modelId the registry doesn't know and the
   *  agent default was used instead — callers surface this to the client so
   *  the selection isn't ignored silently. */
  unknownModelId?: string;
  /** Reasoning strength for this turn, from the auto policy (or the default
   *  for an explicit user selection). `off` means do not think at all. */
  reasoningEffort: ReasoningSetting;
  /** True when the auto policy — not the user — picked this model. The loop
   *  uses it to know a deliberate choice was already made for the synth slot. */
  fromAutoPolicy: boolean;
  /** Context window of the RESOLVED lane. Callers computing token budgets
   *  before the model was known (streamContext runs pre-classifier, so `auto`
   *  yields the conservative default there) should prefer this. Absent when
   *  the agent default was used and no registry entry applied. */
  contextWindow?: number;
}

/** Explicit user selections keep the previous behaviour: think when the model
 *  can. Only `auto` turns are graded by intent + complexity. */
const EXPLICIT_SELECTION_REASONING: ReasoningSetting = 'high';

/**
 * Mistral's dial is BINARY: `@ai-sdk/mistral` validates reasoningEffort against
 * `'high' | 'none'` and throws a ZodError on 'low'/'medium' (verified live
 * against the API). Our 4-step scale therefore collapses here — anything below
 * `medium` means "don't think", which is also the honest reading of `low` on a
 * model that has no low setting.
 *
 * Returns null when no provider option should be sent at all.
 */
export function mistralReasoningOption(setting: ReasoningSetting): 'high' | null {
  return setting === 'medium' || setting === 'high' ? 'high' : null;
}

/**
 * Ob dieser Zug auf DIESER Lane wirklich denkt.
 *
 * Die EINE Lesart von `reasoningEffort`, weil es vorher zwei gab und sie sich
 * widersprachen. `low` — was die Auto-Policy jeder einfachen Notebook-Frage
 * gibt (autoPolicy, surface `notebook`, complexity `simple`) — hieß:
 *
 *   - für den Streamer „an": `reasoningEffort !== 'off'`, also lief der
 *     Roh-Fetch, der `reasoning_effort: 'high'` fest verdrahtet. Aus „ein
 *     bisschen denken" wurde volles Denken.
 *   - für den Modell-Pin „aus": `mistralReasoningOption('low') === null`, also
 *     kein `needsReasoning`, also Scaleway statt Mistral-API — und auf dem
 *     SDK-Pfad auch keine `providerOptions.mistral`, also gar kein Denken.
 *
 * Beides zusammen ergab den Fehler, den der 400er verdeckte: der Roh-Pfad
 * scheiterte, und der „Ersatz über die Mistral-API" lief in Wahrheit auf
 * denselben Scaleway-Host zurück (`resolution.model` war mit
 * `needsReasoning: false` gebaut worden) — diesmal ohne jedes Reasoning.
 *
 * Aufgelöst wird zugunsten der bereits dokumentierten Entscheidung in
 * {@link mistralReasoningOption}: Mistrals Dial ist BINÄR, und alles unter
 * `medium` ist auf einem Modell ohne Low-Stufe ehrlich gelesen ein „nicht
 * denken". Das ist keine neue Produktentscheidung, sondern die bestehende,
 * konsequent angewandt — der Roh-Pfad, der `low` zu `high` hochstufte, war der
 * Ausreißer.
 *
 * Weil Pin und Streamer jetzt dieselbe Antwort bekommen, gilt wieder, was der
 * Fallback im Catch-Block unten voraussetzt: läuft der Reasoning-Pfad, dann ist
 * `resolution.model` die Mistral-API — es gibt also wirklich ein zweites Zuhause.
 *
 * Lanes ohne binären Dial (Regolo/vLLM, LiteLLM/Ollama) behalten ihre Lesart:
 * dort ist alles außer `off` ein Denken.
 */
export function thinksOnThisLane(
  provider: string,
  modelName: string,
  setting: ReasoningSetting
): boolean {
  if (setting === 'off') return false;
  if (provider === 'mistral') {
    return isReasoningCapable(modelName) && mistralReasoningOption(setting) !== null;
  }
  return true;
}

/**
 * Resolve which AI model to use.
 *
 * Order: explicit user selection → auto policy (intent + complexity) → agent
 * default. The vision override runs last and beats all of them.
 *
 * Async because the gpt-oss overflow lane acquires a Redis slot before choosing
 * Verdigado vs Regolo. requestId tags the slot for correct release. Gemma 4 is
 * no longer such a lane: it is pinned to Regolo and takes no slot, see
 * GEMMA_4_REGOLO in agents/providers.ts.
 */
export async function resolveModel(
  agentConfig: { provider: string; model: string; defaultModel?: string | undefined },
  modelId: string | undefined,
  requestId: string,
  options?: {
    hasImages?: boolean;
    intent?: string;
    complexity?: Complexity;
    /** Output contract on the turn (detectTaskShape) — lane override for the
     *  neutral intents, see resolveAutoSelection. */
    taskShape?: TaskShape | null;
    /** Characters of material the turn carries (`turnMaterialChars`) — routes
     *  document work to the precise lane and lifts reasoning, see
     *  resolveAutoSelection. */
    materialChars?: number | null;
    agentId?: string | null;
    /** For surfaces without a classifier (notebook) — see resolveAutoSelection. */
    surface?: 'notebook';
  }
): Promise<ModelResolution> {
  let modelProvider = agentConfig.provider;
  let modelName = agentConfig.model;
  let sibling: { provider: string; model: string } | undefined;
  let resolvedId: string | undefined;
  let unknownModelId: string | undefined;
  let reasoningEffort: ReasoningSetting = EXPLICIT_SELECTION_REASONING;
  let fromAutoPolicy = false;
  let contextWindow: number | undefined;

  const isAuto = !modelId || modelId === 'mistral' || modelId === 'auto';

  if (!isAuto) {
    const tuple = await resolveModelTuple(modelId, requestId);
    if (tuple) {
      modelProvider = tuple.provider;
      modelName = tuple.model;
      resolvedId = modelId;
      contextWindow = tuple.contextWindow;
      if (tuple.sibling) sibling = tuple.sibling;
      log.info(`[ChatGraph] Using user-selected model: ${modelId} → ${modelProvider}/${modelName}`);
    } else {
      log.warn(`[ChatGraph] Unknown model ID "${modelId}", using agent default`);
      unknownModelId = modelId;
    }
  } else {
    // Auto: the classifier has already run, so the intent is known here. This
    // is the whole point of resolving auto on the server instead of the client.
    const selection = resolveAutoSelection({
      ...(options?.intent != null && { intent: options.intent }),
      ...(options?.complexity != null && { complexity: options.complexity }),
      ...(options?.taskShape != null && { taskShape: options.taskShape }),
      ...(options?.materialChars != null && { materialChars: options.materialChars }),
      ...(options?.agentId != null && { agentId: options.agentId }),
      ...(options?.surface != null && { surface: options.surface }),
    });
    reasoningEffort = selection.reasoning;
    const tuple = await resolveModelTuple(selection.modelId, requestId);
    if (tuple) {
      modelProvider = tuple.provider;
      modelName = tuple.model;
      resolvedId = selection.modelId;
      contextWindow = tuple.contextWindow;
      fromAutoPolicy = true;
      if (tuple.sibling) sibling = tuple.sibling;
      log.info(
        `[ChatGraph] auto → ${selection.modelId} (${modelProvider}/${modelName}) ` +
          `intent=${options?.intent ?? 'none'} complexity=${options?.complexity ?? 'simple'} ` +
          `reasoning=${selection.reasoning}${options?.taskShape ? ` taskShape=${options.taskShape}` : ''}` +
          `${options?.materialChars ? ` material=${options.materialChars}c` : ''}`
      );
    } else {
      // The policy names a lane that is not in AVAILABLE_MODELS — a code bug,
      // not user input. Fall back to the agent default rather than failing.
      log.error(
        `[ChatGraph] auto policy returned unknown lane "${selection.modelId}" — using agent default`
      );
    }
  }

  // For image_edit, the chat model narrates from pre-grounded BILDVERGLEICH
  // text descriptions (set by imageEditNode via VisionService) — it does NOT
  // need to see the raw image. Skipping the vision-fallback keeps the user's
  // chosen (typically larger, more system-prompt-compliant) model in charge.
  // The controller MUST also skip injectImageAttachments for image_edit so the
  // non-vision model doesn't receive image bytes it can't decode.
  if (options?.intent === 'image_edit' && options.hasImages && !isVisionCapable(modelName)) {
    log.info(
      `[ChatGraph] image_edit intent — keeping user-selected model "${modelName}", BILDVERGLEICH descriptions provide grounding`
    );
  }

  // Vision override: only fire when the chosen primary AND its sibling both
  // lack vision support. A lane whose sibling can see swaps within the lane
  // instead, so the override does not collapse it onto a single provider.
  if (options?.hasImages && !isVisionCapable(modelName) && options.intent !== 'image_edit') {
    const siblingVisionOk = sibling ? isVisionCapable(sibling.model) : false;
    if (!siblingVisionOk) {
      log.info(
        `[ChatGraph] Images present but "${modelName}" lacks vision — switching to ${VISION_MODEL.provider}/${VISION_MODEL.model}`
      );
      modelProvider = VISION_MODEL.provider;
      modelName = VISION_MODEL.model;
      sibling = undefined;
      resolvedId = undefined;
    } else if (sibling) {
      log.info(
        `[ChatGraph] Images present and "${modelName}" lacks vision but sibling "${sibling.model}" supports it — swapping within lane`
      );
      // Swap to the vision-capable sibling.
      const newPrimary = sibling;
      sibling = { provider: modelProvider, model: modelName };
      modelProvider = newPrimary.provider;
      modelName = newPrimary.model;
    }
  }

  const result: ModelResolution = {
    // `needsReasoning` pins a thinking turn to the Mistral API. The Scaleway
    // upstream is reached through @ai-sdk/openai, which never receives the
    // `providerOptions.mistral` block set further down (see the streamOnce
    // call site), so the effort would be dropped without a trace — no error,
    // no reasoning, nothing in the logs. See routeMistralModel.
    //
    // DIESELBE Frage, die streamForResolution stellt, und deshalb derselbe
    // Ausdruck: driften die beiden auseinander, wählt der Streamer einen
    // Reasoning-Pfad, für den der Pin den Host gar nicht umgestellt hat.
    // Genau so war es — siehe thinksOnThisLane.
    model: getModel(modelProvider, modelName, {
      needsReasoning: thinksOnThisLane(modelProvider, modelName, reasoningEffort),
      // Diese Lane schreibt die Antwort. Wird sie als zäh vermerkt, sucht
      // `modelSiblings` ein Ersatzpaar — und fand dabei bis 19.08.2026
      // `litellm/verdigado-pro` (= gpt-oss am Proxy), dessen Planer-Text im
      // Abnahmelauf als Nutzer-Antwort auftauchte („We will call
      // gruenerator_search …"). Das Veto gilt nur für den AUSWEICH; die
      // primäre Wahl trifft weiterhin die Policy.
      acceptTarget: mayWriteAnswer,
    }),
    provider: modelProvider,
    modelName,
    reasoningEffort,
    fromAutoPolicy,
  };
  if (resolvedId) result.modelId = resolvedId;
  if (sibling) result.sibling = sibling;
  if (unknownModelId) result.unknownModelId = unknownModelId;
  if (contextWindow != null) result.contextWindow = contextWindow;
  return result;
}

/** Convenience type: see ResolvedModelTuple in providers.ts. */
export type { ResolvedModelTuple };

/**
 * Build the final messages array for the AI model.
 * Prepends the system message and strips empty assistant messages.
 */
export function buildMessagesForAI(
  systemMessage: string,
  contextMessages: Array<{ role: string; content: string | unknown[] }>
): Array<{ role: string; content: string | unknown[] }> {
  const messages = [{ role: 'system', content: systemMessage }, ...contextMessages];
  return sanitizeContentPartsForModel(stripEmptyAssistantMessages(messages as ModelMessage[]));
}

/**
 * Hoist any role:'system' entries out of `messages` into a single concatenated
 * `system` string. The Vercel AI SDK warns (and may eventually error) when
 * system messages are passed inside the `messages` array, since they're a
 * potential prompt-injection vector if user content ever leaks into history.
 */
function extractSystemFromMessages(messages: ModelMessage[]): {
  system: string | undefined;
  messages: ModelMessage[];
} {
  const systemParts: string[] = [];
  const rest: ModelMessage[] = [];
  for (const msg of messages) {
    if (msg.role === 'system') {
      const c = msg.content;
      systemParts.push(typeof c === 'string' ? c : String(c));
      continue;
    }
    rest.push(msg);
  }
  return {
    system: systemParts.length > 0 ? systemParts.join('\n\n') : undefined,
    messages: rest,
  };
}

class FirstTokenTimeoutError extends Error {
  readonly kind: FallbackReason = 'first_token_timeout';
  constructor(deadlineMs: number) {
    super(`No content token received within ${deadlineMs}ms`);
    this.name = 'FirstTokenTimeoutError';
  }
}

class EmptyCompletionError extends Error {
  readonly kind: FallbackReason = 'empty_completion';
  constructor() {
    super('Stream completed with empty content');
    this.name = 'EmptyCompletionError';
  }
}

/**
 * Das Denk-Budget der Phase 1 ist abgelaufen: das Modell denkt, aber es
 * ANTWORTET nicht.
 *
 * Ausdrücklich KEIN {@link StreamFailure}: ein Sibling hilft hier nicht (das
 * Modell ist erreichbar und lebt), und die Meldung an den Nutzer wäre die
 * falsche Antwort auf ein Problem, das noch behebbar ist.
 * `streamForResolution` fängt sie und fährt denselben Zug ohne Denken.
 */
class ReasoningBudgetExceededError extends Error {
  constructor(readonly budgetMs: number) {
    super(`Kein Antworttext nach ${budgetMs}ms Denken`);
    this.name = 'ReasoningBudgetExceededError';
  }
}

/**
 * Der Upstream hat vor dem ersten Antworttext mit einem Fehler geantwortet —
 * 429, 5xx, abgerissene Verbindung.
 *
 * Bis hierher flog so ein Fehler ROH an `streamWithFallback` vorbei: er ist
 * kein {@link StreamFailure}, also griff weder der Sibling-Versuch noch die
 * Salvage, und der Zug erreichte den Client als `code:'internal'` — obwohl der
 * zweite Host die Antwort hätte schreiben können. Das war am 19.08.2026 der
 * Weg, auf dem ein Bürgeranfragen-Zug mit „Antwort konnte nicht generiert
 * werden" endete.
 *
 * Nur RETRYABLE Fehler werden hierher übersetzt (siehe
 * {@link classifyProviderError}): ein 4xx trägt denselben Payload zum Sibling
 * und bekäme dieselbe Absage, und ein Abbruch ist gar kein Upstream-Fehler.
 */
class UpstreamProviderError extends Error {
  readonly kind: FallbackReason = 'upstream_error';
  readonly statusCode: number | null;
  constructor(cause: unknown) {
    const info = classifyProviderError(cause);
    super(
      `Upstream failed before the first token (${info.code}${
        info.statusCode != null ? ` ${info.statusCode}` : ''
      })`,
      { cause }
    );
    this.name = 'UpstreamProviderError';
    this.statusCode = info.statusCode ?? null;
  }
}

/**
 * Sentinel error thrown when the primary model fails to produce output AND
 * no text_delta has been emitted yet. Caller catches this to trigger fallback.
 */
export type StreamFailure = FirstTokenTimeoutError | EmptyCompletionError | UpstreamProviderError;

/** Nur für den Test der Abbruch-Einstufung: die Einstufung selbst ist die
 *  Aussage (`turn_ceiling` ist ein Timeout, kein Nutzer-Abbruch), und sie ist
 *  von aussen sonst nur über einen kompletten Stream-Lauf zu erreichen. */
export type { AbortCause };

export function isStreamFailure(err: unknown): err is StreamFailure {
  return (
    err instanceof FirstTokenTimeoutError ||
    err instanceof EmptyCompletionError ||
    err instanceof UpstreamProviderError
  );
}

/**
 * Was Phase 1 aus einem UPSTREAM-Fehler macht (nicht aus einem Abbruch — den
 * beantwortet {@link phase1AbortError}).
 *
 * Der Abbruch-Vorrang ist der springende Punkt: `classifyProviderError` stuft
 * `AbortError`/`TimeoutError` als retryable ein, also würde ein Nutzer-Abbruch
 * oder eine gerissene Uhr ohne diese Abfrage einen Sibling-Lauf starten — für
 * eine Anfrage, die niemand mehr will bzw. deren Frist schon abgelaufen ist.
 * Deshalb: erst fragen, ob überhaupt abgebrochen wurde, dann klassifizieren.
 */
function phase1UpstreamError(err: unknown, cause: AbortCause): unknown {
  if (isStreamFailure(err) || err instanceof ReasoningBudgetExceededError) return err;
  if (cause !== null || isAbortError(err)) return err;
  return classifyProviderError(err).retryable ? new UpstreamProviderError(err) : err;
}

/**
 * Wer den Stream abgebrochen hat — die einzige Frage, die nach einem Abbruch
 * noch offen ist, und bis 13.08.2026 stellte sie niemand.
 *
 * Das AI SDK (7.0.58) stuft eine `DOMException` mit `name: 'TimeoutError'` als
 * ABBRUCH ein, nicht als Fehler: `streamText` schiebt einen `abort`-Part in den
 * Stream und schliesst ihn danach regulär (`ai/dist/index.js`, `pull()`). Beide
 * Drain-Schleifen hier kannten diesen Part nicht, also sah ein Uhr-Abbruch
 * genauso aus wie ein sauberes Ende — in Phase 1 als `EmptyCompletionError`
 * (falsch etikettiert, aber wenigstens ein Fallback), in Phase 2 als FERTIGE
 * Antwort, die anschliessend als vollständiger Zug gespeichert wurde.
 */
type AbortCause = 'caller' | 'turn_ceiling' | 'reasoning_budget' | 'wall_clock' | null;

export function abortCause(sources: {
  caller?: AbortSignal | undefined;
  turnCeiling?: AbortSignal | undefined;
  reasoningBudget?: AbortSignal | undefined;
  wall: AbortSignal;
}): AbortCause {
  // Reihenfolge = Vorrang: ein vom Nutzer abgebrochener Zug ist kein Timeout,
  // auch wenn eine Frist im selben Tick mitgefeuert hat.
  if (sources.caller?.aborted) return 'caller';
  // Die Turn-Decke steht ÜBER dem Denk-Budget, obwohl sie später eingeführt
  // wurde: das Denk-Budget ist behebbar (derselbe Zug fährt ohne Denken nach),
  // die Decke ist es nicht. Wer nach der Decke ohne Denken nachfährt, fährt
  // gegen ein bereits abgebrochenes Signal.
  if (sources.turnCeiling?.aborted) return 'turn_ceiling';
  if (sources.reasoningBudget?.aborted) return 'reasoning_budget';
  if (sources.wall.aborted) return 'wall_clock';
  return null;
}

/** Dieselbe Einstufung, die das AI SDK vornimmt (`isAbortError` in
 *  @ai-sdk/provider-utils): `TimeoutError` ist ein Abbruch, kein Fehler. */
function isAbortError(err: unknown): boolean {
  return (
    (err instanceof Error || err instanceof DOMException) &&
    (err.name === 'AbortError' || err.name === 'TimeoutError')
  );
}

/**
 * Was Phase 1 aus einem Abbruch macht — noch ist kein Antworttext beim Nutzer.
 *
 * Der Nutzer-Abbruch bleibt ein Abbruch (ein Fallback auf den Sibling wäre eine
 * Anfrage, die niemand mehr will), das Denk-Budget ist behebbar
 * (`streamForResolution` fährt ohne Denken nach), und die Turn-Uhr ohne ein
 * einziges Token ist genau das, was `FirstTokenTimeoutError` beschreibt — also
 * Fallback und klare Meldung statt `code:'internal'`.
 */
export function phase1AbortError(
  cause: AbortCause,
  budgets: {
    reasoningBudgetMs?: number | undefined;
    wallClockMs: number;
    turnCeilingMs?: number | undefined;
  },
  fallback: () => Error
): Error {
  if (cause === 'caller') return new DOMException('Aborted by caller', 'AbortError');
  // Die Turn-Decke ist ein Timeout, KEIN Nutzer-Abbruch — der Unterschied ist
  // der ganze Punkt. `'caller'` wirft absichtlich eine nackte `AbortError`, die
  // kein {@link StreamFailure} ist: sie fliegt an `streamWithFallback` vorbei
  // bis in den Router-Catch und erreicht den Client als `code:'internal'`. Für
  // einen abgebrochenen Nutzer ist das richtig (niemand will die Antwort noch),
  // für eine gerissene Decke wäre es genau die stumme Meldung, gegen die die
  // Decke gebaut wurde. Als `FirstTokenTimeoutError` läuft sie stattdessen
  // durch den geordneten Weg: Sibling-Versuch (der am selben, bereits
  // abgebrochenen Signal sofort zurückkommt), Salvage, und am Ende ein sauberes
  // `first_token_timeout` mit `retryable: true` statt `internal`.
  if (cause === 'turn_ceiling') {
    return new FirstTokenTimeoutError(budgets.turnCeilingMs ?? budgets.wallClockMs);
  }
  if (cause === 'reasoning_budget') {
    return new ReasoningBudgetExceededError(budgets.reasoningBudgetMs ?? 0);
  }
  if (cause === 'wall_clock') return new FirstTokenTimeoutError(budgets.wallClockMs);
  return fallback();
}

/**
 * The first-token deadline: rejects with FirstTokenTimeoutError once the model
 * has been SILENT for `deadlineMs`, aborts the stream at the same moment, and
 * `clear()` disarms both when the first real text chunk arrives.
 *
 * The idle semantics (and why they are idle rather than one-shot) live in
 * {@link createIdleDeadline}, which the agentic loop's synth phase shares — one
 * definition of "stalled" for both answer paths.
 */
function createFirstTokenDeadline(deadlineMs: number): IdleDeadline {
  return createIdleDeadline(deadlineMs, () => new FirstTokenTimeoutError(deadlineMs));
}

/** A plain abort-after-ms timer (setTimeout-backed so fake timers drive it,
 *  unlike AbortSignal.timeout). Clearable so a normal completion frees it. */
function createAbortTimer(ms: number): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const handle = setTimeout(() => {
    controller.abort(new DOMException(`wall-clock ${ms}ms exceeded`, 'TimeoutError'));
  }, ms);
  return { signal: controller.signal, clear: () => clearTimeout(handle) };
}

async function streamAndAccumulateOrThrow(params: {
  model: LanguageModel;
  messages: Array<{ role: string; content: string | unknown[] }>;
  maxTokens?: number;
  temperature: number;
  sse: SSEWriter;
  signal?: AbortSignal;
  /** Die Turn-Decke (turnDeadline.ts). Getrennt von `signal`, weil `abortCause`
   *  einen Nutzer-Abbruch anders einstuft als ein Timeout. */
  turnSignal?: AbortSignal;
  logPrefix?: string;
  providerOptions?: Parameters<typeof streamText>[0]['providerOptions'];
  telemetry?: Parameters<typeof streamText>[0]['experimental_telemetry'];
  firstTokenDeadlineMs?: number;
  wallClockMs?: number;
  /** Nur für denkende Lanes gesetzt — siehe REASONING_PHASE_BUDGET_MS. */
  reasoningBudgetMs?: number;
}): Promise<string | null> {
  const {
    model,
    messages,
    maxTokens,
    temperature,
    sse,
    signal,
    turnSignal,
    logPrefix = '[ChatGraph]',
    providerOptions,
    telemetry,
    firstTokenDeadlineMs = FIRST_TOKEN_DEADLINE_MS,
    wallClockMs = SINGLE_PASS_WALL_CLOCK_MS,
    reasoningBudgetMs,
  } = params;

  const {
    deadline,
    signal: deadlineSignal,
    clear,
    touch,
  } = createFirstTokenDeadline(firstTokenDeadlineMs);
  // Turn wall-clock: bounds BOTH phases (the first-token deadline is cleared
  // after phase 1, leaving the drain uncapped). Cleared on normal completion.
  const wall = createAbortTimer(wallClockMs);
  // Denk-Budget: bindet NUR Phase 1 und wird mit dem ersten Antworttext
  // entschärft — anders als die Leerlauf-Frist, die jedes Denk-Delta neu stellt.
  const reasoningBudget = reasoningBudgetMs != null ? createAbortTimer(reasoningBudgetMs) : null;
  const composed = AbortSignal.any([
    ...(signal ? [signal] : []),
    ...(turnSignal ? [turnSignal] : []),
    deadlineSignal,
    wall.signal,
    ...(reasoningBudget ? [reasoningBudget.signal] : []),
  ]);
  const causeOf = (): AbortCause =>
    abortCause({
      caller: signal,
      turnCeiling: turnSignal,
      reasoningBudget: reasoningBudget?.signal,
      wall: wall.signal,
    });
  const abortErrorForPhase1 = (): Error =>
    phase1AbortError(
      causeOf(),
      { reasoningBudgetMs, wallClockMs, turnCeilingMs: TURN_CEILING_MS },
      () => new EmptyCompletionError()
    );

  const { system, messages: messagesWithoutSystem } = extractSystemFromMessages(
    messages as ModelMessage[]
  );

  const result = streamText({
    model,
    ...(system != null && { system }),
    messages: messagesWithoutSystem,
    ...(maxTokens != null && { maxOutputTokens: maxTokens }),
    temperature,
    abortSignal: composed,
    ...(providerOptions && { providerOptions }),
    ...(telemetry && { experimental_telemetry: telemetry }),
  });

  // fullStream (not textStream) so reasoning models surface their thinking as
  // `reasoning_delta` SSE events alongside the answer. A reasoning delta REARMS
  // the first-token deadline (the model is demonstrably alive) rather than
  // disarming it — disarming gave up the clean fallback at the very first
  // reasoning token, after which only the 180s wall clock bounded a hang. Only
  // a `text-delta` ends phase 1; until visible answer text is on the wire we
  // can still fall back cleanly.
  const iterator = result.stream[Symbol.asyncIterator]();
  let fullText = '';
  let textStarted = false;

  // Phase 1 — race the shared deadline until the first visible text delta.
  // Some providers emit empty/structural parts (start, text-start, …) and a
  // reasoning preamble first; we keep racing against the SAME timeout until
  // text arrives or the deadline fires.
  try {
    while (!textStarted) {
      const next = await Promise.race([iterator.next(), deadline]);
      // `done` heisst hier zweierlei: der Upstream war leer — oder eine unserer
      // Fristen hat abgebrochen und das SDK hat den Stream danach regulär
      // geschlossen. Ohne diese Frage sah der zweite Fall aus wie der erste.
      if (next.done) throw abortErrorForPhase1();
      const part = next.value;
      if (part.type === 'error') throw part.error;
      if (part.type === 'abort') throw abortErrorForPhase1();
      if (part.type === 'reasoning-delta' && part.text.length > 0) {
        // Alive, but not answering yet: rearm the idle window — the reasoning
        // deltas are the UI's proof of progress.
        touch();
        sse.send('reasoning_delta', { text: part.text });
      } else if (part.type === 'text-delta' && part.text.length > 0) {
        clear();
        reasoningBudget?.clear();
        fullText += part.text;
        sse.send('text_delta', { text: part.text });
        textStarted = true;
      }
    }
  } catch (err) {
    clear();
    wall.clear();
    reasoningBudget?.clear();
    // Ein Upstream-Fehler VOR dem ersten Token ist der eine Fall, in dem der
    // Sibling noch etwas ausrichten kann — beim Nutzer steht noch nichts.
    throw phase1UpstreamError(err, causeOf());
  }

  // Phase 2 — visible text is on the wire; just drain. Errors here can't
  // trigger a clean fallback, so they end the stream gracefully.
  let aborted = false;
  try {
    while (true) {
      const next = await iterator.next();
      if (next.done) {
        aborted = causeOf() !== null;
        break;
      }
      const part = next.value;
      if (part.type === 'error') throw part.error;
      if (part.type === 'abort') {
        aborted = true;
        break;
      }
      if (part.type === 'reasoning-delta' && part.text.length > 0) {
        sse.send('reasoning_delta', { text: part.text });
      } else if (part.type === 'text-delta' && part.text.length > 0) {
        fullText += part.text;
        sse.send('text_delta', { text: part.text });
      }
    }
  } catch (streamError: unknown) {
    wall.clear();
    const errorMessage = streamError instanceof Error ? streamError.message : 'Unknown error';
    log.error(
      `${logPrefix} Stream error after first token (${fullText.length} chars):`,
      errorMessage
    );
    sse.send('error', {
      error: PROGRESS_MESSAGES.streamInterrupted,
      code: 'stream_interrupted',
      retryable: true,
    });
    sse.end();
    return null;
  }

  wall.clear();
  return aborted ? markTruncated(fullText, sse, logPrefix) : fullText;
}

/**
 * Die halbe Antwort bleibt stehen — sie ist echte Arbeit —, darf aber nicht als
 * fertige durchgehen. Die Notiz geht als `text_delta` raus UND in den
 * Rückgabewert, also auch in die Persistenz: nach einem Reload steht dieselbe
 * Warnung da, die der Nutzer live gesehen hat. Dasselbe Vorgehen wie im
 * agentischen Loop, jetzt aus derselben Quelle (turnAbortOutcome).
 */
function markTruncated(text: string, sse: SSEWriter, logPrefix: string): string {
  const outcome = resolveAbortOutcome({ text, aborted: true });
  if (!outcome) return text;
  log.warn(
    `${logPrefix} Stream abgebrochen nach ${text.length} Zeichen — als unvollständig markiert`
  );
  sse.send('text_delta', { text: outcome.delta });
  return outcome.mode === 'append' ? text + outcome.delta : outcome.delta;
}

/**
 * Internal: same as streamAndAccumulateOrThrow but for the Regolo
 * reasoning-aware path. Throws StreamFailure on first-token failure.
 */
async function streamAndAccumulateWithReasoningOrThrow(params: {
  provider: string;
  modelName: string;
  messages: Array<{ role: string; content: string | unknown[] }>;
  maxTokens?: number;
  temperature: number;
  sse: SSEWriter;
  signal?: AbortSignal;
  /** Die Turn-Decke (turnDeadline.ts). Getrennt von `signal`, weil `abortCause`
   *  einen Nutzer-Abbruch anders einstuft als ein Timeout. */
  turnSignal?: AbortSignal;
  logPrefix?: string;
  firstTokenDeadlineMs?: number;
  wallClockMs?: number;
  reasoningBudgetMs?: number;
  effort?: ThinkingEffort;
}): Promise<string | null> {
  const {
    provider,
    modelName,
    messages,
    maxTokens,
    temperature,
    sse,
    signal,
    turnSignal,
    effort,
    logPrefix = '[ChatGraph]',
    firstTokenDeadlineMs = FIRST_TOKEN_DEADLINE_MS,
    wallClockMs = SINGLE_PASS_WALL_CLOCK_MS,
    reasoningBudgetMs = REASONING_PHASE_BUDGET_MS,
  } = params;

  const {
    deadline,
    signal: deadlineSignal,
    clear,
    touch,
  } = createFirstTokenDeadline(firstTokenDeadlineMs);
  // Turn wall-clock: bounds BOTH phases (the first-token deadline is cleared
  // after phase 1, leaving the drain uncapped). Cleared on normal completion.
  const wall = createAbortTimer(wallClockMs);
  // Dieser Pfad läuft NUR für denkende Lanes — das Denk-Budget gilt hier immer.
  const reasoningBudget = createAbortTimer(reasoningBudgetMs);
  const composed = AbortSignal.any([
    ...(signal ? [signal] : []),
    ...(turnSignal ? [turnSignal] : []),
    deadlineSignal,
    wall.signal,
    reasoningBudget.signal,
  ]);
  const causeOf = (): AbortCause =>
    abortCause({
      caller: signal,
      turnCeiling: turnSignal,
      reasoningBudget: reasoningBudget.signal,
      wall: wall.signal,
    });

  const streamParams: Parameters<typeof streamWithReasoning>[0] = {
    provider,
    model: modelName,
    messages: messages as ModelMessage[],
    ...(maxTokens != null && { maxTokens }),
    temperature,
    signal: composed,
    ...(effort && { effort }),
  };

  const iterator = streamWithReasoning(streamParams)[Symbol.asyncIterator]();
  let fullText = '';

  // Phase 1 — race against the deadline until the first TEXT chunk. Reasoning
  // chunks pass through as reasoning_delta but don't satisfy the deadline:
  // a model that only ever emits reasoning is functionally hung.
  try {
    while (true) {
      const next = await Promise.race([iterator.next(), deadline]);
      if (next.done) throw new EmptyCompletionError();
      const chunk = next.value;
      if (chunk.type === 'text') {
        clear();
        reasoningBudget.clear();
        fullText += chunk.delta;
        sse.send('text_delta', { text: chunk.delta });
        break;
      }
      // Thinking out loud is proof of life — rearm rather than time out.
      touch();
      sse.send('reasoning_delta', { text: chunk.delta });
    }
  } catch (err) {
    clear();
    wall.clear();
    reasoningBudget.clear();
    // Der Roh-Fetch wirft den Abbruch (anders als das SDK, das einen `abort`-
    // Part schickt) — die Frage „wer war es" ist dieselbe. Ohne sie flog eine
    // nackte DOMException bis in den Router und wurde dort zu `code:'internal'`.
    throw isAbortError(err)
      ? phase1AbortError(causeOf(), { reasoningBudgetMs, wallClockMs }, () => err as Error)
      : err;
  }

  // Phase 2 — first text chunk is in. Drain without deadline.
  try {
    while (true) {
      const { done, value } = await iterator.next();
      if (done) break;
      if (value.type === 'text') {
        fullText += value.delta;
        sse.send('text_delta', { text: value.delta });
      } else {
        sse.send('reasoning_delta', { text: value.delta });
      }
    }
  } catch (streamError: unknown) {
    wall.clear();
    if (isAbortError(streamError)) {
      // Halb geschriebene Antwort: sie bleibt stehen, aber markiert — der
      // Zweig darunter hätte sie samt gestromtem Text verworfen (return null).
      return markTruncated(fullText, sse, logPrefix);
    }
    const errorMessage = streamError instanceof Error ? streamError.message : 'Unknown error';
    log.error(`${logPrefix} Reasoning stream error after first token:`, errorMessage);
    sse.send('error', {
      error: PROGRESS_MESSAGES.streamInterrupted,
      code: 'stream_interrupted',
      retryable: true,
    });
    sse.end();
    return null;
  }

  wall.clear();
  return fullText;
}

const GENERIC_GENERATION_ERROR =
  'Antwort konnte nicht generiert werden. Bitte später erneut versuchen.';

function failStream(sse: SSEWriter, kind?: StreamFailure['kind']): null {
  sse.send('error', {
    error: GENERIC_GENERATION_ERROR,
    code: kind === 'first_token_timeout' ? 'first_token_timeout' : 'provider_unavailable',
    retryable: true,
  });
  sse.end();
  return null;
}

function wrapWithCompatCatch<P extends { sse: SSEWriter; logPrefix?: string }>(
  impl: (params: P) => Promise<string | null>,
  label: string
): (params: P) => Promise<string | null> {
  return async (params) => {
    try {
      return await impl(params);
    } catch (err) {
      if (isStreamFailure(err)) {
        log.warn(`${params.logPrefix ?? '[ChatGraph]'} ${label}: ${err.kind} — ${err.message}`);
        return failStream(params.sse, err.kind);
      }
      throw err;
    }
  };
}

export const streamAndAccumulate = wrapWithCompatCatch(streamAndAccumulateOrThrow, 'Stream failed');
export const streamAndAccumulateWithReasoning = wrapWithCompatCatch(
  streamAndAccumulateWithReasoningOrThrow,
  'Reasoning stream failed'
);

/**
 * Stream from a primary model with single-step fallback to its sibling on
 * first-token failure. The sibling is set by resolveModel() — for overflow
 * lanes it's the unchosen Verdigado/Regolo partner; for single configs
 * without a sibling, no fallback fires.
 *
 * Single-step by design: the fallback's buildStream is invoked directly, not
 * via a recursive streamWithFallback. Do not refactor to recurse.
 */
export async function streamWithFallback(params: {
  primary: ModelResolution;
  buildStream: (resolution: ModelResolution) => Promise<string | null>;
  sse: SSEWriter;
  logPrefix?: string;
  /**
   * Last resort when BOTH lanes are dead: a caller that already holds a usable
   * answer returns it here and the turn completes normally instead of erroring.
   * Research wrapper-mode is the case that motivates it — the retrieved
   * synthesis IS the answer and is already on screen as a card, so failing the
   * turn discards work the user can see and we already paid for.
   *
   * Returning null (or omitting this) keeps the plain error.
   */
  salvage?: () => string | null;
}): Promise<string | null> {
  const { primary, buildStream, sse, logPrefix = '[ChatGraph]', salvage } = params;
  const primaryLabel = primary.modelId ?? primary.modelName;

  /**
   * Was in die Fehlerzeile gehört: der Lane-Name UND der Host darunter.
   *
   * Der Lane-Name allein — und nur er stand hier bis zum 01.09.2026 —
   * benennt bei den F0-Altlasten den falschen Anbieter: `gemma-litellm` wird
   * seit dem 21.08.2026 von Cortecs bedient, die Zeile
   * `gemma-litellm failed (first_token_timeout)` schickt jede Nachforschung
   * also zuerst zu einem Proxy, der damit nichts zu tun hat.
   *
   * Was hier bewusst NICHT steht, ist der Unterauftragnehmer von Cortecs. Er
   * ist auf diesem Pfad nicht bekannt und auch nicht beschaffbar: Cortecs
   * hält die Antwort-Header zurück, bis der Upstream sein erstes Token
   * liefert (gemessen 01.09.2026, Vorlauf 0–1 ms bei 200, 16 000 und 64 000
   * Eingabe-Tokens, also auch über 6 s Prefill hinweg). Reisst die Frist, gab
   * es keine Header — `x-cortecs-provider` wird nicht verworfen, er kommt nie
   * an. Wer einen Stillstand einem der beiden Upstreams zuordnen will, kommt
   * um ein `allowed_providers`-Pinning nicht herum; siehe
   * services/ai/cortecsRequestPolicy.ts.
   */
  const hostLabel = `${primary.provider}/${primary.modelName}`;
  const failedLabel = primaryLabel === hostLabel ? primaryLabel : `${primaryLabel} (${hostLabel})`;

  /** Emit the salvaged answer on the normal text channel so the caller's
   *  persistence, citation clamp and reload path all treat it as a real turn. */
  const salvageOrFail = (kind: StreamFailure['kind']): string | null => {
    const rescued = salvage?.() ?? null;
    if (rescued == null || rescued.trim().length === 0) return failStream(sse, kind);
    log.warn(`${logPrefix} both lanes failed (${kind}) — salvaging the answer already retrieved`);
    sse.send('text_delta', { text: rescued });
    return rescued;
  };

  try {
    return await buildStream(primary);
  } catch (err) {
    if (!isStreamFailure(err)) throw err;

    // Das Verdikt, das die Messung nicht liefern kann: es kamen gar keine
    // Tokens. Der nächste Turn wartet dann nicht noch einmal die volle Frist
    // auf dasselbe Paar.
    recordSlowVerdict(primary.provider, primary.modelName, err.kind);

    const sibling = primary.sibling;
    if (!sibling) {
      log.warn(
        `${logPrefix} ${failedLabel} failed (${err.kind}: ${err.message}) — no sibling configured`
      );
      return salvageOrFail(err.kind);
    }

    log.warn(
      `${logPrefix} ${failedLabel} failed (${err.kind}: ${err.message}) → falling back to ${sibling.provider}/${sibling.model}`
    );

    // Client receives only IDs. Display names are resolved client-side.
    const fallbackLabel = `${sibling.provider}/${sibling.model}`;
    sse.send('fallback', {
      from: { id: primaryLabel, name: primaryLabel },
      to: { id: fallbackLabel, name: fallbackLabel },
      reason: err.kind,
    });

    const fallbackResolution: ModelResolution = {
      model: getModel(sibling.provider, sibling.model, { acceptTarget: mayWriteAnswer }),
      provider: sibling.provider,
      modelName: sibling.model,
      // The turn's task hasn't changed, only the host — keep the policy's
      // reasoning setting so the fallback doesn't silently start thinking.
      reasoningEffort: primary.reasoningEffort,
      fromAutoPolicy: primary.fromAutoPolicy,
    };
    if (primary.modelId) fallbackResolution.modelId = primary.modelId;

    try {
      return await buildStream(fallbackResolution);
    } catch (fallbackErr) {
      if (isStreamFailure(fallbackErr)) {
        log.error(`${logPrefix} Fallback ${fallbackLabel} also failed (${fallbackErr.kind})`);
        return salvageOrFail(fallbackErr.kind);
      }
      throw fallbackErr;
    }
  }
}

/**
 * Dispatch entry point paired with streamWithFallback. Routes reasoning-capable
 * lanes through the reasoning-aware streamer; everything else through the
 * standard AI SDK path.
 *
 * Reasoning has three different shapes upstream, all driven by the single
 * `resolution.reasoningEffort` value:
 *   - Mistral: a per-request `reasoningEffort` provider option.
 *   - Regolo (vLLM): `reasoning_effort` (`none` schaltet ab).
 *   - LiteLLM/Ollama: thinking is ON by default; `off` means taking the SDK
 *     path instead, which sets `think: false` via litellmFetchWithThinkingDisabled.
 */
export async function streamForResolution(params: {
  resolution: ModelResolution;
  messages: Array<{ role: string; content: string | unknown[] }>;
  /** Optional output cap. Omit on answer paths — the provider decides. */
  maxTokens?: number;
  temperature: number;
  sse: SSEWriter;
  signal?: AbortSignal;
  /** Die Turn-Decke (turnDeadline.ts). Getrennt von `signal`, weil `abortCause`
   *  einen Nutzer-Abbruch anders einstuft als ein Timeout. */
  turnSignal?: AbortSignal;
  logPrefix?: string;
  telemetry?: Parameters<typeof streamText>[0]['experimental_telemetry'];
}): Promise<string | null> {
  const {
    resolution,
    messages,
    maxTokens,
    temperature,
    sse,
    signal,
    turnSignal,
    logPrefix,
    telemetry,
  } = params;

  const thinking = thinksOnThisLane(
    resolution.provider,
    resolution.modelName,
    resolution.reasoningEffort
  );
  const firstTokenDeadlineMs = getFirstTokenDeadlineMs(
    resolution.provider,
    resolution.modelName,
    thinking
  );

  // Die Ausgabedecke des AUFGELÖSTEN Modells — hier und nicht beim Aufrufer,
  // weil erst an dieser Stelle feststeht, welches Modell die Anfrage bekommt:
  // die Lane kann per Auto-Policy, per Verdigado-Slot oder per Sibling-Fallback
  // gewechselt haben. Ein Aufrufer, der seine Zahl selbst prüft, prüft sie
  // gegen ein Modell, das den Zug am Ende gar nicht schreibt.
  const cappedMaxTokens = clampToModelOutputLimit(
    maxTokens,
    resolution.modelName,
    logPrefix ?? '[ChatGraph]'
  );

  /** Gesetzt, wenn der Denk-Versuch am Budget scheiterte: der SDK-Pfad unten
   *  ist dann der Ersatz OHNE Denken, nicht der zweite Anlauf mit. */
  let thinkingRetriedWithoutBudget = false;

  // `off` deliberately skips the reasoning streamer entirely: for the lanes
  // that stream thinking by default (verdigado-pro/-think, the Regolo family)
  // that is the ONLY way to actually stop them from thinking, and it is what
  // makes `direct` a real speed path.
  if (thinking && isReasoningStreamModel(resolution.provider, resolution.modelName)) {
    // Regolo reasoning path is a raw fetch (regoloReasoningStream), not the AI
    // SDK — it bypasses the global telemetry registration, so it stays
    // uninstrumented for now.
    const args: Parameters<typeof streamAndAccumulateWithReasoningOrThrow>[0] = {
      provider: resolution.provider,
      modelName: resolution.modelName,
      messages,
      ...(cappedMaxTokens != null && { maxTokens: cappedMaxTokens }),
      temperature,
      sse,
      firstTokenDeadlineMs,
      // Denken UND Schreiben müssen in diese Uhr passen — siehe die Messung an
      // THINKING_WALL_CLOCK_MS.
      wallClockMs: THINKING_WALL_CLOCK_MS,
    };
    if (signal) args.signal = signal;
    if (turnSignal) args.turnSignal = turnSignal;
    if (logPrefix) args.logPrefix = logPrefix;
    // `thinking` is true here, so the setting is one of low/medium/high.
    args.effort = resolution.reasoningEffort as ThinkingEffort;
    try {
      return await streamAndAccumulateWithReasoningOrThrow(args);
    } catch (err) {
      // Only the Mistral lane has a second home: Scaleway serves its thinking
      // turns, and `resolution.model` is already the Mistral API model (see
      // the needsReasoning pin in resolveModel), so falling through to the SDK
      // path below re-runs the turn against Mistral with reasoning intact.
      // Every other lane has nowhere to fall back to, so its error propagates.
      //
      // Diese Voraussetzung TRÄGT jetzt, weil Pin und Streamer dieselbe Frage
      // stellen (thinksOnThisLane). Vorher taten sie es nicht: bei `low` kam
      // der Streamer hierher, während der Pin den Host auf Scaleway gelassen
      // hatte — der „Ersatz über die Mistral-API" lief also auf denselben Host
      // zurück, den der erste Versuch gerade abgelehnt hatte, und ohne jedes
      // Reasoning. Wer die beiden Ausdrücke wieder trennt, holt das zurück.
      //
      // Safe only because ReasoningStreamUnavailableError means the upstream
      // never answered — nothing has reached the user's screen yet. A
      // mid-stream failure throws a plain Error and is deliberately not caught
      // here; retrying would replay tokens the user has already seen.
      // Das Denk-Budget ist die zweite Art, auf der ein Denk-Versuch enden
      // darf, ohne dass der Zug verloren ist — und sie gilt auf JEDER Lane:
      // unten steht der SDK-Pfad, und der denkt nicht (Regolo pinnt dort
      // `reasoning_effort:'none'`, Mistral bekommt keine providerOptions).
      // Dieselbe Sicherheitsbedingung wie darunter: es ist noch kein
      // Antworttext beim Nutzer, nur Denk-Deltas.
      if (err instanceof ReasoningBudgetExceededError) {
        log.warn(
          `${logPrefix ?? '[ChatGraph]'} ${resolution.provider}/${resolution.modelName} hat ${err.budgetMs}ms gedacht ohne zu antworten — zweiter Versuch ohne Denken`
        );
      } else if (
        resolution.provider !== 'mistral' ||
        !(err instanceof ReasoningStreamUnavailableError)
      ) {
        // Kein zweiter Versuch auf DIESER Lane — aber der Sibling ist noch
        // offen: `ReasoningStreamUnavailableError` heisst laut eigener Doku,
        // dass der Upstream nie geantwortet hat, und Phase 2 wirft hier gar
        // nicht (sie gibt `null` zurück), also ist garantiert noch kein
        // Antworttext beim Nutzer. Ohne diese Übersetzung flog ein 503 der
        // Regolo-Denk-Lane roh am Fallback vorbei bis in den Router-Catch.
        // `null` als Abbruch-Grund: ein echter Abbruch hat den Phase-1-Catch
        // des Streamers oben schon in einen Abbruch-Fehler übersetzt.
        throw phase1UpstreamError(err, null);
      } else {
        // Den Grund des Upstreams MITSCHREIBEN, nicht deuten: die frühere
        // Fassung meldete pauschal „reasoning unavailable", und ein 400 wegen
        // ungültigem Payload (`max_completion_tokens is limited to 16384`) las
        // sich dann wie ein Reasoning-Problem — während der zweite Versuch in
        // exakt denselben Fehler lief, weil an der Anfrage lag, was der Text
        // dem Host zuschrieb.
        //
        // `err.message` trägt den Status bereits (siehe den Konstruktor von
        // ReasoningStreamUnavailableError), deshalb hier NICHT zusätzlich
        // `err.status` — sonst steht die Zahl zweimal in derselben Zeile.
        log.warn(
          `${logPrefix ?? '[ChatGraph]'} Scaleway-Reasoning fehlgeschlagen (${err.message}) — zweiter Versuch über die Mistral-API`
        );
      }
      // Der zweite Versuch denkt nur im Scaleway-Fall noch einmal: beim
      // Budget-Abbruch ist das Weglassen der Zweck.
      thinkingRetriedWithoutBudget = err instanceof ReasoningBudgetExceededError;
    }
  }

  const args: Parameters<typeof streamAndAccumulateOrThrow>[0] = {
    model: resolution.model,
    messages,
    ...(cappedMaxTokens != null && { maxTokens: cappedMaxTokens }),
    temperature,
    sse,
    firstTokenDeadlineMs,
  };
  if (signal) args.signal = signal;
  if (turnSignal) args.turnSignal = turnSignal;
  if (logPrefix) args.logPrefix = logPrefix;
  if (telemetry) args.telemetry = telemetry;
  // Mistral reasoning models (e.g. Medium 3.5) only think when `reasoningEffort`
  // is set per request; @ai-sdk/mistral then surfaces the reasoning via
  // fullStream so streamAndAccumulateOrThrow can emit it as reasoning_delta.
  const thinkHere = thinking && !thinkingRetriedWithoutBudget;
  if (thinkHere && resolution.provider === 'mistral' && isReasoningCapable(resolution.modelName)) {
    const mistralEffort = mistralReasoningOption(resolution.reasoningEffort);
    if (mistralEffort) {
      args.providerOptions = { mistral: { reasoningEffort: mistralEffort } };
      // Nur wo wirklich gedacht wird: auf einer stummen Lane bindet die
      // Leerlauf-Frist bereits, ein zweites Budget wäre eine zweite Uhr auf
      // dieselbe Frage.
      args.reasoningBudgetMs = REASONING_PHASE_BUDGET_MS;
      args.wallClockMs = THINKING_WALL_CLOCK_MS;
    }
  }
  try {
    return await streamAndAccumulateOrThrow(args);
  } catch (err) {
    if (!(err instanceof ReasoningBudgetExceededError)) throw err;
    // Zweiter Anlauf ohne Denken — derselbe sichere Zustand wie oben: nichts
    // ausser Denk-Deltas ist beim Nutzer angekommen.
    log.warn(
      `${logPrefix ?? '[ChatGraph]'} ${resolution.provider}/${resolution.modelName} hat ${err.budgetMs}ms gedacht ohne zu antworten — zweiter Versuch ohne Denken`
    );
    delete args.providerOptions;
    delete args.reasoningBudgetMs;
    // Ohne Denken gilt wieder die gewöhnliche Uhr: der zweite Lauf schreibt
    // nur noch.
    args.wallClockMs = SINGLE_PASS_WALL_CLOCK_MS;
    return await streamAndAccumulateOrThrow(args);
  }
}
