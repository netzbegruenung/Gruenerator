/**
 * AI Provider Configuration
 * Manages Mistral and LiteLLM providers for the chat service
 */

import { env } from '../../../config/env.js';
import {
  GEMMA_31B_ALTERNATE,
  GEMMA_31B_ON_CORTECS,
  GEMMA_31B_ON_REGOLO,
  GEMMA_31B_PRIMARY,
} from '../../../services/ai/gemmaHosts.js';
import { isVisionCapable } from '../../../services/ai/modelDiscovery.js';
import { pickHealthyTarget } from '../../../services/ai/modelSiblings.js';
import {
  getGreenPTProvider,
  getLiteLLMProvider,
  getMistralProvider,
  getRegoloProvider,
  getCortecsProvider,
  getScalewayProvider,
  getScalewayTextProvider,
  isProviderConfigured,
  routeMistralModel,
} from '../../../services/ai/providerInstances.js';
import { regoloTextDefault } from '../../../services/ai/textModelPolicy.js';
import { withWireSafeToolCallIds } from '../../../services/ai/toolCallIds.js';
import {
  tryAcquireVerdigadoSlot,
  releaseVerdigadoSlot,
} from '../../../services/providers/verdigadoSlot.js';
import { withUsageTracking } from '../../../services/usage/usageModelMiddleware.js';
import { createLogger } from '../../../utils/logger.js';

import {
  AVOID_AS_SYNTH,
  mayWriteAnswer,
  LOOP_PLANNER_PRIMARY,
  LOOP_PLANNER_SELFHOSTED,
  LOOP_PLANNER_FALLBACK,
  LOOP_SYNTH_PRIMARY,
  LOOP_SYNTH_FALLBACK,
} from './autoPolicy.js';

import type { AgentConfig } from './types.js';
import type { RouteOptions } from '../../../services/ai/providerInstances.js';
import type { ProviderName } from '../../../services/ai/providers.js';
import type { LanguageModel } from 'ai';

const log = createLogger('chatProviders');

const LITELLM_DEFAULT_MODEL = 'verdigado-pro';

/**
 * Wohin ein Zug mit Bildern geht, wenn die gewählte Lane keine Bilder kann.
 *
 * BLEIBT AUF REGOLO, obwohl alle anderen Gemma-Lanes am 25.08.2026 auf Cortecs
 * gezogen sind (services/ai/gemmaHosts.ts). Das ist kein Übersehen: ob die
 * Cortecs-Endpunkt (infercom) Bildteile annimmt, ist GEMESSEN und die Antwort
 * ist nein: ein echter Bild-Turn am 25.08.2026 endet in HTTP 500
 * (`unexpected_error`), obwohl der Katalog `input_modalities: ['text','image']`
 * behauptet. Es ist eine Frage an den Endpunkt, nicht an das Modell.
 *
 * Hängt zusammen mit dem `vision: false` von `gemma-4-31b-it` in
 * modelDiscovery.ts: solange das dort so steht, schickt die Bild-Weiche in
 * responseStreamingService.ts Bild-Züge ohnehin auf den Regolo-Sibling. Wer
 * das eine aufhebt, hebt das andere mit auf — und probt vorher.
 */
export const VISION_MODEL = {
  // IMMER Gemma 4 31B — dasselbe Modell, das alle Textlanes fahren, abgeleitet
  // aus derselben Quelle. Ein hier abgetippter Modellname würde beim nächsten
  // Modellwechsel zurückbleiben und die Bild-Weiche stillschweigend auf ein
  // anderes Modell zeigen lassen.
  //
  // Der HOST ist auf Regolo festgenagelt und folgt bewusst NICHT
  // `GEMMA_31B_PRIMARY`: der Cortecs-Endpunkt beantwortet einen echten
  // Bild-Turn mit HTTP 500 (gemessen 25.08.2026), obwohl sein Katalog
  // `input_modalities: ['text','image']` behauptet. Bildfähigkeit ist eine
  // Eigenschaft des ENDPUNKTS, nicht der Gewichte — und Regolo ist die Seite,
  // auf der sie belegt ist.
  provider: GEMMA_31B_ON_REGOLO.provider,
  model: env.VISION_DEFAULT_MODEL || GEMMA_31B_ON_REGOLO.model,
};

export { getIntermediateModel } from '../../../services/ai/providers.js';
export { intermediateLane } from '../../../services/ai/intermediateLanes.js';

export { isVisionCapable };

/**
 * Available models that can be selected by the user.
 *
 * `single` — pinned to one provider/model.
 * `overflow` — Verdigado-preferred with Regolo overflow when Verdigado's
 * single inference slot is busy. The unchosen sibling becomes the
 * first-token-timeout fallback for the chosen side.
 *
 */
export type Provider = 'mistral' | 'litellm' | 'regolo' | 'greenpt' | 'scaleway' | 'cortecs';

const GREENPT_DEFAULT_MODEL = 'mistral-medium-3.5-128b';

export interface ModelConfigSingle {
  kind: 'single';
  provider: Provider;
  model: string;
  contextWindow: number;
  /**
   * Optional first-token-timeout fallback (single-step). For Mistral lanes
   * this is typically a Gemma/GPT-OSS overflow lane so a hung Mistral
   * upstream still produces an answer for the user.
   */
  fallback?: string;
}

export interface ModelConfigOverflow {
  kind: 'overflow';
  primary: { provider: 'litellm'; model: string };
  overflow: { provider: 'regolo'; model: string };
  /** Window of the PRIMARY (Verdigado) side — the conservative one. */
  contextWindow: number;
  /** Window of the OVERFLOW (Regolo) side, which is hosted and serves the full
   *  model context. Kept separate because one config drives two very differently
   *  sized backends: reporting the primary's window while actually running on
   *  Regolo would prune away context the request could have carried. */
  overflowContextWindow: number;
}

export type ModelConfig = ModelConfigSingle | ModelConfigOverflow;

/**
 * Context windows below are MEASURED, not copied from datasheets (2026-07-26).
 *
 * Probe: POST an oversized prompt and read the limit back. Mistral answers
 * `too large for model with 262144 maximum context length` — a clean 400 before
 * any tokens are billed. The self-hosted Verdigado lanes do NOT: at ~350k input
 * they returned HTTP 200 with `prompt_tokens: 65538`, i.e. Ollama **silently
 * truncated** the prompt and answered over the fragment. A too-high number there
 * costs no error, it costs context — so those lanes stay at the largest size
 * verified end-to-end (120k, needle retrieved, 32s cold / 3.6s warm).
 */
