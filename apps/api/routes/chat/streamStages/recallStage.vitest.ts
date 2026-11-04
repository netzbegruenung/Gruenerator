import { describe, expect, it } from 'vitest';

import { wantsProactiveRecall } from './recallStage.js';

describe('wantsProactiveRecall', () => {
  // #5138: each of these was answered from a recalled chat, without a tool call.
  it.each([
    'Was steht in der Bundestagsdrucksache 21/99999?',
    'Was hat der Berliner Senat zur Sanierung der Elsenbrücke geantwortet?',
    'Was sagen die Grünen zur Marskolonie-Steuer?',
    'Was steht in meinem Notebook „Marskolonie 2099“?',
    'Gibt es schon eine Drucksache zum Radverkehr',
  ])('skips a lookup question: %s', (text) => {
    expect(wantsProactiveRecall('agentic', text)).toBe(false);
  });

  it.each([
    'Schreib mir einen Instagram-Post zum Klimageld',
    'Mach weiter mit dem Antrag zur Radverkehrsstrategie',
    'Erstelle eine Pressemitteilung zur Elsenbrücke',
  ])('keeps recall for a writing order: %s', (text) => {
    expect(wantsProactiveRecall('agentic', text)).toBe(true);
    expect(wantsProactiveRecall('produktion', text)).toBe(true);
  });

  it('skips product questions and chat_history turns regardless of wording', () => {
    expect(wantsProactiveRecall('hilfe', 'Konto löschen')).toBe(false);
    expect(wantsProactiveRecall('chat_history', 'Mach weiter mit dem Antrag')).toBe(false);
  });
});
