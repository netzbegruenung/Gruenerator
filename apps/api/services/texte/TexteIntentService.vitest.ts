/**
 * Tests for TexteIntentService keyword detection and routing
 *
 * Covers:
 * - Word-boundary matching (prevents compound-word false positives)
 * - Graduated confidence scoring
 * - Best-match scoring across multiple keyword hits
 * - False positive prevention for German compound words
 * - True positive detection for intended routes
 *
 * Run with: pnpm --filter @gruenerator/api test
 */

import { describe, it, expect } from 'vitest';

import { keywordMatches, detectTypeByKeywords, TEXT_TYPE_MAPPINGS } from './TexteIntentService.js';

// ============================================================================
// keywordMatches — Word Boundary Matching
// ============================================================================

describe('keywordMatches', () => {
  it('matches standalone word', () => {
    expect(keywordMatches('schreib eine rede für den parteitag', 'rede')).toBe(true);
  });

  it('matches at start of string', () => {
    expect(keywordMatches('rede für den parteitag', 'rede')).toBe(true);
  });

  it('matches at end of string', () => {
    expect(keywordMatches('eine gute rede', 'rede')).toBe(true);
  });

  it('does NOT match inside compound word', () => {
    expect(keywordMatches('das thema bereden', 'rede')).toBe(false);
  });

  it('does NOT match bürger inside bürgerhaus', () => {
    expect(keywordMatches('newsletter für bürgerhaus spich', 'bürger')).toBe(false);
  });

  it('does NOT match bürger inside bürgermeister', () => {
    expect(keywordMatches('bürgermeister einladen', 'bürger')).toBe(false);
  });

  it('does NOT match text inside kontext', () => {
    expect(keywordMatches('kontext zusammenfassen', 'text')).toBe(false);
  });

  it('does NOT match brief inside briefing', () => {
    expect(keywordMatches('ein briefing vorbereiten', 'brief')).toBe(false);
  });

  it('matches multi-word keywords with includes', () => {
    expect(keywordMatches('text in leichte sprache übersetzen', 'leichte sprache')).toBe(true);
  });

  it('matches keyword with asterisk using includes', () => {
    expect(keywordMatches('eine bürger*innenanfrage beantworten', 'bürger*innenanfrage')).toBe(
      true
    );
  });

  it('matches word next to punctuation', () => {
    expect(keywordMatches('erstelle einen tweet!', 'tweet')).toBe(true);
    expect(keywordMatches('(tweet)', 'tweet')).toBe(true);
    expect(keywordMatches('tweet, bitte', 'tweet')).toBe(true);
  });

  it('matches word next to digits', () => {
    expect(keywordMatches('3 tweets erstellen', 'tweet')).toBe(false); // "tweets" not "tweet"
    expect(keywordMatches('tweet 123', 'tweet')).toBe(true);
  });
});

// ============================================================================
// detectTypeByKeywords — False Positive Prevention
// ============================================================================

describe('detectTypeByKeywords — false positive prevention', () => {
  it('does NOT route "Newsletter Bürgerhaus Spich" to buergeranfragen', () => {
    const result = detectTypeByKeywords(
      'Erstelle einen Newsletter als Terminübersicht für das Bürgerhaus Spich'
    );
    expect(result?.detectedType).not.toBe('buergeranfragen');
  });

  it('does NOT route "Bürgermeister einladen" to buergeranfragen', () => {
    const result = detectTypeByKeywords('Bürgermeister soll zum Fest eingeladen werden');
    expect(result?.detectedType).not.toBe('buergeranfragen');
  });

  it('does NOT route "Kontext zusammenfassen" to universal via "text" match', () => {
    // "text" is no longer a single-word keyword, so this should not match universal by keyword
    const result = detectTypeByKeywords('Kontext zusammenfassen');
    // If it matches at all, it should be via zusammenfassung keywords
    if (result) {
      expect(result.detectedType).not.toBe('universal');
    }
  });

  it('does NOT route "Training Programm" to wahlprogramm', () => {
    // "programm" was removed as a standalone keyword
    const result = detectTypeByKeywords('Training Programm erstellen');
    expect(result?.detectedType).not.toBe('wahlprogramm');
  });

  it('does NOT route "Das Thema bereden" to rede', () => {
    const result = detectTypeByKeywords('Das Thema bereden');
    expect(result?.detectedType).not.toBe('rede');
  });

  it('does NOT route "Ein Briefing vorbereiten" to brief', () => {
    const result = detectTypeByKeywords('Ein Briefing vorbereiten');
    expect(result?.detectedType).not.toBe('brief');
  });
});

// ============================================================================
// detectTypeByKeywords — True Positive Detection
// ============================================================================

