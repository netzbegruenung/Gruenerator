/**
 * Wohin ausweichen, wenn ein Modell gerade zäh ist.
 *
 * Zwei Quellen, in dieser Reihenfolge:
 *
 * 1. **Ein belegtes Geschwister** — dasselbe Modell bei einem anderen Anbieter,
 *    an denselben Prompts gegeneinander gemessen. Gleichwertigkeit ist hier
 *    nachgewiesen, nicht angenommen.
 * 2. **Die bestehende Fallback-Kette** (`litellm → regolo → mistral`), die heute
 *    schon greift, wenn ein Anbieter AUSFÄLLT. Sie ist für Ausfall gebaut und
 *    nicht für Gleichwertigkeit — ein Qualitätsunterschied ist also möglich.
 *    Bewusst angenommen: die Alternative ist nicht „dasselbe Modell", sondern
 *    „minutenlang warten".
 *
 * Nie ausgewichen wird auf ein Paar, das selbst als zäh vermerkt ist — sonst
 * schiebt eine anbieterweite Störung den Verkehr im Kreis.
 *
 * Und nie auf ein Modell, das der AUFRUFER für seinen Zweck ausschliesst:
 * `isAcceptable` reicht diese Frage von oben herein. Ohne sie war die Kette
 * blind — der Loop-Synth-Slot lehnt gpt-oss ausdrücklich ab (AVOID_AS_SYNTH in
 * autoPolicy.ts), aber die Ausweichkette landete bei zähem Primär auf
 * `litellm/verdigado-pro`, hinter dem am Proxy genau dieses Modell liegt. Die
 * Verbots-Entscheidung fiel eine Ebene HÖHER und wurde hier nie erneut
 * gestellt. Das Prädikat kommt als Argument statt als Import, damit diese
 * Datei die Policy-Ebene nicht kennen muss.
 */

import { createLogger } from '../../utils/logger.js';

import { isModelSlow } from './modelHealth.js';
import { getDefaultModel, isProviderConfigured } from './providers.js';

import type { ProviderName } from './providers.js';

const log = createLogger('modelSiblings');

export interface ModelTarget {
  provider: ProviderName;
  model: string;
}

/**
 * Gemessen gleichwertige Paare. Ein Eintrag gehört zum MODELL, nicht zur Lane:
 * `regolo/gemma4-31b` bedient 14 Lanes in `lanes.ts`, den Synth-Slot des
 * Chat-Loops und die Prüf-Stufe — ein Eintrag deckt sie alle ab.
 *
 * `gemma-4-26b-a4b-it` (über Cortecs, vermittelt nach Scaleway/Paris) gegen
 * `gemma4-31b` (Regolo), gemessen am 01.08. an den echten Prompts der
 * Zwischenstufen und am 14.08. am echten Prüf-Prompt: gleiche Inhaltstreue,
 * rund doppelte Geschwindigkeit. Siehe den Doc-Block bei `heavy` und
 * `pruefung` in intermediateLanes.ts.
 *
 * Der Schlüssel trägt den LANE-Namen, nicht den Verarbeitungsort: seit dem
 * Umzug auf Cortecs am 21.08.2026 lautet er `cortecs/…`. Ein hier stehen
 * gebliebener `scaleway/…`-Schlüssel würde nie mehr getroffen — `pickHealthyTarget`
 * schlägt `${provider}/${model}` nach, und der Provider heisst jetzt anders.
 */
const MODEL_SIBLINGS: Readonly<Record<string, ModelTarget>> = {
  // Das dichte 31B auf seinen beiden Hosts — dieselben GEWICHTE, nicht nur
  // dieselbe Familie. Gemessen 21.08.2026 am Prüf-Prompt: Inhaltstreue in 22
  // Läufen nicht unterscheidbar, Cortecs 210,7 gegen 81,3 tok/s bei 1122 gegen
  // 129 ms TTFT.
  'regolo/gemma4-31b': { provider: 'cortecs', model: 'gemma-4-31b-it' },
  'cortecs/gemma-4-31b-it': { provider: 'regolo', model: 'gemma4-31b' },
  // `cortecs/gemma-4-26b-a4b-it` stand hier bis zum 21.08.2026 und ist WEG,
  // nicht vergessen: die Modell-ID ist über Cortecs unbedienbar geworden (der
  // einzige brauchbare Unterauftragnehmer verschwand aus dem Katalog, der
  // zweite ist quantisiert). Ein Geschwister, das auf ein totes Ziel zeigt, ist
  // schlimmer als keins — `pickHealthyTarget` weicht dann von einem trägen
  // Primär auf einen 404 aus.
};

/** Dieselbe Reihenfolge wie `tryFallbackProviders` in providerFallback.ts. */
const FALLBACK_CHAIN: readonly ProviderName[] = ['litellm', 'regolo', 'mistral'];

function usable(target: ModelTarget): boolean {
  return isProviderConfigured(target.provider) && !isModelSlow(target.provider, target.model);
}

/**
 * Ein brauchbares Ausweichziel — oder `null`, wenn keins übrig ist. Der
 * Aufrufer bleibt dann beim Primär: langsam ist besser als gar nicht.
 */
export function resolveAlternative(
  provider: string,
  model: string,
  isAcceptable: (target: ModelTarget) => boolean = () => true
): ModelTarget | null {
  const sibling = MODEL_SIBLINGS[`${provider}/${model}`];
  if (sibling && usable(sibling) && isAcceptable(sibling)) return sibling;

  for (const candidate of FALLBACK_CHAIN) {
    if (candidate === provider) continue;
    const target = { provider: candidate, model: getDefaultModel(candidate) };
    if (usable(target) && isAcceptable(target)) return target;
  }
  return null;
}

/**
 * Das Paar, an das die Anfrage tatsächlich gehen soll.
 *
 * Der eine Konsultationspunkt: beide `getModel`-Implementierungen rufen das im
 * Kopf, damit ein vermerktes Modell gar nicht erst abgewartet wird. Ohne
 * Vermerk ändert sich nichts.
 */
export function pickHealthyTarget(
  provider: string,
  model: string,
  isAcceptable?: (target: ModelTarget) => boolean
): ModelTarget | null {
  if (!isModelSlow(provider, model)) return null;

  const alternative = resolveAlternative(provider, model, isAcceptable);
  if (!alternative) return null;

  log.info(
    `${provider}/${model} gilt als zäh — diese Anfrage geht an ${alternative.provider}/${alternative.model}`
  );
  return alternative;
}