const CTX_FULL = 262_144;
/**
 * Ceiling for the Ollama-backed Verdigado lanes.
 *
 * The failure mode above this line is SILENT truncation: HTTP 200, but
 * `prompt_tokens` collapses to ~64Ki and the answer is written over a fragment.
 * Nothing in the response says so. That is why this number is measured rather
 * than taken from the model tag.
 *
 * History. It sat at 64k because the only observed truncation point was
 * `prompt_tokens: 65538` — exactly 64Ki + 2, the signature of a runtime
 * `num_ctx` of 65536 — and one data point does not locate a cliff. Re-measured
 * 2026-07-31 with a needle at the very start of the prompt:
 *
 *   ~130k sent -> prompt_tokens 122,956, needle found
 *   ~155k sent -> prompt_tokens  65,539, needle gone
 *
 * So the fallback is real, but it sits far above 64k. 120k stays under the
 * highest verified value with room to spare. The tag's 128k would sit in the
 * unmeasured stretch just before the cliff, and being wrong there is invisible.
 *
 * KNOWN GAP, read before raising further: the needle test ran against
 * `verdigado-think`, but since Gemma 4 moved to Regolo the main consumer of
 * this constant is `verdigado-pro` (GPT-OSS 120B) via GPT_OSS_OVERFLOW. Both
 * are Ollama behind the same LiteLLM, so the 64Ki fallback signature is
 * expected to be identical — but that is an inference, not a measurement. The
 * value is chosen conservatively enough that the inference does not have to
 * hold exactly.
 *
 * Raise only alongside a fresh needle test AND an overflow probe on the lane,
 * and measure the lane you are raising.
 */
const CTX_VERDIGADO = 120_000;

const GPT_OSS_OVERFLOW: ModelConfigOverflow = {
  kind: 'overflow',
  primary: { provider: 'litellm', model: 'verdigado-pro' },
  overflow: { provider: 'regolo', model: 'gpt-oss-120b' },
  // Bounded by the Verdigado PRIMARY, not the Regolo overflow: one config
  // serves both, and the primary truncates silently.
  contextWindow: CTX_VERDIGADO,
  overflowContextWindow: CTX_FULL,
};

/**
 * Gemma 4 — Regolo only. NOT an overflow lane, deliberately.
 *
 * It used to be Verdigado-primary with Regolo on overflow, the way GPT-OSS
 * still is. Measured 2026-07-31, same prompt on both hosts:
 *
 *   regolo/gemma4-31b        ~76 tok/s, 0.4s to first token, 4.0s done, NO thinking
 *   litellm/verdigado-think  23-34 tok/s, 20s to first token, 38s done
 *
 * The gap is not only throughput. Verdigado's Gemma thinks before every answer
 * and no flag stops it — `think:false`, `enable_thinking:false` and
 * `reasoning_effort:'none'` were each probed and each ignored on that host, so
 * roughly two thirds of the output budget goes into a reasoning block. Regolo
 * honours `enable_thinking:false` (verified: zero reasoning characters), which
 * is why the same weights answer nine times faster there.
 *
 * Four places in this codebase were already routing around the slow lane
 * (AVOID_AS_SYNTH, the agentic respond rewrite, runJudge's model note,
 * providerSelector's comment) rather than changing it. This is the change
 * those workarounds were compensating for.
 *
 * WHY NOT SIMPLY SWAP THE TWO SIDES: `resolveModelTuple` gates the PRIMARY on
 * `tryAcquireVerdigadoSlot`. Swapped, Regolo would hold a slot it does not
 * need, and Verdigado would serve precisely when that slot was busy — i.e.
 * exactly when it must not run. The slot exists because Verdigado has a single
 * inference slot. A plain single lane sidesteps that inversion.
 *
 * Verdigado serves no part of this lane any more — not as primary, and since
 * 19.08.2026 not as failover either (see the fallback note below).
 */
const GEMMA_4_REGOLO: ModelConfigSingle = {
  kind: 'single',
  provider: GEMMA_31B_ON_REGOLO.provider,
  model: GEMMA_31B_ON_REGOLO.model,
  contextWindow: GEMMA_31B_ON_REGOLO.contextWindow,
  // Der Ausweichhost war bis 19.08.2026 `gemma-4-verdigado` — dieselben
  // Gewichte, aber der teuerste denkbare Ausweg: 20s bis zum ersten Token,
  // Denken nicht abschaltbar, und vor allem EIN einziger Inferenz-Slot, den
  // sich der Ausweg mit den GPT-OSS-Lanes und (bis zum selben Tag) mit dem
  // Monitor teilte. Genau diese Verkettung ist am 19.08.2026 sichtbar
  // geworden: Regolo hustete, der Ausweg fand keinen freien Slot, und der Zug
  // starb an BEIDEN Lanes mit „Antwort konnte nicht generiert werden".
  //
  // Seit 21.08.2026 weicht die Lane auf DIESELBEN Gewichte bei einem anderen
  // Vertragspartner aus: das dichte 31B über Cortecs. Was das löst und was es
  // kostet, steht bei GEMMA_4_31B_CORTECS. Drei Dinge, die der Ausweg dadurch
  // erfüllt und die vorherigen nicht:
  //   - kein Qualitätsgefälle. Der Ausweg schreibt dem Nutzer Prosa; ein
  //     kleineres oder unbelegtes Modell verschiebt den Fehler dorthin, wo
  //     niemand ihn misst.
  //   - kein Slot, der belegt sein kann — der Ausweg hängt nicht mehr an
  //     derselben Engstelle wie die Lane, die ihn braucht.
  //   - jede Seite trägt ihr EIGENES Kontextfenster. Früher erbte der Sibling
  //     nur provider/model: der Prompt wurde gegen Regolos 262k bemessen und
  //     lief auf Verdigados 120k in eine stille Kürzung.
  //
  // Dieser dritte Punkt stand hier bis zum 25.08.2026 als „beide Seiten
  // CTX_FULL" und war damit eine Beruhigung, die sich selbst überholt hat: seit
  // dem gemessenen Kontextfenster des Cortecs-Endpunkts (128k, siehe
  // GEMMA_31B_ON_CORTECS) sind die beiden Seiten NICHT mehr gleich gross. Der
  // Mechanismus ist deshalb nicht kosmetisch, sondern tragend — jede
  // Konfiguration zieht ihr Fenster aus ihrem eigenen Host-Deskriptor.
  //
  // WORAUF ZU ACHTEN IST, wenn jemand die Ausweichrichtung ändert:
  // `ResolvedModelTuple.sibling` führt nur provider/model, kein Fenster — bei
  // einem Ausweich bleibt also die Zahl des PRIMÄRS stehen. Von der
  // Antwortlane aus ist das harmlos (Cortecs 128k → Regolo 262k, es wird
  // grösser). Andersherum ist es die stille Kürzung von oben: wer `gemma-regolo`
  // auflöst (262k) und von dort auf Cortecs ausweicht, hat gegen 262k bemessen
  // und landet auf 128k. Diese Kennung ist backend-only und wird heute von
  // nichts von selbst gewählt — wer das ändert, misst vorher.
  //
  // `streamWithFallback` ist single-step by design — der eigene Fallback des
  // Ausweichs (`gemma-regolo`) greift auf DIESEM Weg also nicht.
  fallback: GEMMA_31B_ON_CORTECS.laneId,
};

