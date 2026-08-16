/**
 * Die Rückfragen-Configs müssen zu dem Pfad passen, den
 * `generateClarifyingQuestions` tatsächlich geht — einem ERZWUNGENEN
 * Werkzeug-Aufruf, dessen Ergebnis über `result.tool_calls` gelesen wird.
 *
 * `interactive_questions_antrag.json` passte bis zum 16.08.2026 nicht, und zwar
 * gleich dreifach: kein `toolSchema` (der Aufrufer baute `tools: [undefined]`,
 * woran der Adapter mit einem TypeError abbrach), kein `tool_choice` (und
 * `resolveToolChoice(undefined)` ist `'none'`, also „Werkzeug angeboten, darf
 * nicht gerufen werden"), und eine `generationPrompt`, die freies JSON mit
 * Feldnamen verlangte, die der Code nie liest (`questionText`, `why`). Die
 * Antrags-Rückfragen konnten deshalb nie erscheinen.
 *
 * Der Fehler war nur deshalb so langlebig, weil nichts ihn benennt: die Route
 * antwortete mit 500, und die Schwester-Config `_pr` funktionierte.
 */

import { describe, expect, it } from 'vitest';

import { LOCALE_MAPPINGS } from '../../services/localization/LocalizationService.js';

import { loadPromptConfig } from './PromptProcessor.js';

/** Was `generateClarifyingQuestions` an Konfiguration überhaupt anfasst. */
interface QuestionsConfig {
  systemPrompt?: string;
  generationPrompt?: string;
  toolSchema?: { function?: { name?: string; parameters?: unknown } };
  options?: { tool_choice?: unknown };
}

const GENERATOR_TYPES = ['antrag', 'pr'] as const;

describe.each(GENERATOR_TYPES)('interactive_questions_%s', (type) => {
  const config = loadPromptConfig(`interactive_questions_${type}`) as unknown as QuestionsConfig;

  it('bringt ein benanntes toolSchema mit', () => {
    // `tools = [config.toolSchema]` — ohne Schema steht dort `[undefined]`.
    expect(config.toolSchema).toBeDefined();
    expect(config.toolSchema?.function?.name).toBeTruthy();
    expect(config.toolSchema?.function?.parameters).toBeDefined();
  });

  it('erlaubt den Werkzeug-Aufruf, den der Code auswertet', () => {
    // Fehlt der Wert, liest `resolveToolChoice` ihn als `'none'` — das Werkzeug
    // wird angeboten und darf nicht gerufen werden.
    expect(config.options?.tool_choice).toBeDefined();
    expect(config.options?.tool_choice).not.toBe('none');
  });

  it('verlangt kein freies JSON neben dem Werkzeug', () => {
    // Zwei Ausgabewege in einem Prompt sind der Weg zurück in den alten Fehler:
    // das Modell schreibt Prosa-JSON, der Code liest nur `tool_calls`.
    const prompts = `${config.systemPrompt ?? ''}\n${config.generationPrompt ?? ''}`;
    expect(prompts).not.toMatch(/ANTWORTE NUR MIT DIESEM JSON/i);
    expect(prompts).not.toMatch(/IMMER JSON ausgeben/i);
  });

  /**
   * BEIDE Prompts, nicht nur der gerenderte.
   *
   * Die erste Fassung dieser Prüfung sah nur `generationPrompt` — und übersah
   * damit prompt ein neu eingeführtes `{{partyName}}` im `systemPrompt`, den
   * `SimpleTemplateEngine` gar nicht anfasst. Ein Wächter, der nur den halben
   * Prompt liest, deckt die Hälfte der Fehler zu.
   */
  it.each([
    ['systemPrompt', () => config.systemPrompt],
    ['generationPrompt', () => config.generationPrompt],
  ])('%s nennt nur Platzhalter, die jemand auflöst', (_field, read) => {
    // `localizePlaceholders` (Locale-Werte) läuft über beide, danach rendert
    // `SimpleTemplateEngine` den generationPrompt mit den Werten des Aufrufers.
    // Alles andere bliebe wörtlich stehen bzw. würde zu '' geleert.
    const supplied = new Set([
      ...Object.keys(LOCALE_MAPPINGS['de-DE']),
      'inhalt',
      'requestType',
      'searchSummary',
    ]);
    const used = [...(read() ?? '').matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
    expect(used.filter((v) => !supplied.has(v))).toEqual([]);
  });
});
