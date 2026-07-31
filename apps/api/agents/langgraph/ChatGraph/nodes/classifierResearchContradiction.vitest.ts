import { describe, it, expect } from 'vitest';

import { parseClassifierResponse } from './classifierParsing.js';

/**
 * B7: the classifier answered "this needs research" and picked the one intent
 * under which nothing is ever looked up. Its own reasoning named the search it
 * then never ran — „ist eine Web-Recherche (web) notwendig, um die aktuellen
 * Vorwürfe zu identifizieren" — and the answer was invented whole (it presented
 * the Greens as a governing party).
 *
 * `needsResearch` had been requested from the model, logged once and dropped
 * for the field's entire lifetime. These tests pin that it reaches the caller,
 * because everything downstream (loop entry, forced tool call) keys on it.
 */
describe('parseClassifierResponse — needsResearch', () => {
  const json = (o: Record<string, unknown>): string => JSON.stringify(o);

  it('carries the self-contradiction (needsResearch=true, intent=produktion)', () => {
    const result = parseClassifierResponse(
      json({
        intent: 'produktion',
        needsResearch: true,
        searchQuery: null,
        reasoning: 'Um die aktuellen Vorwürfe zu identifizieren, ist eine Web-Recherche notwendig.',
      }),
      'Erklär mir die aktuellen Vorwürfe gegen die Partei'
    );

    expect(result.intent).toBe('produktion');
    expect(result.needsResearch).toBe(true);
  });

  it('reports false when the model says no research is needed', () => {
    const result = parseClassifierResponse(
      json({
        intent: 'produktion',
        needsResearch: false,
        searchQuery: null,
        reasoning: 'Reine Umformulierung, alles liegt vor.',
      }),
      'Formulier diesen Absatz freundlicher'
    );

    expect(result.needsResearch).toBe(false);
  });

  it('treats a missing field as "no research needed", never undefined', () => {
    // Older/leaner model outputs omit it entirely. Downstream reads this as a
    // boolean and forces a tool call on true — `undefined` must not leak in.
    const result = parseClassifierResponse(
      json({ intent: 'produktion', searchQuery: null, reasoning: 'kreativ' }),
      'Schreib ein Gedicht über den Frühling'
    );

    expect(result.needsResearch).toBe(false);
  });

  it('keeps carrying the flag on a retrieval intent (no contradiction there)', () => {
    const result = parseClassifierResponse(
      json({
        intent: 'web',
        needsResearch: true,
        searchQuery: 'Koalitionsverhandlungen Stand',
        reasoning: 'Aktuelle Lage, Websuche nötig.',
      }),
      'Wie ist der Stand der Koalitionsverhandlungen?'
    );

    expect(result.intent).toBe('web');
    expect(result.needsResearch).toBe(true);
  });
});
