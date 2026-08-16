/**
 * Eine Prompt-Config beschreibt, WAS das Modell schreiben soll — nicht WELCHES
 * Modell antwortet. Das steht in `AI_LANES`.
 *
 * Bis zum 16.08.2026 stimmte das nicht: `simple.json` trug
 * `options.model: 'mistral-large-2512'`, und der alte Weg über
 * `providerSelector` las in jedem Zweig `options.model || <Tabellenwert>` — die
 * Config gewann. `sharepic_simple` lief also auf Mistral Large, während die
 * Tabelle Medium sagte, und die Paritätsprüfung in `lanes.vitest.ts` konnte das
 * nicht sehen: sie fährt beide Tabellen mit LEEREN Options.
 *
 * Diese Prüfung deckt genau die Lücke, die dort offen bleibt.
 */

import { describe, expect, it } from 'vitest';

import prompts from '../../../prompts/sharepic/index.js';

type Options = Record<string, unknown> | undefined;

interface SharepicPromptConfig {
  options?: Options;
  alternativesOptions?: Options;
}

const entries = Object.entries(prompts as Record<string, SharepicPromptConfig>);

describe('sharepic-prompt-configs entscheiden nicht über das Routing', () => {
  it('kennt überhaupt Configs (sonst prüft die Schleife unten nichts)', () => {
    expect(entries.length).toBeGreaterThan(5);
  });

  it.each(entries)('%s nennt weder model noch provider', (_name, config) => {
    for (const bag of [config.options, config.alternativesOptions]) {
      if (!bag) continue;
      expect(Object.keys(bag)).not.toContain('model');
      expect(Object.keys(bag)).not.toContain('provider');
    }
  });
});
