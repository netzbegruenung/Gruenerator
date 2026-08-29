/**
 * Unified AI Provider Configuration
 * Centralizes all AI provider management using Vercel AI SDK
 *
 * This module provides a single source of truth for:
 * - Provider instantiation (Mistral, LiteLLM, Regolo)
 * - Model selection based on provider
 * - Provider availability checking
 */

import { env } from '../../config/env.js';
import { withUsageTracking } from '../usage/usageModelMiddleware.js';

import { withFallbackChain } from './fallbackModel.js';
import { intermediateLane } from './intermediateLanes.js';
import { isModelSlow } from './modelHealth.js';
import { pickHealthyTarget } from './modelSiblings.js';
import {
  getGreenPTProvider,
  getLiteLLMProvider,
  getMistralProvider,
  getCortecsProvider,
  getRegoloProvider,
  getScalewayProvider,
  getScalewayTextProvider,
  isProviderConfigured,
  routeMistralModel,
} from './providerInstances.js';
import { regoloTextDefault } from './textModelPolicy.js';
import { withWireSafeToolCallIds } from './toolCallIds.js';

import type { IntermediateLaneId, LaneTarget } from './intermediateLanes.js';
import type { RouteOptions } from './providerInstances.js';
import type { LanguageModel } from 'ai';

/**
 * Provider name types.
 *
 * `scaleway` is the newest member and the one with a caveat. Mistral Medium 3.5
 * runs on Scaleway WITHOUT being this provider — that lane stays `mistral` and
 * picks its upstream in `routeMistralModel`, because every policy check
 * (`isAgenticToolCapable`, `prefersUnifiedLoop`, the context windows, the
 * fallback chains) keys off `provider === 'mistral'` and a sibling name would
 * have switched all of it off for the main model. See CLAUDE.md.
 *
 * What `scaleway` IS for: models Scaleway serves that Mistral does not publish,
 * where no such policy applies. A model that needs the mistral policy set does
 * NOT belong here.
 *
 * `cortecs` hat seit 21.08.2026 die Gemma-Lane von `scaleway` übernommen und
 * ist damit der Name, unter dem Gemma 4 26B-A4B läuft. Es ist ein ROUTER: das
 * Modell wird gemessen an Scaleway weitervermittelt (Header
 * `x-cortecs-provider`), der Wechsel betrifft also den Vertragspartner, nicht
 * den Verarbeitungsort. `scaleway` bleibt daneben stehen, weil die ruhende
 * Mistral-Medium-Route es weiter braucht.
 *
 * When adding a provider, note that most switches below carry a `default`
 * branch, so the compiler will NOT find the sites for you. The exhaustive ones
 * (`Record<ProviderName, …>` in services/ai/execution/execute.ts and
 * services/ai/modelDiscovery.ts) will; the rest are listed in the PR that
 * introduced this member.
 */
export const PROVIDER_NAMES = [
  'mistral',
  'litellm',
  'regolo',
  'greenpt',
  'scaleway',
  'cortecs',
] as const;

/**
 * Abgeleitet von `PROVIDER_NAMES`, damit sich die Anbietermenge nie zweimal
 * pflegen lässt: `ToolHandler.formatToolsForProvider` (Issue #3044) gateet
 * auf genau diesem Array. Bis zum 28.08.2026 führte ToolHandler eine eigene
 * Liste `['litellm', 'mistral']`, und genau diese Zweitliste stufte
 * greenpt/cortecs/scaleway/regolo als "Unknown provider" ab und ließ
 * Claude-shaped Tools unverändert durch.
 */
export type ProviderName = (typeof PROVIDER_NAMES)[number];

// Default models per provider
const PROVIDER_DEFAULTS = {
  mistral: 'mistral-medium-2604',
  litellm: 'verdigado-pro',
  regolo: regoloTextDefault(),
  greenpt: env.GREENPT_DEFAULT_MODEL ?? 'mistral-medium-3.5-128b',
  // Gemma 4 26B-A4B. Named rather than inherited: Scaleway also serves
  // `mistral-medium-3.5-128b`, and an unnamed default here would quietly hand
  // the expensive model to a caller that asked for the cheap lane.
  scaleway: 'gemma-4-26b-a4b-it',
  // Das DICHTE Gemma 4 31B, nicht die MoE-Variante von Scaleway darüber: die
  // ist über Cortecs seit dem 21.08.2026 unbedienbar (siehe `providerForModel`
  // in lanes.ts). Benannt statt geerbt aus demselben Grund wie oben — Cortecs
  // vermittelt einen ganzen Katalog, ein unbenannter Default hier wäre eine
  // Wette darauf, welches Modell er gerade vorne führt.
  cortecs: 'gemma-4-31b-it',
} as const;

