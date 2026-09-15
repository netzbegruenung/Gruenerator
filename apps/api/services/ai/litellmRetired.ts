/**
 * LiteLLM/Verdigado ist als Modellziel stillgelegt. Wer noch dorthin zeigt,
 * landet bei Cortecs.
 *
 * ── Warum ──
 *
 * Der Proxy führte für uns genau zwei Aliasse, und BEIDE denken:
 *
 *   verdigado-pro    = gpt-oss:120b-ctx128k   (am Proxy gemessen 19.08.2026)
 *   verdigado-think  = gemma4:31b-ctx128k     (denkt vor jeder Antwort; weder
 *                                              `think:false` noch
 *                                              `enable_thinking:false` noch
 *                                              `reasoning_effort:'none'` wird
 *                                              dort beachtet — je einzeln
 *                                              probiert, siehe CTX_VERDIGADO in
 *                                              routes/chat/agents/providers.ts)
 *
 * Denk-Tokens zählen gegen `max_tokens`. Auf einer Lane mit kleinem Budget
 * heisst das: das Budget ist weg, bevor die Antwort anfängt. Issue #3064 ist
 * genau dieser Fall — der Thread-Titel bat um 64 Tokens, bekam 64 Text-Tokens
 * mit `reasoningTokens: 0` und einen 23-Zeichen-Titel darin; gpt-oss schreibt
 * sein Denken über diesen Adapter als TEXT, wird also nicht einmal als
 * Reasoning abgerechnet. Dieselbe Falle steht dreimal im Repo:
 * `intermediateLanes.ts` (0 von 90 Läufen brauchbar bei `max_tokens: 16`),
 * dem inzwischen entfernten `services/mem0/config.ts` und CLAUDE.md zum Scaleway-Reasoning.
 *
 * Die Lane bat nie um gpt-oss. Sie war auf `trivial` gepinnt (regolo bzw. seit
 * #3061 greenpt) und fiel durch die Kette; ein Ausweichglied antwortet immer
 * auf dem EIGENEN Default des Anbieters (`generate.ts`), und der von litellm
 * war `verdigado-pro`. Ein Denkmodell als stiller Auffangort einer
 * Kurzantwort-Lane ist kein Netz, sondern ein zweiter Weg zu scheitern.
 *
 * ── Warum Cortecs und nicht einfach weg ──
 *
 * Für `verdigado-think` ist der Wechsel ein reiner HOSTWECHSEL: Cortecs'
 * `gemma-4-31b-it` ist dasselbe dichte Gemma 4 31B, nur schneller (210,7 tok/s
 * gegen 23–34 tok/s, TTFT 1122 ms gegen 20 s — Messreihen in `gemmaHosts.ts`
 * und `intermediateLanes.ts`) und ohne den erzwungenen Denkblock.
 *
 * Für `verdigado-pro` ist es ein MODELLWECHSEL, und zwar der, den #3064
 * verlangt: auf das kleine Modell der Zwischenstufen. Cortecs' Kopie von
 * `mistral-small-3.2-24b-instruct-2506` ist am 29.08.2026 für #3061 am
 * Endpunkt geprüft worden (3 Läufe, `max_tokens: 16`, HTTP 200,
 * `finish_reason: stop`, 2 Ausgabe-Tokens, 338/404/463 ms) — also genau das,
 * was gpt-oss dort nicht konnte.
 *
 * ── Was hier NICHT passiert ──
 *
 * `litellm` bleibt ein `ProviderName` und bleibt im `provider`-Enum der
 * Contracts. Das ist F0 (CLAUDE.md): der Name steht in gespeicherten
 * Agenten-Konfigurationen, in `profiles.user_defaults.models` und in bereits
 * ausgelieferten Mobile-Bundles. Er wird deshalb weiter TOLERANT GELESEN und
 * hier umgebogen — nicht abgelehnt. Neue Ziele schreibt niemand mehr dorthin:
 * der Name steht in keiner Kette, keinem Katalog und keiner Lane mehr.
 *
 * Nicht betroffen ist die Nutzungsabrechnung: `services/usage/energyFootprint.ts`
 * behält seine litellm-Koeffizienten, weil sie bereits gespeicherte Zeilen
 * erklären.
 */

import { GEMMA_31B_ON_CORTECS } from './gemmaHosts.js';
import { CORTECS_SMALL_32 } from './intermediateLanes.js';

import type { ProviderName } from './providers.js';

export interface RetiredTarget {
  readonly provider: ProviderName;
  readonly model: string;
}

/**
 * Wohin die einzelnen Verdigado-Aliasse gehen.
 *
 * `gemma` war der Alias des Proxys auf `gemma4:26b-ctx16k` — ein Achtel
 * Kontext, kleineres Modell, aus der Auswahl schon vorher ausgeschlossen
 * (`EXCLUDE_IDS` in modelDiscovery.ts). Er landet auf demselben Ziel wie
 * `verdigado-think`, weil eine gespeicherte Wahl sonst ins Leere zeigt.
 */
const RETIRED_MODELS: Readonly<Record<string, RetiredTarget>> = {
  'verdigado-pro': { provider: 'cortecs', model: CORTECS_SMALL_32.model },
  'verdigado-think': { provider: 'cortecs', model: GEMMA_31B_ON_CORTECS.model },
  gemma: { provider: 'cortecs', model: GEMMA_31B_ON_CORTECS.model },
};

/**
 * Der Standard für alles, was `litellm` OHNE Modellnamen anfragt.
 *
 * Das kleine Modell, nicht Gemma: ein Aufrufer ohne Modellwunsch ist fast immer
 * eine Zwischenstufe, und genau die zerbrach an einem Denkmodell.
 */
export const RETIRED_LITELLM_DEFAULT: RetiredTarget = {
  provider: 'cortecs',
  model: CORTECS_SMALL_32.model,
};

/**
 * Biegt ein Ziel um, das noch auf LiteLLM zeigt. Alles andere kommt unverändert
 * zurück, damit die Funktion an beiden `getModel`-Türen bedenkenlos davorsteht.
 *
 * Ein UNBEKANNTER Modellname unter `litellm` geht ebenfalls auf den Standard
 * oben und nicht etwa mit seinem Namen zu Cortecs weiter: die beiden Kataloge
 * teilen keine einzige Kennung, ein durchgereichter Verdigado-Name wäre dort
 * ein 404.
 */
export function retireLiteLLM(
  provider: ProviderName | string,
  model?: string | null
): { provider: ProviderName | string; model: string | null } {
  if (provider !== 'litellm') return { provider, model: model ?? null };
  const mapped = (model && RETIRED_MODELS[model]) || RETIRED_LITELLM_DEFAULT;
  return { provider: mapped.provider, model: mapped.model };
}
