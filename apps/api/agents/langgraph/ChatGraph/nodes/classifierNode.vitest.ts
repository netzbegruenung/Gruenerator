import { describe, it, expect } from 'vitest';

import {
  extractSearchTopic,
  parseClassifierResponse,
  detectSearchSources,
  detectComplexity,
  heuristicClassify,
  extractFilters,
  heuristicExtractFilters,
  looksMultiTopic,
} from './classifierNode.js';

// ─── extractSearchTopic ───────────────────────────────────────────────────

describe('extractSearchTopic', () => {
  it('strips task verbs and content type nouns', () => {
    expect(
      extractSearchTopic('Schreib eine Pressemitteilung über die Klimapolitik der Grünen')
    ).toBe('die Klimapolitik der Grünen');
  });

  it('strips "Erstelle Argumente zur Energiewende"', () => {
    expect(extractSearchTopic('Erstelle Argumente zur Energiewende')).toBe('Energiewende');
  });

  it('strips task verbs with "zum Thema" preposition', () => {
    expect(extractSearchTopic('Verfasse einen Artikel zum Thema erneuerbare Energien')).toBe(
      'erneuerbare Energien'
    );
  });

  it('preserves short queries unchanged', () => {
    expect(extractSearchTopic('Klimapolitik')).toBe('Klimapolitik');
  });

  it('preserves queries where strip removes < 10%', () => {
    const q = 'Die aktuelle Lage der Energiepolitik in Deutschland';
    expect(extractSearchTopic(q)).toBe(q);
  });

  it('handles "Formuliere eine Rede über Verkehrswende"', () => {
    expect(extractSearchTopic('Formuliere eine Rede über Verkehrswende')).toBe('Verkehrswende');
  });

  it('preserves plain topic queries without task verbs', () => {
    expect(extractSearchTopic('Grüne Position zum Kohleausstieg')).toBe(
      'Grüne Position zum Kohleausstieg'
    );
  });

  it('handles adjective modifiers like "kurze/ausführliche"', () => {
    expect(extractSearchTopic('Erstelle eine kurze Zusammenfassung über den Atomausstieg')).toBe(
      'den Atomausstieg'
    );
  });
});

// ─── parseClassifierResponse (typo correction guard) ──────────────────────

describe('parseClassifierResponse – typo correction guard', () => {
  it('falls back to original when LLM "corrects" proper nouns', () => {
    const llmResponse = JSON.stringify({
      intent: 'search',
      searchQuery: 'Grüne Partei Klimaschutz',
      optimizedSearchQuery: 'Grüne Partei Klimaschutz',
      typoAnalysis: { original: 'Grüne Partai Klimaschutz', corrected: 'Grüne Partei Klimaschutz' },
      reasoning: 'search',
    });
    const result = parseClassifierResponse(llmResponse, 'Grüne Partai Klimaschutz');
    // The word "Partai" should still be found or the guard should allow it since most words match
    expect(result.intent).toBe('search');
    expect(result.searchQuery).toBeTruthy();
  });

  it('triggers guard when >40% words lost', () => {
    const llmResponse = JSON.stringify({
      intent: 'search',
      searchQuery: 'Klimapolitik',
      optimizedSearchQuery: 'Klimapolitik',
      typoAnalysis: { original: 'Grüne Partei Situation Bonn', corrected: 'Klimapolitik' },
      reasoning: 'search',
    });
    // Original: "Was sagt Müller in Tübingen über Windkraft" — LLM replaces everything
    const result = parseClassifierResponse(
      llmResponse,
      'Was sagt Müller in Tübingen über Windkraft'
    );
    expect(result.intent).toBe('search');
    // Guard should have replaced with extractSearchTopic fallback
    expect(result.searchQuery).not.toBe('Klimapolitik');
  });

  it('does not trigger guard when all words preserved', () => {
    const llmResponse = JSON.stringify({
      intent: 'search',
      searchQuery: 'Klimapolitik der Grünen',
      optimizedSearchQuery: 'Klimapolitik Grüne',
      typoAnalysis: null,
      reasoning: 'search',
    });
    const result = parseClassifierResponse(llmResponse, 'Klimapolitik der Grünen');
    expect(result.searchQuery).toBe('Klimapolitik Grüne');
  });

  it('does not trigger guard on genuine optimization (removing task verbs)', () => {
    const llmResponse = JSON.stringify({
      intent: 'research',
      searchQuery: 'Schreib eine PM über Energiewende',
      optimizedSearchQuery: 'Energiewende',
      typoAnalysis: null,
      reasoning: 'research',
    });
    const result = parseClassifierResponse(llmResponse, 'Schreib eine PM über Energiewende');
    expect(result.searchQuery).toBe('Energiewende');
  });

  it('handles single-word query with empty typoAnalysis', () => {
    const llmResponse = JSON.stringify({
      intent: 'search',
      searchQuery: 'Klimaschutz',
      optimizedSearchQuery: 'Klimaschutz',
      typoAnalysis: null,
      reasoning: 'search',
    });
    const result = parseClassifierResponse(llmResponse, 'Klimaschutz');
    expect(result.searchQuery).toBe('Klimaschutz');
  });
});