/**
 * Das dichte Gemma 4 31B über Cortecs — der Ausweichweg der Gemma-Antwortlane.
 *
 * Der Registry-Name sagt `gemma-4-26b` und meint es nicht mehr. Er bleibt
 * trotzdem stehen: F1 (CLAUDE.md), er steckt in persistierten Thread-Zuständen
 * und wird nicht umbenannt. Was er BEDEUTET, steht hier.
 *
 * Die Lane braucht nichts aus dem Mistral-Regelwerk (`isAgenticToolCapable`,
 * Kontextfenster, Fallback-Ketten): sie schreibt Prosa über Material, das schon
 * im Kontext steht, und ruft keine eigenen Werkzeuge auf.
 *
 * ── WEG VOM 26B, 21.08.2026 ──
 *
 * Diese Lane fuhr `gemma-4-26b-a4b-it`, erst direkt auf Scaleway, dann über
 * Cortecs. Über Cortecs hatte diese Modell-ID genau EINEN brauchbaren
 * Unterauftragnehmer, und der verschwand an diesem Tag binnen einer Stunde aus
 * dem Katalog — derselbe Aufruf, der um 15:52 lief, antwortete um 16:31 mit
 * `No endpoint passed quantization_filter. Details: {scaleway: Provider not in
 * allowed providers}, {aki: Endpoint uses quantization}`. Der zweite Endpunkt
 * war quantisiert und fiel durch den Standardfilter.
 *
 * ── UND WARUM NICHT GREENPT, obwohl es der naheliegende Hafen wäre ──
 *
 * GreenPTs `gemma4` war der erste Ersatz und ist es nach einem halben Tag nicht
 * mehr. Zwei Gründe, beide betreffen ausgerechnet den Ausweichfall:
 *
 *  1. **Es DENKT IMMER**, rund 5.400 Zeichen, und kein Flag schaltet es ab —
 *     `enable_thinking:false`, `think:false` und `reasoning_effort:'none'`
 *     wurden alle drei geprobt, alle drei angenommen und ignoriert
 *     (nachgemessen 21.08.2026). Live gemessen auf dieser Lane: 4956 ms
 *     gesamt, davon 4615 ms bis zum ersten Token. Der Ausweg springt ein, wenn
 *     der Primär schon Zeit verbrannt hat; er darf nicht der langsamere sein.
 *  2. **Welche Gewichte es trägt, ist unbelegt** — siehe den Doc-Block bei
 *     GEMMA_4_GREENPT. Ein stilles Qualitätsgefälle ist auf einer Lane, die
 *     dem Nutzer Prosa schreibt, teuer und unsichtbar zugleich.
 *
 * Das dichte 31B über Cortecs hat keinen der beiden Nachteile: dieselben
 * Gewichte wie der Primär (also gar kein Gefälle) und es denkt von sich aus
 * nicht (gemessen 21.08.2026: 420 Zeichen Inhalt, 0 Zeichen Denken, ohne jeden
 * Parameter) — anschalten lässt es sich über
 * `chat_template_kwargs.enable_thinking`, siehe regoloReasoningStream.ts.
 *
 * Die dritte Begründung, die hier bis zum 25.08.2026 stand — „es liegt bei ZWEI
 * Endpunkten (infercom, berget) statt bei einem" — ist WEG, weil sie nicht mehr
 * stimmt: der Katalog führt für dieses Modell nur noch `infercom`, und berget
 * ist über `allowed_providers` nicht erzwingbar (`Endpoint uses quantization`,
 * auch mit `allow_quantization: true`). Cortecs ist für uns also ebenfalls ein
 * Ein-Endpunkt-Host; die Reserve dieser Lane ist der Regolo-Ausweich, nicht der
 * Router. Dieselben Gewichte fahren seit demselben Tag auch `heavy` und
 * `pruefung` in services/ai/intermediateLanes.ts — dort steht die Messreihe
 * (TTFT 1122 ms, 210,7 tok/s).
 *
 * KEIN Denk-Pin für dieses Modell — aber nicht aus dem Grund, der hier bis zum
 * 25.08.2026 stand. Live nachgemessen nimmt infercom `reasoning_effort` in den
 * gradierten Stufen an und IGNORIERT es; abgelehnt (HTTP 400) wird nur `none`.
 * Ein Pin wäre also wirkungslos oder ein Fehler. Der Hebel, der wirkt, heisst
 * `chat_template_kwargs.enable_thinking` und sitzt im Denk-Strom
 * (services/ai/regoloReasoningStream.ts) — Messreihe dort.
 *
 * PREIS, bewusst angenommen: Cortecs ist VORAUSBEZAHLT. Ein leeres Guthaben
 * antwortet mit HTTP 401 wie ein fehlender Schlüssel — dann fällt der Ausweg
 * aus, und zwar unabhängig davon, warum der Primär ausfiel. Der Schalter
 * dagegen ist Auto-Top-up im Cortecs-Konto, nicht Code.
 *
 * Failover dieses Eintrags ist die Gemma-Familie auf Regolo. Auf dem Weg über
 * `streamWithFallback` greift das nicht (single-step by design) — es zählt,
 * wenn jemand `gemma-4-26b` direkt auflöst.
 */