/**
 * A language model for one of the intermediate stages.
 *
 * The lane is REQUIRED — the old parameterless `getIntermediateModel()` is what
 * put a thread title and `computeNode` on the same model, and a default value
 * here would rebuild exactly that. Which stage a caller belongs to is a
 * decision, not a fallback; `services/ai/intermediateLanes.ts` holds the table
 * and the measurements behind it.
 */
/**
 * Die Ziele einer Stufe, in der Reihenfolge, in der sie wirklich gefragt werden.
 *
 * Getrennt von `getIntermediateModel`, weil hier die ganze Entscheidung liegt
 * und sie sonst nur über gebaute Modelle prüfbar wäre — siehe die Wächter in
 * `__tests__/intermediateFallback.vitest.ts`.
 *
 * ── Warum diese Tür ihre Zäh-Behandlung selbst macht ──
 *
 * `getModel` fragt im Kopf `pickHealthyTarget` und ersetzt ein als zäh
 * vermerktes Paar STILL. Diese Ersetzung kennt die Kette nicht: sie zieht ihr
 * Ziel aus `MODEL_SIBLINGS`, sonst aus `FALLBACK_CHAIN`
 * (litellm → regolo → mistral). Für einen Aufrufer mit EINEM Ziel ist das
 * richtig; für einen, der bereits eine Kette deklariert hat, bricht es genau
 * die zwei Eigenschaften, die diese Kette zusichert:
 *
 * 1. **Die Kette klappt auf einen Anbieter zusammen.** `heavy` und `pruefung`
 *    führen `cortecs/gemma-4-31b-it` vor `regolo/gemma4-31b` — und die beiden
 *    sind einander als Geschwister eingetragen (gemmaHosts.ts). Ein zäher
 *    Cortecs macht aus Glied 1 genau Glied 2: zwei „verschiedene
 *    Vertragspartner" werden zu zwei Aufrufen an dasselbe Konto.
 * 2. **Ein Reasoning-Modell rutscht in die kleinen Stufen.** Die
 *    Small-3.2-Paare stehen in KEINER Geschwister-Zeile, fallen also auf
 *    `FALLBACK_CHAIN` — deren erstes Glied ist `litellm/verdigado-pro`, das
 *    Modell, das `trivial`/`standard` ausdrücklich nicht bedienen dürfen (bei
 *    `maxOutputTokens` 8–200 frisst das Denken das Budget, 0 von 90 Läufen
 *    brauchbar; siehe Regel 2 an `fallback` in intermediateLanes.ts). Es käme
 *    ein Glied hinzu, das garantiert leer antwortet — auf der Stufe mit
 *    900-ms-Sperren.
 *
 * Dass die Ausweich-Logik dorthin führt, ist im Repo belegt und nicht neu:
 * `modelSiblings.vitest.ts` hält beides als Verhalten fest, samt des Vorfalls
 * vom 19.08.2026, bei dem derselbe Weg auf ein Verbots-Modell zeigte. Behoben
 * wurde er dort, wo er auch hier hingehört — mit einem Veto des Aufrufers.
 *
 * ── Was stattdessen passiert ──
 *
 * Ein zähes Ziel wird nicht ERSETZT, sondern ans Ende der eigenen Kette
 * geschoben. Das ist die schwächere und die richtigere Bewegung: die Kette hat
 * ihre Alternativen bereits deklariert, gemessen und begründet — sie braucht
 * keine von aussen. Kein Ziel geht verloren (ein zähes Modell antwortet
 * langsam, nicht falsch), kein fremdes kommt hinzu, und die Reihenfolge bleibt
 * eine Aussage dieser Datei statt eine der Geschwister-Tabelle.
 *
 * Für ZÄH statt AUSFALL gibt es ausserdem den `hedge`, der parallel schaltet
 * (siehe `runStep` in routes/chat/services/agentPipeline.ts). Diese Kette
 * rückt nur bei Fehlschlag weiter.
 */