// ─── detectSearchSources ─────────────────────────────────────────────────

describe('detectSearchSources', () => {
  it('returns both sources for party + temporal keywords', () => {
    expect(
      detectSearchSources('Grüne Position zum Klimaschutz und aktuelle Entwicklungen', 'search')
    ).toEqual(['documents', 'web']);
  });

  it('returns empty for party keywords only', () => {
    expect(detectSearchSources('Was sagen die Grünen zum Kohleausstieg?', 'search')).toEqual([]);
  });

  it('returns empty for temporal keywords only (no party)', () => {
    expect(detectSearchSources('Aktuelle Nachrichten über das Wetter', 'web')).toEqual([]);
  });

  it('returns empty for non-search intent', () => {
    expect(detectSearchSources('Erstelle ein Bild von einem Baum', 'image')).toEqual([]);
  });

  it('returns both for party + comparative pattern', () => {
    expect(
      detectSearchSources('Grüne Klimapolitik und was sind die aktuellen Trends', 'research')
    ).toEqual(['documents', 'web']);
  });

  it('returns empty for direct intent even with keywords', () => {
    expect(detectSearchSources('Hallo, wie geht es den Grünen aktuell?', 'direct')).toEqual([]);
  });
});

// ─── detectComplexity ────────────────────────────────────────────────────

describe('detectComplexity', () => {
  it('returns simple for short query', () => {
    expect(detectComplexity('Klimaschutz')).toBe('simple');
  });

  it('returns simple for greeting', () => {
    expect(detectComplexity('Hallo, wie geht es dir heute?')).toBe('simple');
  });

  it('returns simple for "Was ist X"', () => {
    expect(detectComplexity('Was ist Klimaschutz?')).toBe('simple');
  });

  it('returns complex for comparison keywords', () => {
    // Uses noun "Vergleich" (exact \b match), not verb "Vergleiche" (inflected)
    expect(
      detectComplexity('Ein Vergleich der Klimapolitik und der Verkehrspolitik der Grünen')
    ).toBe('complex');
  });

  it('returns complex for detail keywords', () => {
    // Uses adverb "ausführlich" (exact \b match), not adjective "ausführliche" (inflected)
    expect(
      detectComplexity('Erkläre ausführlich die Energiepolitik der Grünen in Deutschland')
    ).toBe('complex');
  });

  it('returns moderate for normal query', () => {
    expect(detectComplexity('Was sagen die Grünen zum Thema Kohleausstieg und Energiewende?')).toBe(
      'moderate'
    );
  });
});

// ─── heuristicClassify ──────────────────────────────────────────────────