const GEMMA_4_31B_CORTECS: ModelConfigSingle = {
  kind: 'single',
  provider: GEMMA_31B_ON_CORTECS.provider,
  model: GEMMA_31B_ON_CORTECS.model,
  // Das kleinere der beiden Fenster, und das ist der Preis des Hosts: der
  // Ausweich auf Regolo trägt 262k, dieser Endpunkt 128k. Wer hier CTX_FULL
  // hinschreibt, bekommt keine Fehlermeldung, sondern eine stille Kürzung.
  contextWindow: GEMMA_31B_ON_CORTECS.contextWindow,
  fallback: GEMMA_31B_ON_REGOLO.laneId,
};

/**
 * Die Gemma-Antwortlane — welcher der beiden Hosts sie schreibt, entscheidet
 * `services/ai/gemmaHosts.ts` und sonst nichts.
 *
 * Beide Konfigurationen oben bleiben registriert, weil beide Kennungen
 * auflösbar bleiben müssen (`gemma-regolo`, `gemma-4-26b`) und weil jede die
 * Ausweichseite der anderen ist. Was hier ausgewählt wird, ist nur, welche von
 * beiden die Lane-Namen bedient, die der Chat tatsächlich benutzt.
 */
const GEMMA_ANSWER_LANE: ModelConfigSingle = {
  kind: 'single',
  provider: GEMMA_31B_PRIMARY.provider,
  model: GEMMA_31B_PRIMARY.model,
  contextWindow: GEMMA_31B_PRIMARY.contextWindow,
  // Der Ausweich ist der ANDERE Host — abgeleitet, nicht behauptet. Ein zweites
  // Mal hingeschriebener Kennungsname wäre genau die Stelle, an der ein
  // Host-Wechsel den Ausweg auf sich selbst zeigen liesse.
  fallback: GEMMA_31B_ALTERNATE.laneId,
};

/**
 * GreenPTs `gemma4`. Seit 21.08.2026 OHNE Aufrufer: es war der Ausweichweg der
 * Lane darüber, und die weicht jetzt auf das dichte 31B über Cortecs aus —
 * Begründung bei GEMMA_4_31B_CORTECS. Der Eintrag bleibt registriert, damit die
 * Kennung auflösbar bleibt, ist aber kein Pfad mehr, den irgendetwas von selbst
 * nimmt.
 *
 * Welche Gewichte das sind, ist UNBELEGT: diese Stelle behauptete „the SAME 26B
 * model", `scripts/probeGreenptImpact.ts` ordnet dieselbe ID unserer dichten 31B
 * zu. GreenPT nennt keine Parameterzahl, und aus dem Namen folgt keine. Genau
 * diese Unschärfe ist einer der zwei Gründe, warum es den Ausweichweg verlor.
 *
 * Not in the user-facing catalog and not an auto-policy target: picking it
 * deliberately would opt into a behaviour nobody wants as a default. Measured 31.07.2026, three runs against
 * this endpoint: 207 tok/s and 7.3s end to end — fast — but it ALWAYS thinks,
 * ~5,400 characters of it, and no flag stops that. `enable_thinking:false`,
 * `think:false` and `reasoning_effort:'none'` were each probed here: accepted
 * and ignored (5,337 chars with the flag, 5,282 without). `greenptThinkingFetch`
 * sends them anyway; here that is documented as known residue, not as a working
 * switch — unlike Scaleway, where the transport really does pin the thinking off.
 *
 * The practical consequence is why this is the failover and not the primary:
 * with a small output budget the entire allowance goes into the invisible
 * reasoning block and `content` comes back EMPTY (3/3 runs at max_tokens 700).
 * Our answer paths carry no output cap since #2002, so the case is out of reach
 * today — but re-introducing one on this lane would resurrect it, which is what
 * this note is for.
 */
const GEMMA_4_GREENPT: ModelConfigSingle = {
  kind: 'single',
  provider: 'greenpt',
  model: 'gemma4',
  contextWindow: CTX_FULL,
};

export const AVAILABLE_MODELS: Record<string, ModelConfig> = {
  // 'mistral' is intentionally absent — it uses agent defaults (like 'auto')
  'mistral-medium-3.5': {
    kind: 'single',
    provider: 'mistral',
    model: 'mistral-medium-2604',
    contextWindow: CTX_FULL,
    fallback: 'gemma-4',
  },
  // Legacy IDs — repointed to current Mistral generation (Medium 3.5)
  'mistral-large': {
    kind: 'single',
    provider: 'mistral',
    model: 'mistral-medium-2604',
    contextWindow: CTX_FULL,
  },
  'mistral-medium': {
    kind: 'single',
    provider: 'mistral',
    model: 'mistral-medium-2604',
    contextWindow: CTX_FULL,
  },
  'pixtral-large': {
    kind: 'single',
    provider: 'mistral',
    model: 'pixtral-large-latest',
    contextWindow: CTX_FULL,
  },
  regolo: {
    kind: 'single',
    provider: 'regolo',
    model: regoloTextDefault(),
    contextWindow: CTX_FULL,
  },
  // Backend-only lane and, since 03.08.2026, no longer an auto-policy target
  // (its auto-policy role moved to `gemma-4-26b`, which was itself folded into
  // `gemma-litellm` on 07.08.2026 — see autoPolicy.ts). It stays registered
  // because it is still the model the intermediate stages and the loop
  // PLANNER run on (LOOP_PLANNER_PRIMARY, DOCS_AI_MODELS / BOARD_AI_MODELS),
  // and because an id that has been persisted in threads must keep resolving.
  // Not in the model picker either (that is driven by MODEL_OPTIONS in
  // @gruenerator/core/models).
  'mistral-small-4': {
    kind: 'single',
    provider: 'regolo',
    model: 'mistral-small-4-119b',
    contextWindow: CTX_FULL,
    fallback: 'gpt-oss',
  },
  // This USER-SELECTABLE lane stays off by default (catalog `offByDefault`), so
  // nothing picks it as an answer model unless asked for by id. The greenpt
  // PROVIDER is no longer unused though: since 13.08.2026 the loop planner runs
  // there by default (LOOP_PLANNER_PRIMARY), which does not go through this
  // entry — it names provider and model directly.
  greenpt: {
    kind: 'single',
    provider: 'greenpt',
    model: env.GREENPT_DEFAULT_MODEL || GREENPT_DEFAULT_MODEL,
    contextWindow: CTX_FULL,
  },

  // Overflow lanes — Verdigado primary, Regolo on overflow when slot is busy.
  'gpt-oss': GPT_OSS_OVERFLOW,
  'gemma-4': GEMMA_ANSWER_LANE,
  // Der Name lügt seit 21.08.2026 und bleibt trotzdem: F0/F1 — er steckt in
  // persistierten Thread-Zuständen. Dahinter liegt das DICHTE 31B über Cortecs,
  // siehe GEMMA_4_31B_CORTECS. Kein Auto-Policy-Ziel mehr (in `gemma-litellm`
  // gefaltet am 07.08.2026 — siehe autoPolicy.ts), backend-only wie
  // `mistral-small-4`: nicht in MODEL_OPTIONS, also greift es niemand von Hand.
  // Seit dem 25.08.2026 ist es nicht mehr bloss ein Ausweich-Zeiger: dieselbe
  // Konfiguration bedient über GEMMA_ANSWER_LANE auch `gemma-4`,
  // `gemma-litellm` und `gruenerator-medium`. Der Ausweich-Zeiger zeigt jetzt
  // andersherum — von hier auf `gemma-regolo`.
  'gemma-4-26b': GEMMA_4_31B_CORTECS,
  // Ohne Aufrufer seit 21.08.2026 — siehe GEMMA_4_GREENPT.
  'gemma-4-greenpt': GEMMA_4_GREENPT,
};