export function resolveIntermediateChain(lane: IntermediateLaneId): LaneTarget[] {
  const config = intermediateLane(lane);
  const declared: LaneTarget[] = [
    { provider: config.provider, model: config.model },
    ...config.fallback,
  ];

  // Unkonfigurierte Anbieter fallen VOR dem Bauen heraus, nicht beim Aufruf:
  // ein Client ohne Schlüssel scheitert sonst erst im Netz und kostet die
  // Zeitüberschreitung, bevor die Kette weiterrückt. Bleibt nichts übrig, geht
  // der deklarierte Primär trotzdem raus — sein Fehler ist die ehrlichere
  // Auskunft als ein stiller Ausfall an dieser Stelle.
  const configured = declared.filter((t) => isProviderConfigured(t.provider));
  const candidates = configured.length > 0 ? configured : declared.slice(0, 1);

  const slow = (t: LaneTarget): boolean => isModelSlow(t.provider, t.model);
  return [...candidates.filter((t) => !slow(t)), ...candidates.filter(slow)];
}

export function getIntermediateModel(lane: IntermediateLaneId): LanguageModel {
  const chain = resolveIntermediateChain(lane);

  // Das Veto: `getModel` fragt `pickHealthyTarget` selbst, und ohne diese Zeile
  // könnte es die oben getroffene Reihenfolge wieder umschreiben — mit einem
  // Ziel, das in dieser Kette nichts zu suchen hat. Die Zäh-Behandlung ist
  // hier bereits erledigt, siehe `resolveIntermediateChain`.
  const models = chain.map((t) => getModel(t.provider, t.model, { acceptTarget: () => false }));

  return withFallbackChain(models[0], models.slice(1), `intermediate:${lane}`);
}

// Provider clients are constructed in ONE place — see ./providerInstances.ts
// for why (two copies drifted in base-URL handling, failure modes and, most
// consequentially, `fetch` wrappers). Re-exported here so the many existing
// importers of this module keep working.
export {
  LITELLM_DEFAULT_BASE_URL,
  REGOLO_BASE_URL,
  GREENPT_BASE_URL,
  MISTRAL_API_URL,
  isProviderConfigured,
  logProviderAvailability,
} from './providerInstances.js';

/**
 * Das Modell, mit dem der Monitor im Hintergrund schreibt.
 *
 * Lief bis 19.08.2026 auf litellm/verdigado-pro. Das Problem war nicht die
 * Qualität, sondern der geteilte Engpass: Verdigado hat EINEN Inferenz-Slot,
 * und derselbe Host bediente den stündlichen Monitor-Lauf, die GPT-OSS-Lanes
 * und (bis zum selben Tag) den Ausweg der Chat-Gemma-Lane. Ein Hintergrundlauf
 * darf einem wartenden Menschen nicht den Ausweichhost wegnehmen — deshalb
 * zieht der Monitor auf GreenPT um, und die Chat-Lanes behalten Regolo,
 * Scaleway und Verdigado für sich.
 *
 * `mistral-small-3.2-24b` und NICHT `gemma4`, obwohl beide auf GreenPT liegen:
 * GreenPTs Gemma denkt immer (~5.400 Zeichen, kein Flag schaltet es ab, siehe
 * `greenptThinkingFetch`), das Denken zählt gegen `maxOutputTokens`, und fünf
 * der neun Monitor-Aufrufe hier haben eine Decke von 1.500–2.000 — bei der
 * käme leerer Text zurück. Small denkt nicht und schreibt als
 * `LOOP_PLANNER_PRIMARY` auf genau diesem Host bereits produktiv.
 */
const MONITOR_GREENPT_MODEL = 'mistral-small-3.2-24b-instruct-2506';

export function getMonitorModel(): LanguageModel {
  if (isProviderConfigured('greenpt')) return getModel('greenpt', MONITOR_GREENPT_MODEL);
  return getModel('mistral');
}

/**
 * Get a language model instance for the specified provider and model.
 * The returned model is wrapped so its token usage is attributed to the
 * current request's user (no-op outside an authenticated request).
 */
export function getModel(
  provider: ProviderName | string,
  modelId?: string,
  options: RouteOptions = {}
): LanguageModel {
  // Ein zäh vermerktes Paar wird übersprungen statt abgewartet — siehe
  // services/ai/modelSiblings.ts. Ohne Vermerk ändert sich hier nichts.
  const healthy = pickHealthyTarget(
    provider,
    modelId || getDefaultModel(provider),
    options.acceptTarget
  );
  const lane = healthy ?? { provider, model: modelId };

  // Usage is attributed to the upstream that actually serves the request, not
  // to the lane name: with Mistral Medium 3.5 on Scaleway, billing the tokens
  // to "mistral" would make the Scaleway invoice unaccountable.
  const upstream =
    lane.provider === 'mistral'
      ? routeMistralModel(lane.model || PROVIDER_DEFAULTS.mistral, options).upstream
      : lane.provider;
  // Werkzeug-Aufruf-IDs werden erst hier leitungsfähig gemacht — siehe
  // ./toolCallIds.ts. Beide `getModel`-Türen tun das; wer eine dritte baut,
  // muss es mitbauen, sonst kippt der erste wiederabgespielte Aufruf die
  // Anfrage mit einem 400 des Mistral-Validators.
  return withUsageTracking(
    withWireSafeToolCallIds(instantiateModel(lane.provider, lane.model, options)),
    upstream
  );
}

