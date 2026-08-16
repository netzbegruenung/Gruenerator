/**
 * Nennt eine Prompt-Config ein `model`, muss die Fassade dorthin routen, wohin
 * der Selektor geroutet hat — sonst ist die Migration eine Umroutung.
 *
 * Die Regel ist unsymmetrisch, und genau das ist die Falle: `options.model`
 * gewinnt über den Tabellenwert (`model = options.model || <Tabelle>`),
 * `options.provider` gewinnt NUR, wenn der Typ keinen eigenen Zweig hat — bei
 * einem gerouteten Typ überschreibt der Zweig ihn wortlos. `antrag_simple.json`
 * nennt beides (litellm / gpt-oss:120b) und läuft deshalb heute auf REGOLO mit
 * `gpt-oss:120b`, nicht auf litellm.
 *
 * `PromptProcessor` bildet das nach: Provider aus der Tabelle, Modell aus der
 * Config. Diese Prüfung hält die beiden Rechnungen aneinander.
 *
 * Der Zustand selbst ist ein Befund, kein Ziel: `AI_LANES.antrag_simple` sagt
 * Gemma 4 auf Regolo, und `gpt-oss:120b` ist nicht einmal Regolos Schreibweise
 * (dort heißt es `gpt-oss-120b`). Die Migration ändert das nicht.
 */

import { describe, expect, it } from 'vitest';

import { laneTarget, resolveLane } from '../../services/ai/lanes.js';
import { selectProviderAndModel } from '../../services/providers/providerSelector.js';

import { loadPromptConfig } from './PromptProcessor.js';

/** Was `PromptProcessor` aus `aiOptions.model` baut. */
function pinFor(routeType: string, model: string) {
  return { provider: laneTarget(resolveLane(routeType), {}, {}).provider, model };
}

const CONFIGS_WITH_MODEL = ['antrag_simple'] as const;

describe('eine Prompt-Config, die ein Modell nennt', () => {
  it.each(CONFIGS_WITH_MODEL)('%s: der Pin trifft, was der Selektor wählte', (routeType) => {
    const options = (loadPromptConfig(routeType) as { options?: { model?: string } }).options ?? {};
    expect(options.model, `${routeType}.json nennt kein model mehr`).toBeTruthy();

    const chain = selectProviderAndModel({ type: routeType, options, env: {} });

    expect(pinFor(routeType, options.model!)).toEqual({
      provider: chain.provider,
      model: chain.model,
    });
  });

  it('ohne Config-Modell bleibt es bei der Tabelle', () => {
    const chain = selectProviderAndModel({ type: 'rede', env: {} });
    const registry = laneTarget(resolveLane('rede'), {}, {});

    expect(registry).toEqual({ provider: chain.provider, model: chain.model });
  });
});