/**
 * Die drei Größen-Lanes des Modellwählers (`MODEL_OPTIONS` in
 * @gruenerator/core/models) — dieselben Kennungen, die der OpenAI-kompatible
 * Endpunkt den Erweiterungen anbietet (`GATEWAY_LANES` in
 * services/ai/modelGateway.ts).
 *
 * Geteilt ist der NAME, nicht der Upstream: dort geht `gruenerator-medium`
 * direkt an Scaleways Gemma 26B, hier an die Konfiguration, die der Chat-Stack
 * für dieselbe Größe schon fährt — mit Fallback-Kette, Verdigado-Slot und
 * Reasoning. Genau dafür gibt es einen Lane-Namen: er lässt sich je Oberfläche
 * umhängen, ohne dass ein ausgeliefertes Bundle davon weiß.
 */
AVAILABLE_MODELS['gruenerator-small'] = GPT_OSS_OVERFLOW;
AVAILABLE_MODELS['gruenerator-medium'] = GEMMA_ANSWER_LANE;
AVAILABLE_MODELS['gruenerator-ultra'] = AVAILABLE_MODELS['mistral-medium-3.5'];

// Legacy IDs from persisted client state and DB. All point to the new overflow
// lanes so existing users get LB behavior automatically. Drop after one
// release cycle once chatStore migration v8 has propagated.
AVAILABLE_MODELS['litellm'] = GPT_OSS_OVERFLOW;
AVAILABLE_MODELS['gpt-oss-regolo'] = GPT_OSS_OVERFLOW;
AVAILABLE_MODELS['gemma-litellm'] = GEMMA_ANSWER_LANE;
AVAILABLE_MODELS['gemma-regolo'] = GEMMA_4_REGOLO;
// `gemma-4-verdigado` gab es hier bis 19.08.2026 als reines Failover-Ziel der
// Gemma-Lane. Es stand nie im User-Katalog, war nie ein Auto-Policy-Ziel und
// wurde nie persistiert (`streamWithFallback` behält die modelId des
// Primaries) — mit dem Ausweichwechsel auf `gemma-4-26b` hatte es keinen
// Aufrufer mehr. Verdigado bleibt über die GPT-OSS-Lanes erreichbar.

/**
 * Get model configuration by user-facing model ID.
 * Returns null if model ID is not recognized.
 */
export function getModelConfig(modelId: string): ModelConfig | null {
  return AVAILABLE_MODELS[modelId] || null;
}

/**
 * Resolved tuple ready to feed into getModel() + streaming. For overflow
 * configs the chosen side depends on whether the Verdigado slot was free at
 * resolution time; the unchosen sibling is exposed for single-step fallback.
 */
export interface ResolvedModelTuple {
  provider: Provider;
  model: string;
  contextWindow: number;
  /** Single-step first-token-timeout fallback target. */
  sibling?: { provider: Provider; model: string };
  /** Set when this resolution acquired the Verdigado slot. MUST be invoked
   *  after the stream finishes (success, failure, or abort). Idempotent. */
  releaseSlot?: () => Promise<void>;
}

/**
 * Resolve a user-facing modelId to a concrete provider/model tuple, acquiring
 * the Verdigado slot for overflow lanes when free.
 */
export async function resolveModelTuple(
  modelId: string,
  requestId: string,
  opts?: {
    /** Skip the Verdigado slot and go straight to the hosted Regolo side.
     *  Set for turns whose input is too large for the primary's window — see
     *  {@link VERDIGADO_INPUT_LIMIT}. Without this the request would be pruned
     *  down to the small lane's budget even though a bigger lane was free. */
    preferOverflow?: boolean;
  }
): Promise<ResolvedModelTuple | null> {
  const config = AVAILABLE_MODELS[modelId];
  if (!config) return null;

  if (config.kind === 'single') {
    const result: ResolvedModelTuple = {
      provider: config.provider,
      model: config.model,
      contextWindow: config.contextWindow,
    };
    // Honor configured fallback (e.g. mistral-medium-3.5 → gemma-4). For
    // overflow-lane fallbacks we deterministically use the overflow (Regolo)
    // side — we don't acquire the Verdigado slot from a fallback path,
    // since the slot would have to be held across the primary's failure
    // window and that risks deadlock on slot release ordering.
    if (config.fallback) {
      const sib = AVAILABLE_MODELS[config.fallback];
      if (sib?.kind === 'single') {
        result.sibling = { provider: sib.provider, model: sib.model };
      } else if (sib?.kind === 'overflow') {
        result.sibling = { provider: sib.overflow.provider, model: sib.overflow.model };
      }
    }
    return result;
  }

  if (opts?.preferOverflow) {
    return {
      provider: config.overflow.provider,
      model: config.overflow.model,
      contextWindow: config.overflowContextWindow,
      sibling: { provider: config.primary.provider, model: config.primary.model },
    };
  }

  const acquired = await tryAcquireVerdigadoSlot(requestId);
  if (acquired) {
    return {
      provider: config.primary.provider,
      model: config.primary.model,
      contextWindow: config.contextWindow,
      sibling: { provider: config.overflow.provider, model: config.overflow.model },
      releaseSlot: () => releaseVerdigadoSlot(requestId),
    };
  }
  return {
    provider: config.overflow.provider,
    model: config.overflow.model,
    contextWindow: config.overflowContextWindow,
    sibling: { provider: config.primary.provider, model: config.primary.model },
  };
}

