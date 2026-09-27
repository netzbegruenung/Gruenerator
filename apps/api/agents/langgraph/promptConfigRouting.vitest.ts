/**
 * Eine Prompt-Config beschreibt, WAS das Modell schreiben soll — nicht WELCHES
 * Modell antwortet. Das steht in `AI_LANES`.
 *
 * Die Paritätsprüfung in `lanes.vitest.ts` deckt das nicht ab: sie fährt beide
 * Tabellen mit LEEREN Options und sieht eine Übersteuerung deshalb nie. Diese
 * Prüfung deckt genau die Lücke.
 *
 * Warum sie ALLE Configs liest und nicht nur eine Familie: die zwei Abweichungen,
 * die es gab, sassen in verschiedenen Verzeichnissen. `sharepic/simple.json`
 * schickte `mistral-large-2512` an eine Lane, die Medium sagt; `antrag_simple`
 * schickte den LiteLLM-Alias `gpt-oss:120b` an Regolo, wo dasselbe Modell
 * `gpt-oss-120b` heisst — der `provider` der Config verpuffte dabei wortlos,
 * weil der geroutete Typ ihn überschreibt. Ein Wächter über einem Verzeichnis
 * hätte je nur eine der beiden gefunden.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const PROMPTS_DIR = join(import.meta.dirname, '../../prompts');

/** Jede Config im Baum, flach und in Unterverzeichnissen. */
function collectConfigs(dir: string, prefix = ''): Array<[string, Record<string, unknown>]> {
  const out: Array<[string, Record<string, unknown>]> = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      out.push(...collectConfigs(join(dir, entry.name), `${prefix}${entry.name}/`));
      continue;
    }
    if (!entry.name.endsWith('.json')) continue;
    out.push([
      `${prefix}${entry.name}`,
      JSON.parse(readFileSync(join(dir, entry.name), 'utf8')) as Record<string, unknown>,
    ]);
  }
  return out;
}

/**
 * Jede Stelle, an der eine Config Optionen ablegen kann. `types` ist die
 * Sharepic-Bauform (`config.types[<typ>].options`), die `getAIOptions` bevorzugt
 * — eine Prüfung, die nur `config.options` läse, würde sie übersehen.
 */
function optionBags(config: Record<string, unknown>): Array<Record<string, unknown>> {
  const bags: Array<Record<string, unknown>> = [];
  const push = (v: unknown) => {
    if (v != null && typeof v === 'object') bags.push(v as Record<string, unknown>);
  };
  push(config.options);
  push(config.alternativesOptions);
  const types = config.types;
  if (types != null && typeof types === 'object') {
    for (const t of Object.values(types as Record<string, unknown>)) {
      if (t != null && typeof t === 'object') {
        push((t as Record<string, unknown>).options);
        push((t as Record<string, unknown>).alternativesOptions);
      }
    }
  }
  return bags;
}

const entries = collectConfigs(PROMPTS_DIR);

describe('prompt-configs entscheiden nicht über das Routing', () => {
  it('kennt überhaupt Configs (sonst prüft die Schleife unten nichts)', () => {
    expect(entries.length).toBeGreaterThan(25);
    // Und sie steigt in Unterverzeichnisse — sonst fiele die Sharepic-Familie
    // heraus, also genau die, für die diese Prüfung erfunden wurde.
    expect(entries.some(([name]) => name.startsWith('sharepic/'))).toBe(true);
  });

  it.each(entries)('%s nennt weder model noch provider', (_name, config) => {
    for (const bag of optionBags(config)) {
      expect(Object.keys(bag)).not.toContain('model');
      expect(Object.keys(bag)).not.toContain('provider');
    }
  });
});