describe('heuristicClassify', () => {
  it('detects greetings with high confidence', () => {
    const result = heuristicClassify('Hallo, wie geht es?');
    expect(result.intent).toBe('direct');
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('detects image generation with high confidence', () => {
    const result = heuristicClassify('Erstelle ein Bild von einem grünen Baum');
    expect(result.intent).toBe('image');
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('detects explicit web search', () => {
    const result = heuristicClassify('Suche im Internet nach aktuellen Klimadaten');
    expect(result.intent).toBe('web');
    expect(result.confidence).toBeGreaterThanOrEqual(0.88);
  });

  it('detects explicit research request', () => {
    const result = heuristicClassify('Recherchiere zum Thema Energiewende');
    expect(result.intent).toBe('research');
    expect(result.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it('detects party document queries', () => {
    const result = heuristicClassify('Was steht im Wahlprogramm der Grünen zum Klimaschutz?');
    expect(result.intent).toBe('search');
    expect(result.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it('detects current events queries', () => {
    // "aktuell" is the exact lemma form; "Aktuelle" would fuzzy-match at lower confidence
    const result = heuristicClassify('Was ist aktuell in der Energiepolitik?');
    expect(result.intent).toBe('web');
    expect(result.confidence).toBeGreaterThanOrEqual(0.75);
  });

  it('detects fact-based content with topic marker', () => {
    const result = heuristicClassify('Schreibe eine Pressemitteilung über den Kohleausstieg');
    expect(result.intent).toBe('research');
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it('detects creative tasks without research need', () => {
    const result = heuristicClassify('Schreibe mir einen lustigen Slogan');
    expect(result.intent).toBe('direct');
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it('returns low confidence for unclear queries', () => {
    const result = heuristicClassify('Erzähl mir was über das Wetter morgen in Bonn');
    expect(result.confidence).toBeLessThan(0.85);
  });

  it('detects "Wer ist" queries as web', () => {
    const result = heuristicClassify('Wer ist Robert Habeck?');
    expect(result.intent).toBe('web');
    expect(result.confidence).toBeGreaterThanOrEqual(0.75);
  });
});

// ─── extractFilters ─────────────────────────────────────────────────────

describe('extractFilters', () => {
  it('maps Hamburg landesverband alias', () => {
    const result = extractFilters({ landesverband: 'hamburg' });
    expect(result).toEqual({ region: 'HH' });
  });

  it('maps Thüringen to both TH and TH-F', () => {
    const result = extractFilters({ landesverband: 'thüringen' });
    expect(result).toEqual({ region: ['TH', 'TH-F'] });
  });

  it('passes through valid date_from/date_to', () => {
    const result = extractFilters({ date_from: '2024-01-01', date_to: '2024-12-31' });
    expect(result).toEqual({ date_from: '2024-01-01', date_to: '2024-12-31' });
  });

  it('rejects invalid date format', () => {
    const result = extractFilters({ date_from: 'January 2024' });
    expect(result).toBeNull();
  });

  it('extracts content_type', () => {
    const result = extractFilters({ content_type: 'presse' });
    expect(result).toEqual({ content_type: 'presse' });
  });

  it('returns null for empty/null filters', () => {
    expect(extractFilters(null)).toBeNull();
    expect(extractFilters({})).toBeNull();
  });
});

// ─── heuristicExtractFilters ────────────────────────────────────────────

describe('heuristicExtractFilters', () => {
  it('detects Pressemitteilung content type', () => {
    const result = heuristicExtractFilters('Pressemitteilungen zum Klimaschutz');
    expect(result?.content_type).toBe('presse');
  });

  it('detects Beschluss content type', () => {
    const result = heuristicExtractFilters('Beschlüsse der Grünen zur Energiewende');
    expect(result?.content_type).toBe('beschluss');
  });

  it('detects Hamburg landesverband from full name', () => {
    const result = heuristicExtractFilters('Grüne Hamburg Beschlüsse zur Verkehrswende');
    expect(result?.region).toBe('HH');
    expect(result?.content_type).toBe('beschluss');
  });

  it('does NOT match short abbreviations (prevents false positives)', () => {
    const result = heuristicExtractFilters('HH Position zum Klimaschutz');
    // Should not match 'hh' abbreviation — only full names
    expect(result?.region).toBeUndefined();
  });

  it('detects Wahlprogramm content type', () => {
    const result = heuristicExtractFilters('Was steht im Wahlprogramm?');
    expect(result?.content_type).toBe('wahlprogramm');
  });

  it('detects thüringen from full name', () => {
    const result = heuristicExtractFilters('Grüne in thüringen und ihre Position');
    expect(result?.region).toEqual(['TH', 'TH-F']);
  });

  it('detects Antrag content type', () => {
    const result = heuristicExtractFilters('Anträge zur Bildungspolitik');
    expect(result?.content_type).toBe('antrag');
  });

  it('returns null when no filters detected', () => {
    expect(heuristicExtractFilters('Was ist Klimaschutz?')).toBeNull();
  });
});

// ─── looksMultiTopic ──────────────────────────────────────────────────────

describe('looksMultiTopic', () => {
  it('detects multi-topic research query with "und"', () => {
    expect(looksMultiTopic('recherchiere nach alfter und nach wärmeförderung')).toBe(true);
  });

  it('detects multi-topic with different tasks implying different topics', () => {
    expect(
      looksMultiTopic('recherchiere klimaschutz und schreibe einen antrag zur verkehrswende')
    ).toBe(true);
  });

  it('returns false for single topic query', () => {
    expect(looksMultiTopic('recherchiere klimaschutz')).toBe(false);
  });

  it('returns false for short queries even with "und"', () => {
    expect(looksMultiTopic('Klima und Umwelt')).toBe(false);
  });

  it('detects multi-topic with longer natural language query', () => {
    expect(
      looksMultiTopic('Was sagen die Grünen zum Klimaschutz und zur Verkehrswende in Deutschland?')
    ).toBe(true);
  });

  it('returns false for greeting with "und"', () => {
    expect(looksMultiTopic('Hallo und danke')).toBe(false);
  });

  it('detects "sowie" conjunction', () => {
    expect(
      looksMultiTopic('recherchiere die Energiepolitik sowie die aktuelle Lage der Windkraft')
    ).toBe(true);
  });

  it('returns false when one side has only one word', () => {
    expect(looksMultiTopic('recherchiere und Umweltpolitik der Grünen in Bayern')).toBe(false);
  });
});