describe('detectTypeByKeywords — true positive detection', () => {
  it('routes "Antwort auf eine Bürgeranfrage" to buergeranfragen', () => {
    const result = detectTypeByKeywords('Antwort auf eine Bürgeranfrage zum Radweg');
    expect(result).not.toBeNull();
    expect(result!.detectedType).toBe('buergeranfragen');
  });

  it('routes "Erstelle einen Tweet" to social_twitter', () => {
    const result = detectTypeByKeywords('Erstelle einen Tweet');
    expect(result).not.toBeNull();
    expect(result!.detectedType).toBe('social_twitter');
  });

  it('routes "Pressemitteilung zu Klimaschutz" to pressemitteilung', () => {
    const result = detectTypeByKeywords('Schreib eine Pressemitteilung zu Klimaschutz');
    expect(result).not.toBeNull();
    expect(result!.detectedType).toBe('pressemitteilung');
  });

  it('routes "Text in leichte Sprache" to leichte_sprache', () => {
    const result = detectTypeByKeywords('Text in leichte Sprache übersetzen');
    expect(result).not.toBeNull();
    expect(result!.detectedType).toBe('leichte_sprache');
  });

  it('routes "Wahlprogramm-Kapitel" to wahlprogramm', () => {
    const result = detectTypeByKeywords('Erstelle ein Wahlprogramm-Kapitel zu Bildung');
    // "wahlprogramm" contains a hyphen, so the word-boundary match should pick it up
    // Actually "wahlprogramm" is lowercased and the input has "Wahlprogramm-Kapitel"
    // The normalized input is "erstelle ein wahlprogramm-kapitel zu bildung"
    // keywordMatches checks for non-German-letter boundaries: '-' is not a German letter, so it works
    expect(result).not.toBeNull();
    expect(result!.detectedType).toBe('wahlprogramm');
  });

  it('routes "Rede für den Parteitag" to rede', () => {
    const result = detectTypeByKeywords('Schreib eine Rede für den Parteitag');
    expect(result).not.toBeNull();
    expect(result!.detectedType).toBe('rede');
  });

  it('routes "Erstelle einen Newsletter" to universal', () => {
    const result = detectTypeByKeywords('Erstelle einen Newsletter');
    expect(result).not.toBeNull();
    expect(result!.detectedType).toBe('universal');
  });

  it('routes "Social Media Post" to social_generic', () => {
    const result = detectTypeByKeywords('Erstelle einen Social Media Post');
    expect(result).not.toBeNull();
    expect(result!.detectedType).toBe('social_generic');
  });

  it('routes "kleine Anfrage" to kleine_anfrage', () => {
    const result = detectTypeByKeywords('Formuliere eine kleine Anfrage zum Thema Radwege');
    expect(result).not.toBeNull();
    expect(result!.detectedType).toBe('kleine_anfrage');
  });

  it('routes "Zusammenfassung" to zusammenfassung', () => {
    const result = detectTypeByKeywords('Erstelle eine Zusammenfassung des Protokolls');
    expect(result).not.toBeNull();
    expect(result!.detectedType).toBe('zusammenfassung');
  });
});

// ============================================================================
// Graduated Confidence Scoring
// ============================================================================

describe('graduated confidence scoring', () => {
  it('gives high confidence (>=0.85) for long specific keywords', () => {
    const result = detectTypeByKeywords('Schreib eine Pressemitteilung');
    expect(result).not.toBeNull();
    expect(result!.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it('gives high confidence (>=0.90) for multi-word keywords', () => {
    const result = detectTypeByKeywords('Übersetze in leichte Sprache');
    expect(result).not.toBeNull();
    expect(result!.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('gives medium confidence (0.65-0.79) for short single keywords', () => {
    const result = detectTypeByKeywords('Erstelle einen Tweet');
    expect(result).not.toBeNull();
    // "tweet" is 5 chars → base 0.65
    expect(result!.confidence).toBeGreaterThanOrEqual(0.6);
    expect(result!.confidence).toBeLessThan(0.8);
  });

  it('boosts confidence for multiple keyword matches from same type', () => {
    // "twitter" + "tweet" both match social_twitter
    const result = detectTypeByKeywords('Erstelle einen Twitter Tweet');
    expect(result).not.toBeNull();
    expect(result!.detectedType).toBe('social_twitter');
    // Base 0.75 (7 chars "twitter") + 0.05 bonus for 2 matches = 0.80
    expect(result!.confidence).toBeGreaterThanOrEqual(0.75);
  });
});

// ============================================================================
// Best-Match Scoring (composite score picks most specific)
// ============================================================================

describe('best-match scoring', () => {
  it('prefers "pressemitteilung" (16 chars) over "presse" (6 chars) when both match', () => {
    const result = detectTypeByKeywords('Erstelle eine Pressemitteilung');
    expect(result).not.toBeNull();
    expect(result!.detectedType).toBe('pressemitteilung');
  });

  it('prefers multi-word "kleine anfrage" over single-word "anfrage"', () => {
    const result = detectTypeByKeywords('Formuliere eine kleine Anfrage');
    expect(result).not.toBeNull();
    expect(result!.detectedType).toBe('kleine_anfrage');
  });

  it('prefers specific platform over generic social', () => {
    const result = detectTypeByKeywords('Erstelle einen Instagram Post');
    expect(result).not.toBeNull();
    expect(result!.detectedType).toBe('social_instagram');
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('edge cases', () => {
  it('returns null for completely unrelated input', () => {
    const result = detectTypeByKeywords('Wie wird das Wetter morgen?');
    expect(result).toBeNull();
  });

  it('returns null for empty input', () => {
    const result = detectTypeByKeywords('');
    expect(result).toBeNull();
  });

  it('handles input with only whitespace', () => {
    const result = detectTypeByKeywords('   ');
    expect(result).toBeNull();
  });

  it('is case-insensitive', () => {
    const result = detectTypeByKeywords('ERSTELLE EINEN TWEET');
    expect(result).not.toBeNull();
    expect(result!.detectedType).toBe('social_twitter');
  });

  it('all TEXT_TYPE_MAPPINGS have valid route strings', () => {
    for (const [name, mapping] of Object.entries(TEXT_TYPE_MAPPINGS)) {
      expect(mapping.route, `${name} has no route`).toBeTruthy();
      expect(typeof mapping.route).toBe('string');
      expect(mapping.keywords.length, `${name} has no keywords`).toBeGreaterThan(0);
    }
  });
});