/**
 * Default context window for Mistral agent defaults and unknown models.
 * Conservative enough to avoid overflow, generous enough for good responses.
 */
const DEFAULT_CONTEXT_WINDOW = 32768;

/**
 * Get context window size (in tokens) for a model.
 * Looks up AVAILABLE_MODELS first, then falls back to provider defaults.
 */
export function getContextWindow(
  modelId: string | null | undefined,
  // `anthropic` stammt aus dem Agent-Contract (agentProviderSchema), der eine
  // eigene Liste führt und den Bedrock-Rest noch kennt; der Rest ist
  // ProviderName. Vierte Kopie derselben Achse — siehe services/providers/types.ts.
  provider?: ProviderName | 'anthropic'
): number {
  if (modelId && AVAILABLE_MODELS[modelId]) {
    return AVAILABLE_MODELS[modelId].contextWindow;
  }

  // Provider-level defaults for agent configs that use 'auto' or unnamed models
  if (provider === 'mistral') return CTX_FULL;
  // Verdigado is Ollama-backed and truncates silently past its window, so its
  // default stays at the end-to-end verified size rather than the nominal one.
  if (provider === 'litellm') return CTX_VERDIGADO;
  if (provider === 'regolo') return CTX_FULL;
  if (provider === 'greenpt') return CTX_FULL;
  // Gemma 4 26B-A4B carries 262k on Scaleway's H100 instances (model card).
  if (provider === 'scaleway') return CTX_FULL;
  // NICHT CTX_FULL, obwohl die Gewichte mehr tragen: der Cortecs-Endpunkt
  // führt 128k (Katalog). Die Zahl steht bei GEMMA_31B_ON_CORTECS, damit ein
  // Host-Wechsel sie nicht hier vergisst.
  if (provider === 'cortecs') return GEMMA_31B_ON_CORTECS.contextWindow;

  return DEFAULT_CONTEXT_WINDOW;
}

// Provider clients come from the ONE construction site — see
// services/ai/providerInstances.ts. This module used to build its own four
// singletons; they drifted from the worker path's copies in base-URL handling,
// failure modes and `fetch` wrappers, and the GreenPT thinking-disable wrapper
// had to be threaded into both by hand.
//
// `isProviderConfigured` is re-exported unchanged in meaning for `mistral`,
// `regolo` and `greenpt`. For `litellm` it is now key-only: this copy also
// required LITELLM_BASE_URL, but that variable has a documented default, so
// demanding it reported "not configured" for a lane that would in fact work
// (and that the worker path used happily).
//
// Several modules import isProviderConfigured from here (boardAiService,
// notebookStreamCore, docs/aiController, presentationAiService,
// sheetAiService), so it is re-exported rather than every importer being
// repointed in the same change.
export { isProviderConfigured };

export function getModel(
  provider: string,
  modelId: string,
  options: RouteOptions = {}
): LanguageModel {
  // Ein zäh vermerktes Paar wird übersprungen statt abgewartet — siehe
  // services/ai/modelSiblings.ts. Ohne Vermerk ändert sich hier nichts.
  //
  // `acceptTarget` MUSS hier durchgereicht werden. Dies ist die ZWEITE
  // `getModel`-Tür neben der in `services/ai/providers.ts`, und es ist die, die
  // der ganze Chat-Pfad benutzt (`responseStreamingService`, der Synth-Slot,
  // `getLoopSynthFallbackModel`). Nur an der anderen Tür gesetzt, wurde das
  // Veto still verworfen und die Ausweichkette landete weiter auf
  // `litellm/verdigado-pro` (= gpt-oss am Proxy) — der Fix hätte nichts
  // bewirkt, und ein Test, der bloss das übergebene Options-Objekt prüft,
  // hätte es nicht gemerkt.
  const healthy = pickHealthyTarget(provider, modelId, options.acceptTarget);
  const lane = healthy ?? { provider, model: modelId };

  // Attribute usage to the upstream that actually served it — the Mistral lane
  // runs on Scaleway. `takeProviderFallback` is deliberately NOT set for that:
  // it drives user-visible "answered on a different model" reporting, and this
  // is the same model on a different upstream, which users should not be shown.
  const upstream =
    lane.provider === 'mistral' ? routeMistralModel(lane.model, options).upstream : lane.provider;
  // Werkzeug-Aufruf-IDs werden erst hier leitungsfähig gemacht — siehe
  // services/ai/toolCallIds.ts. Das ist die Tür, die der ganze Chat-Pfad
  // benutzt, und damit die, über die der Wiederabspieler seine persistierten
  // `tc_…`-IDs auf die Leitung schickt.
  const model = withUsageTracking(
    withWireSafeToolCallIds(instantiateModel(lane.provider, lane.model, options)),
    upstream
  );

  // Ein Gesundheits-Tausch IST ein anderes Modell — anders als der
  // Scaleway-Upstream oben. Er wird nach `instantiateModel` gemeldet, weil das den
  // Vermerk zurücksetzt, und über denselben Kanal wie der bestehende
  // First-Token-Fallback: die Anzeige sagt dann, worauf geantwortet wurde.
  if (healthy) lastFallbackProvider = healthy.provider;
  return model;
}