function instantiateModel(
  provider: ProviderName | string,
  modelId?: string,
  options: RouteOptions = {}
): LanguageModel {
  switch (provider) {
    case 'mistral': {
      // Medium 3.5 runs on Scaleway; everything else Mistral publishes
      // (Pixtral, Small, embeddings) stays on the Mistral API, as do thinking
      // requests. See routeMistralModel for why this is not a ProviderName.
      const routed = routeMistralModel(modelId || PROVIDER_DEFAULTS.mistral, options);
      if (routed.upstream === 'scaleway') {
        return getScalewayProvider().chat(routed.model);
      }
      const mistral = getMistralProvider();
      return mistral(routed.model);
    }
    case 'litellm': {
      const litellm = getLiteLLMProvider();
      return litellm.chat(modelId || PROVIDER_DEFAULTS.litellm);
    }
    case 'regolo': {
      const regolo = getRegoloProvider();
      return regolo.chat(modelId || PROVIDER_DEFAULTS.regolo);
    }
    case 'greenpt': {
      const greenpt = getGreenPTProvider();
      return greenpt.chat(modelId || PROVIDER_DEFAULTS.greenpt);
    }
    case 'scaleway': {
      // Its own client, NOT the one routeMistralModel reaches: this one forces
      // `reasoning_effort: 'none'` on every request (scalewayThinkingFetch).
      // Gemma 4 26B-A4B thinks by default and answers with an EMPTY `content`
      // when it does — measured 2026-08-01, empty even at max_tokens 1500 after
      // 5386 characters of reasoning.
      const scaleway = getScalewayTextProvider();
      return scaleway.chat(modelId || PROVIDER_DEFAULTS.scaleway);
    }
    case 'cortecs': {
      // Der Denk-Pin sitzt wie bei Scaleway im `fetch`, aber modellabhängig:
      // Cortecs ist ein Fan-out, und ein Unteranbieter im selben Katalog weist
      // `reasoning_effort: 'none'` mit HTTP 400 ab. Derselbe `fetch` trägt die
      // Souveränitäts-Weisung — siehe cortecsRequestPolicy.ts.
      const cortecs = getCortecsProvider();
      return cortecs.chat(modelId || PROVIDER_DEFAULTS.cortecs);
    }
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

/**
 * Get default model for a provider
 */
export function getDefaultModel(provider: ProviderName | string): string {
  switch (provider) {
    case 'mistral':
      return PROVIDER_DEFAULTS.mistral;
    case 'litellm':
      return PROVIDER_DEFAULTS.litellm;
    case 'regolo':
      return PROVIDER_DEFAULTS.regolo;
    case 'greenpt':
      return PROVIDER_DEFAULTS.greenpt;
    case 'scaleway':
      return PROVIDER_DEFAULTS.scaleway;
    case 'cortecs':
      return PROVIDER_DEFAULTS.cortecs;
    default:
      return PROVIDER_DEFAULTS.mistral;
  }
}

/**
 * Get human-readable provider name
 */
export function getProviderDisplayName(provider: ProviderName | string): string {
  switch (provider) {
    case 'mistral':
      return 'Mistral AI';
    case 'litellm':
      return 'LiteLLM (GPT-OSS)';
    case 'regolo':
      return 'Regolo AI';
    case 'greenpt':
      return 'GreenPT';
    case 'scaleway':
      return 'Scaleway';
    case 'cortecs':
      return 'Cortecs';
    default:
      return 'Unknown Provider';
  }
}

/**
 * Normalize provider name to canonical form
 */
export function normalizeProviderName(provider: string): ProviderName {
  const lower = provider.toLowerCase();
  if (lower === 'litellm') return 'litellm';
  if (lower === 'regolo') return 'regolo';
  if (lower === 'greenpt') return 'greenpt';
  if (lower === 'scaleway') return 'scaleway';
  if (lower === 'cortecs') return 'cortecs';
  return 'mistral';
}