/**
 * The Regolo divergence is DELIBERATE and must stay visible.
 *
 * The worker path (`services/ai/providers.ts`) throws without REGOLO_API_KEY.
 * This path substitutes Mistral instead, because a chat turn that answers on a
 * different lane beats one that 500s. That is a real product decision, not
 * drift — but it used to be invisible: the caller could not tell it had been
 * handed a different provider, and the only trace was a console.log among
 * dozens of others.
 *
 * It is now logged at WARN and reported through `lastFallbackProvider` so a
 * caller that cares can say so. Do NOT "clean this up" by picking one side.
 */
let lastFallbackProvider: string | null = null;

/** The provider actually used, if the last instantiateModel silently substituted
 *  one. Read immediately after getModel; null when no substitution happened. */
export function takeProviderFallback(): string | null {
  const v = lastFallbackProvider;
  lastFallbackProvider = null;
  return v;
}

/**
 * Build the SDK model object for an ALREADY-CHOSEN provider/model pair.
 *
 * Was `resolveModel`, which is what `responseStreamingService` calls the
 * function that decides WHICH model a turn gets (user pick → auto policy →
 * agent default). Two different questions under one name, in the same call
 * chain; this one only constructs.
 */
function instantiateModel(
  provider: string,
  modelId: string,
  options: RouteOptions = {}
): LanguageModel {
  lastFallbackProvider = null;
  switch (provider) {
    case 'mistral': {
      const routed = routeMistralModel(modelId, options);
      return routed.upstream === 'scaleway'
        ? getScalewayProvider().chat(routed.model)
        : getMistralProvider()(routed.model);
    }
    case 'litellm':
      return getLiteLLMProvider().chat(modelId || LITELLM_DEFAULT_MODEL);
    case 'regolo': {
      if (!env.REGOLO_API_KEY) {
        log.warn(
          `REGOLO_API_KEY not set — answering on Mistral instead of Regolo (requested "${modelId}")`
        );
        lastFallbackProvider = 'mistral';
        return getMistralProvider()(modelId);
      }
      return getRegoloProvider().chat(modelId || regoloTextDefault());
    }
    case 'greenpt':
      return getGreenPTProvider().chat(
        modelId || env.GREENPT_DEFAULT_MODEL || GREENPT_DEFAULT_MODEL
      );
    // The TEXT instance, not `getScalewayProvider()`: that one carries the
    // Mistral-fallback fetch, which belongs to Medium 3.5 and would route a
    // Gemma id to an upstream that does not serve it. This one pins
    // `reasoning_effort: 'none'` instead — the enforcement the MoE relies on.
    case 'scaleway': {
      if (!env.SCALEWAY_API_KEY) {
        // Without the key every turn here would 401 and only then fail over.
        // Naming the substitute here keeps the lane inside the Gemma family and
        // says so once in the log instead of once per request downstream.
        log.warn(
          `SCALEWAY_API_KEY not set — answering on Regolo Gemma 4 instead (requested "${modelId}")`
        );
        lastFallbackProvider = 'regolo';
        return getRegoloProvider().chat(GEMMA_4_REGOLO.model);
      }
      // Literal, NICHT aus einer Lane-Konfiguration gezogen: das ist der Name,
      // den DIESER Host serviert. Eine Lane, die den Provider wechselt, nähme
      // ihren Modellnamen sonst mit und liesse hier einen unbekannten zurück —
      // genau das passierte am 21.08.2026 beim Umzug auf GreenPT.
      return getScalewayTextProvider().chat(modelId || 'gemma-4-26b-a4b-it');
    }
    // Dieselbe Ersatzregel wie oben, aus demselben Grund — und hier zusätzlich,
    // weil Cortecs vorausbezahlt ist: ein leeres Guthaben antwortet mit 401 wie
    // ein fehlender Schlüssel, nur eben erst auf der Leitung. Der Schlüsseltest
    // fängt den einen Fall früh ab, die Fallback-Kette den anderen.
    case 'cortecs': {
      if (!env.CORTECS_API_KEY) {
        log.warn(
          `CORTECS_API_KEY not set — answering on Regolo Gemma 4 instead (requested "${modelId}")`
        );
        lastFallbackProvider = 'regolo';
        return getRegoloProvider().chat(GEMMA_4_REGOLO.model);
      }
      return getCortecsProvider().chat(modelId || GEMMA_4_31B_CORTECS.model);
    }
    case 'anthropic':
      throw new Error('Anthropic provider is not yet implemented');
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

/**
 * Whether a resolved model can drive the agentic chat tool loop (native
 * function calling with multi-step tool use).
 *
 * test-branch: PERMISSIVE — mistral + litellm (Verdigado, a confirmed
 * tool-caller) + regolo (Gemma-4 / GPT-OSS) are all allowed so every model
 * selection can be verified live. The master-bound PR keeps this Mistral-only;
 * promote a provider to prod only after its tool-calling is confirmed here
 * (watch for Regolo GPT-OSS leaking reasoning into content instead of emitting
 * tool_calls).
 */
export function isAgenticToolCapable(provider: string, _modelName: string): boolean {
  return provider === 'mistral' || provider === 'litellm' || provider === 'regolo';
}

/**
 * Whether the SELECTED model drives the tool loop directly (unified single-model
 * pass) vs. delegating tool orchestration to the fast planner (planner/executor
 * split: the `standard` intermediate stage gathers, selected model writes the answer).
 *
 * True only for Mistral — our fast NATIVE tool-caller, where one pass is both
 * fastest and highest-fidelity. Everything else splits: the fixed fast planner
 * does every tool call (so tool-calling reliability no longer depends on the
 * user's model) and the selected model only writes prose — which is why ANY
 * model, including slow "thinking" lanes and non-tool-callers, is now selectable
 * for the loop.
 */
export function prefersUnifiedLoop(provider: string, _modelName: string): boolean {
  return provider === 'mistral';
}

/**
 * Split-mode model policy — the planner/executor split gives us two independent
 * slots, so we point each at its best NON-CHINESE model instead of forcing the
 * user's (often slow) lane model into both roles.
 *
 * The slot DECLARATIONS live in `autoPolicy.ts` alongside the intent table, so
 * planner, synth and the single-pass answer read as one policy rather than two
 * systems overriding each other. This module only turns them into
 * LanguageModel instances (it owns env + getModel).
 */

function loopPlannerChoice(): { provider: Provider; model: string } {
  // GreenPT first — see LOOP_PLANNER_PRIMARY in autoPolicy.ts for why. Regolo
  // stays the self-hosted option, litellm/verdigado-pro the last resort.
  if (isProviderConfigured('greenpt')) return LOOP_PLANNER_PRIMARY;
  if (isProviderConfigured('regolo')) return LOOP_PLANNER_SELFHOSTED;
  // Last resort when NOTHING is configured, and it has to be litellm: its
  // provider has a default base URL and tolerates an empty key, while greenpt
  // and regolo both THROW without one. Returning the primary here (as this did
  // until 14.08.2026) killed every agentic turn with "GREENPT_API_KEY
  // environment variable is required" — the loop never reached its first model
  // call. Before the lane moved to GreenPT the same line returned regolo, which
  // `instantiateModel` silently substitutes with Mistral, so the bug was invisible.
  return LOOP_PLANNER_FALLBACK;
}

function loopSynthWriterChoice(): { provider: Provider; model: string } {
  return isProviderConfigured('regolo') ? LOOP_SYNTH_PRIMARY : LOOP_SYNTH_FALLBACK;
}

/**
 * Das Veto, das die antwortschreibenden Slots der Ausweichkette mitgeben.
 *
 * AVOID_AS_SYNTH entschied bis 19.08.2026 nur, WELCHES Modell ein Slot wählt.
 * Wurde dieses Modell danach als zäh vermerkt, suchte `modelSiblings` einen
 * Ersatz — ohne die Regel noch einmal zu lesen — und landete auf
 * `litellm/verdigado-pro`, hinter dem am Proxy `gpt-oss:120b-ctx128k` liegt.
 * Genau das Modell also, das die Regel für diesen Zweck ausschliesst.
 */
const synthTargetAllowed = mayWriteAnswer;

/** Human-readable planner model name (for the [Agentic] log line). */
export function loopPlannerModelName(): string {
  return loopPlannerChoice().model;
}

export function getLoopPlannerModel(): LanguageModel {
  const p = loopPlannerChoice();
  return getModel(p.provider, p.model);
}

/**
 * Sibling lane for the split's WRITE phase, tried once when the chosen synth
 * lane accepts the request and then goes silent.
 *
 * The planner lane is the deliberate pick: it is already resolved for this
 * turn, it is the confirmed fast responder, and it has just read every gathered
 * source — so it can answer over them without any new configuration or a second
 * slot. Returns null when the synth already IS that lane, since falling back
 * onto the stalled host would only repeat the stall.
 */
export function getLoopSynthFallbackModel(
  synthName: string
): { model: LanguageModel; name: string } | null {
  const p = loopPlannerChoice();
  if (p.model === synthName) return null;
  // Diese Lane SCHREIBT hier die Nutzer-Antwort, sie plant nicht. Ein
  // Planer-Ausweich, den der Synth-Slot ablehnt, ist deshalb auch hier keiner:
  // `loopPlannerChoice` endet ohne GreenPT/Regolo auf litellm/verdigado-pro
  // (= gpt-oss), dessen Planer-Text sonst als Antwort beim Menschen landet.
  if (!synthTargetAllowed(p)) return null;
  return {
    model: getModel(p.provider, p.model, { acceptTarget: synthTargetAllowed }),
    name: p.model,
  };
}

/**
 * Synthesizer for the split's write phase. Pure DECISION (no model
 * instantiation) — env-free & unit-testable. `null` provider means "honor the
 * resolved model as-is".
 *
 * `undecided` = no deliberate choice was made for this turn, so fall back to
 * the best-writer lane. Since the auto policy now resolves `auto` to a concrete
 * lane BEFORE the loop runs, that resolution IS a deliberate choice and callers
 * pass `false` — the policy's pick reaches the synth slot instead of being
 * silently replaced.
 *
 * AVOID_AS_SYNTH still applies either way, but it no longer has to catch the
 * Gemma lane: `gemma-litellm` now resolves to gemma4-31b on Regolo directly
 * (see GEMMA_4_REGOLO), so the rewrite that used to save that lane from
 * `verdigado-think` is a no-op for it. The guard stays for the lanes it still
 * covers — gpt-oss and any agent config naming a think lane by hand.
 */
export function loopSynthChoice(
  resolvedModelName: string,
  undecided: boolean
): { provider: Provider | null; model: string } {
  const useWriter = undecided || AVOID_AS_SYNTH.test(resolvedModelName);
  if (!useWriter) return { provider: null, model: resolvedModelName };
  return loopSynthWriterChoice();
}

export function getLoopSynthModel(
  resolution: { model: LanguageModel; modelName: string; provider: string },
  undecided: boolean
): { model: LanguageModel; name: string; provider: string } {
  const choice = loopSynthChoice(resolution.modelName, undecided);
  if (choice.provider === null) {
    return { model: resolution.model, name: resolution.modelName, provider: resolution.provider };
  }
  return {
    model: getModel(choice.provider, choice.model, { acceptTarget: synthTargetAllowed }),
    name: choice.model,
    provider: choice.provider,
  };
}

/**
 * Cheap, slot-free check of whether the model that WILL be used (user selection
 * or agent default) can drive the agentic loop. Mistral lanes never acquire an
 * overflow slot, so this can decide the agentic branch before the heavier
 * `instantiateModel` runs — without double-acquiring a Verdigado slot.
 */
export function selectionIsToolCapable(agentProvider: string, modelId?: string): boolean {
  if (modelId && modelId !== 'mistral' && modelId !== 'auto') {
    const cfg = AVAILABLE_MODELS[modelId];
    if (cfg) {
      const provider = cfg.kind === 'single' ? cfg.provider : cfg.primary.provider;
      const model = cfg.kind === 'single' ? cfg.model : cfg.primary.model;
      return isAgenticToolCapable(provider, model);
    }
    // Unknown id → agent default is used, fall through.
  }
  return isAgenticToolCapable(agentProvider, '');
}

export function getProviderName(provider: AgentConfig['provider'] | Provider): string {
  switch (provider) {
    case 'mistral':
      return 'Mistral AI';
    case 'litellm':
      return 'Verdigado';
    case 'regolo':
      return 'Regolo AI';
    case 'greenpt':
      return 'GreenPT';
    case 'scaleway':
      return 'Scaleway';
    case 'cortecs':
      return 'Cortecs';
    case 'anthropic':
      return 'Anthropic Claude';
    default:
      return 'Unknown';
  }
}
