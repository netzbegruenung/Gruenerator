import { describe, it, expect } from 'vitest';

import {
  extractUrls,
  isTabularComputeQuestion,
  detectSocialPlatform,
  resolveSocialPostEscape,
  nounNearCreateVerb,
  NOUN_TRIGGER_MAX_LENGTH,
} from './classifierHeuristics.js';
import {
  extractSearchTopic,
  parseClassifierResponse,
  detectSearchSources,
  detectComplexity,
  heuristicClassify,
  extractFilters,
  heuristicExtractFilters,
  looksMultiTopic,
  HEURISTIC_CONFIDENCE_THRESHOLD,
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

// ─── extractUrls (scrape_url detection) ───────────────────────────────────

describe('extractUrls', () => {
  it('returns [] when no URL present', () => {
    expect(extractUrls('Schreib einen Tweet über Klimapolitik')).toEqual([]);
  });

  it('detects a single pasted URL', () => {
    expect(extractUrls('Lies das: https://gruene.de/programm')).toEqual([
      'https://gruene.de/programm',
    ]);
  });

  it('strips trailing sentence punctuation', () => {
    expect(extractUrls('Quelle ist https://example.com/artikel.')).toEqual([
      'https://example.com/artikel',
    ]);
  });

  it('detects multiple URLs and dedupes', () => {
    expect(
      extractUrls('Vergleiche https://a.de und https://b.de sowie nochmal https://a.de')
    ).toEqual(['https://a.de', 'https://b.de']);
  });

  it('ignores bare domains without http(s) scheme', () => {
    expect(extractUrls('Schau auf gruene.de nach')).toEqual([]);
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

  it('fast-paths explicit presentation-deck requests to create_presentation', () => {
    for (const q of [
      'Erstelle eine Präsentation über kommunale Wärmeplanung',
      'Mach mir einen Foliensatz zum Thema Klimaschutz',
      'Generiere ein Pitch-Deck für unseren Antrag',
      'Bau Folien über die Verkehrswende',
    ]) {
      const result = heuristicClassify(q);
      expect(result.intent).toBe('create_presentation');
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    }
  });

  it('does NOT route prose mentions of a presentation to create_presentation', () => {
    const result = heuristicClassify('Worum ging es in der Präsentation von gestern?');
    expect(result.intent).not.toBe('create_presentation');
  });

  it('routes tabular aggregation questions to compute when a spreadsheet is attached', () => {
    const result = heuristicClassify('produkt mit höchstem gesamtgewinn?', {
      hasTabularAttachment: true,
    });
    expect(result.intent).toBe('compute');
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('does NOT fire the tabular compute rule without an attached spreadsheet', () => {
    const result = heuristicClassify('produkt mit höchstem gesamtgewinn?');
    expect(result.intent === 'compute' && result.reasoning.includes('Tabular aggregation')).toBe(
      false
    );
  });

  it('leaves non-aggregation questions alone even with a spreadsheet attached', () => {
    const result = heuristicClassify('worum geht es in dieser datei?', {
      hasTabularAttachment: true,
    });
    expect(result.intent).not.toBe('compute');
  });

  it('isTabularComputeQuestion matches vague follow-ups the confidence penalty would drop', () => {
    // The contract router re-checks the raw text with this matcher so short
    // multi-turn follow-ups still take the run_python interrupt path.
    expect(isTabularComputeQuestion('durchschnittlicher umsatz pro region?')).toBe(true);
    expect(isTabularComputeQuestion('und der gesamtgewinn?')).toBe(true);
    expect(isTabularComputeQuestion('wie hoch ist der gewinn')).toBe(true);
    expect(isTabularComputeQuestion('was ist das produkt mit dem höchsten wert?')).toBe(true);
    expect(isTabularComputeQuestion('worum geht es in dieser datei?')).toBe(false);
  });

  it('isTabularComputeQuestion binds verbs to word starts (erzähl must not match zähl)', () => {
    expect(isTabularComputeQuestion('erzähl mir, worum es im angehängten pdf geht')).toBe(false);
    expect(isTabularComputeQuestion('zähle die einträge pro region')).toBe(true);
  });

  it('isTabularComputeQuestion covers superlative/analysis phrasings from the beta run', () => {
    // "am meisten" took the legacy path in beta and crashed with a NameError.
    expect(isTabularComputeQuestion('welcher verkäufer verkauft am meisten?')).toBe(true);
    expect(isTabularComputeQuestion('was ist das beste produkt?')).toBe(true);
    expect(isTabularComputeQuestion('finde ausreißer beim einzelpreis')).toBe(true);
    expect(isTabularComputeQuestion('prognostiziere den umsatz q1 2025')).toBe(true);
    // 'best…' must not fire inside 'Bestellung'.
    expect(isTabularComputeQuestion('zeige die bestellung von gestern')).toBe(false);
  });

  it('isTabularComputeQuestion leaves text-metric questions to the plain computeNode', () => {
    // Beta regression: character/word counting of pasted text was hijacked by
    // the run_python gate and produced a pointless df snippet.
    expect(isTabularComputeQuestion('wie viele zeichen sind das hier und wie viele wörter')).toBe(
      false
    );
    expect(isTabularComputeQuestion('zähl die wörter in diesem text')).toBe(false);
  });

  it('isTabularComputeQuestion leaves chart/visualization requests alone', () => {
    expect(isTabularComputeQuestion('erstelle ein balkendiagramm der umsätze pro monat')).toBe(
      false
    );
    expect(isTabularComputeQuestion('visualisiere die gewinne')).toBe(false);
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
    // Medium-high confidence (0.82) — see classifierHeuristics.ts party-position branch
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('detects current events queries', () => {
    // "aktuell" is the exact lemma form; "Aktuelle" would fuzzy-match at lower confidence
    const result = heuristicClassify('Was ist aktuell in der Energiepolitik?');
    expect(result.intent).toBe('web');
    expect(result.confidence).toBeGreaterThanOrEqual(0.75);
  });

  it('classifies creative content tasks as direct (user provides their own facts)', () => {
    // Fact-based content types (Pressemitteilung, Artikel, Rede, ...) are treated as
    // creative writing tasks — users on this platform typically provide the facts
    // themselves and want the AI to write/format. Research is not implied.
    const result = heuristicClassify('Schreibe eine Pressemitteilung über den Kohleausstieg');
    expect(result.intent).toBe('direct');
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

// ─── heuristicClassify: chart intent ─────────────────────────────────────

describe('heuristicClassify: chart intent', () => {
  it('detects "Erstelle ein Diagramm" as chart', () => {
    const result = heuristicClassify('Erstelle ein Diagramm über die Wahlergebnisse');
    expect(result.intent).toBe('chart');
  });

  it('detects "Balkendiagramm" as chart', () => {
    const result = heuristicClassify('Zeige mir ein Balkendiagramm der Umfragewerte');
    expect(result.intent).toBe('chart');
  });

  it('detects "Kreisdiagramm" as chart', () => {
    const result = heuristicClassify('Erstelle ein Kreisdiagramm mit den Sitzverteilungen');
    expect(result.intent).toBe('chart');
  });

  it('detects "Statistik" via fuzzy match', () => {
    const result = heuristicClassify('Visualisiere die Statistik als Chart');
    expect(result.intent).toBe('chart');
  });

  it('does not commit chart at high confidence on bare "Diagramm" mention', () => {
    // Fuzzy match still returns chart at 0.65, but pipeline only commits ≥0.85.
    // Below threshold the LLM gets consulted, which is the safe behavior.
    const result = heuristicClassify('Im Diagramm der Auswertung sehen wir steigende Zahlen');
    expect(result.confidence).toBeLessThan(HEURISTIC_CONFIDENCE_THRESHOLD);
  });

  it('does not commit chart at high confidence on questions about a chart', () => {
    const result = heuristicClassify('Erkläre mir bitte das Chart auf Seite drei');
    expect(result.confidence).toBeLessThan(HEURISTIC_CONFIDENCE_THRESHOLD);
  });
});

// ─── save_as_doc: heuristic detects explicit phrasing ──────────────
// save_as_doc has a clear explicit pattern ("als Dokument", "Dokument speichern"),
// so the heuristic handles the common phrasing. modify_doc/modify_board still
// require LLM context because they depend on @doc/@board mentions.

describe('heuristicClassify: doc/board action intents', () => {
  it('detects explicit save_as_doc phrasing', () => {
    const result = heuristicClassify('Speichere das als Dokument');
    expect(result.intent).toBe('save_as_doc');
  });

  it('does not trigger save_as_doc on bare "Dokument" mention without save action', () => {
    const result = heuristicClassify(
      'Schreib eine Pressemitteilung über das Dokument der Arbeitsgruppe'
    );
    expect(result.intent).not.toBe('save_as_doc');
  });

  it('does not trigger save_as_doc on "als Protokoll" without save action', () => {
    const result = heuristicClassify('Das Treffen gilt als Protokoll der Sitzung');
    expect(result.intent).not.toBe('save_as_doc');
  });

  it('does not trigger save_as_doc on questions about a document', () => {
    const result = heuristicClassify('Was steht im Dokument zur Klimapolitik?');
    expect(result.intent).not.toBe('save_as_doc');
  });

  it('does not heuristic-detect modify_doc (requires LLM + @doc)', () => {
    const result = heuristicClassify('Ändere den zweiten Absatz');
    expect(result.intent).not.toBe('modify_doc');
  });

  it('does not heuristic-detect modify_board (requires LLM + @board)', () => {
    const result = heuristicClassify('Füge eine neue Aufgabe hinzu');
    expect(result.intent).not.toBe('modify_board');
  });
});

// ─── parseClassifierResponse: new intents are valid ─────────────────────

describe('heuristicClassify: social_post intent (EXPERIMENTAL combined post)', () => {
  it('routes creation requests to social_post', () => {
    // 0.8 sits below HEURISTIC_CONFIDENCE_THRESHOLD by design: the primary
    // route is the classifier's dedicated Tier-2.5 branch; this heuristic is
    // the same-confidence successor of the old examples creation rule.
    const result = heuristicClassify('Erstelle einen Instagram-Post zu Tempo 30');
    expect(result.intent).toBe('social_post');
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('keeps example browsing on the examples intent', () => {
    const result = heuristicClassify('Zeig mir Beispiele für Instagram-Posts');
    expect(result.intent).toBe('examples');
  });

  it('creation with explicit "beispiel" wording stays examples', () => {
    const result = heuristicClassify('Erstelle einen Post nach dieser Vorlage als Beispiel');
    expect(result.intent).toBe('examples');
  });

  it('"nur Text" escape hatch keeps the text-only flow', () => {
    const result = heuristicClassify('Schreib mir nur den Text für einen Insta-Post zu Tempo 30');
    expect(result.intent).toBe('examples');
  });

  it('"ohne Text" escape hatch keeps the sharepic-only flow', () => {
    const result = heuristicClassify('Erstelle einen Instagram-Post ohne Text zu Tempo 30');
    expect(result.intent).toBe('sharepic');
  });

  it('explicit sharepic wording keeps the shipped sharepic flow (0.93 rule wins)', () => {
    const result = heuristicClassify('Erstelle ein Sharepic für Instagram zu Tempo 30');
    expect(result.intent).toBe('sharepic');
  });

  it('"Post MIT Sharepic" is the explicit combined ask — stays social_post', () => {
    const result = heuristicClassify('Erstelle einen Insta-Post mit Sharepic zu Tempo 30');
    expect(result.intent).toBe('social_post');
    expect(heuristicClassify('Schreib einen Post inkl. Sharepic zur Verkehrswende').intent).toBe(
      'social_post'
    );
  });
});

// ─── pasted reference material must not hijack noun-triggered intents ──────

describe('heuristicClassify: pasted material with social/sharepic nouns', () => {
  // Docs-page style paste: describes the product, mentions Sharepics/Instagram
  // with creation verbs nearby — exactly the text that hijacked classification.
  const pastedDocs =
    'Der Grünerator ist ein speziell für Bündnis 90/Die Grünen entwickeltes KI-Tool. ' +
    'Er erstellt Texte wie Pressemitteilungen, Social-Media-Beiträge und Anträge für kommunale Parlamente. ' +
    'Außerdem kann er Sharepics grünerieren und beim Erstellen von Untertiteln helfen. ' +
    'Wenn er einen Beitrag für Instagram oder eine Pressemitteilung erstellt, klingt dieser grün. ' +
    'Er hilft beim Erstellen von Untertiteln für Instagram Reels und kreiert Alt-Texte für Sharepics. ' +
    'Der Grünerator verwendet eine stark vereinfachte Benutzeroberfläche für alle Ehrenamtlichen.';

  it('"Sharepics" inside a long paste does not fast-path to sharepic', () => {
    const result = heuristicClassify(
      `Nun schreibe eine Produktvorstellung des Grünerators, die zu diesem Antrag passt, ohne ihn zu zitieren: ${pastedDocs}`
    );
    expect(result.intent).not.toBe('sharepic');
    expect(result.intent).not.toBe('social_post');
    expect(result.confidence).toBeLessThan(HEURISTIC_CONFIDENCE_THRESHOLD);
  });

  it('a genuine sharepic ask over a long paste defers to the LLM instead of misrouting', () => {
    const result = heuristicClassify(
      `Erstelle ein Sharepic zu folgendem Text: ${'Wort '.repeat(120)}`
    );
    expect(result.confidence).toBeLessThan(HEURISTIC_CONFIDENCE_THRESHOLD);
  });

  it('short sharepic asks keep the 0.93 fast path', () => {
    const result = heuristicClassify('Erstelle ein Sharepic zur Verkehrswende');
    expect(result.intent).toBe('sharepic');
    expect(result.confidence).toBeGreaterThanOrEqual(HEURISTIC_CONFIDENCE_THRESHOLD);
  });

  it('a creation verb far from a social noun is not a social_post ask (short message)', () => {
    const msg =
      'Schreibe eine Produktvorstellung dieses Werkzeugs. ' +
      'Es unterstützt Ehrenamtliche bei vielen Aufgaben im Alltag der Partei. '.repeat(3) +
      'Auch Instagram wird darin erwähnt.';
    expect(msg.length).toBeLessThanOrEqual(NOUN_TRIGGER_MAX_LENGTH);
    const result = heuristicClassify(msg);
    expect(result.intent).not.toBe('social_post');
  });
});

describe('heuristicClassify: pasted material must not hijack other fast paths', () => {
  const filler =
    'Der Ortsverband trifft sich jeden zweiten Donnerstag im Monat. Alle Mitglieder sind herzlich eingeladen, eigene Themen mitzubringen. '.repeat(
      4
    );

  const hijacks: Array<{ hijacked: string; msg: string }> = [
    {
      hijacked: 'image',
      msg: `Schreibe eine Produktvorstellung auf Basis dieses Textes: Das Tool erstellt jede Grafik automatisch im Corporate Design. ${filler}`,
    },
    {
      hijacked: 'chart',
      msg: `Schreibe einen Artikel auf Basis dieses Berichts: Das Diagramm zeigt einen deutlichen Anstieg der Mitgliederzahlen seit 2024. ${filler}`,
    },
    {
      hijacked: 'artifact',
      msg: `Schreibe eine Produktvorstellung zu diesem Verein: Die Website des Vereins bietet viele Informationen über die Arbeit vor Ort. ${filler}`,
    },
    {
      hijacked: 'save_as_doc',
      msg: `Was haltet ihr von diesen Aufgaben: Anna wird das Protokoll erstellen und an alle verschicken. ${filler}`,
    },
    {
      hijacked: 'create_presentation',
      msg: `Gib mir Feedback zu diesen Sitzungsnotizen: Max erstellt die Präsentation für den Parteitag am Samstag. ${filler}`,
    },
    {
      hijacked: 'summary',
      msg: `Schreibe einen Tweet dazu: Eine Zusammenfassung des Beschlusses findet ihr auf unserer Seite. ${filler}`,
    },
    {
      hijacked: 'web',
      msg: `Schreibe eine Anleitung auf Basis dieses Entwurfs: Suche im Internet nach dem Begriff und vergleiche die Ergebnisse. ${filler}`,
    },
    {
      hijacked: 'research',
      msg: `Schreibe eine Anleitung auf Basis dieser Tipps: Recherchiere vor jedem Beitrag die Faktenlage und nenne Quellen. ${filler}`,
    },
  ];

  it.each(hijacks)('paste keywords do not fast-path to $hijacked', ({ hijacked, msg }) => {
    const result = heuristicClassify(msg);
    expect(result.intent).not.toBe(hijacked);
    expect(result.confidence).toBeLessThan(HEURISTIC_CONFIDENCE_THRESHOLD);
  });

  it('short creation asks keep their fast paths', () => {
    expect(heuristicClassify('Erstelle ein Balkendiagramm der Wahlergebnisse 2025').intent).toBe(
      'chart'
    );
    expect(heuristicClassify('Generiere ein Bild von einem Windpark im Sonnenaufgang').intent).toBe(
      'image'
    );
    expect(heuristicClassify('Speichere das als Dokument').intent).toBe('save_as_doc');
    expect(heuristicClassify('Erstelle eine Präsentation über die Verkehrswende').intent).toBe(
      'create_presentation'
    );
  });

  it('compute keeps its fast path over long pastes (word counting IS the use case)', () => {
    const result = heuristicClassify(`Wie viele Wörter hat dieser Text: ${filler}`);
    expect(result.intent).toBe('compute');
    expect(result.confidence).toBeGreaterThanOrEqual(HEURISTIC_CONFIDENCE_THRESHOLD);
  });

  it('"teile das mit …" inside a long paste does not fast-path to share_doc', () => {
    const result = heuristicClassify(
      `Fasse das zusammen: Bitte teile das mit euren Ortsverbänden und meldet euch bei Fragen. ${filler}`
    );
    expect(result.intent).not.toBe('share_doc');
    expect(result.confidence).toBeLessThan(HEURISTIC_CONFIDENCE_THRESHOLD);
  });

  it('short share asks keep the share_doc fast path', () => {
    expect(heuristicClassify('Teile das mit der AG Umwelt').intent).toBe('share_doc');
  });
});

describe('heuristicClassify: greeting rule needs a word boundary', () => {
  it('"Hier …" / "Hilfe …" are not greetings (^hi matched without \\b)', () => {
    const hier = heuristicClassify(
      'Hier der Text für morgen, mach daraus bitte einen Instagram-Post'
    );
    expect(hier.reasoning).not.toBe('Greeting detected');
    expect(hier.intent).toBe('social_post');
    const hilfe = heuristicClassify(
      'Hilfe, wie erstelle ich ein Sharepic für unseren Ortsverband?'
    );
    expect(hilfe.reasoning).not.toBe('Greeting detected');
  });

  it('real greetings keep the fast path', () => {
    expect(heuristicClassify('Hallo, wie geht es dir?').intent).toBe('direct');
    expect(heuristicClassify('Hi! Kannst du mir helfen?').intent).toBe('direct');
    expect(heuristicClassify('Danke dir, das passt so!').intent).toBe('direct');
  });
});

describe('heuristicClassify: unit conversion needs a target unit', () => {
  it('genuine conversions still route to compute', () => {
    expect(heuristicClassify('5 km in Meilen').intent).toBe('compute');
    expect(heuristicClassify('2 std in minuten bitte').intent).toBe('compute');
  });

  it('umlaut units work despite ASCII-only \\b ("5 Fuß in Meter")', () => {
    expect(heuristicClassify('5 Fuß in Meter').intent).toBe('compute');
    expect(heuristicClassify('5 fuss in meter').intent).toBe('compute');
  });

  it('plural/English target units convert ("10 kg in lbs", "5 km in miles")', () => {
    expect(heuristicClassify('10 kg in lbs').intent).toBe('compute');
    expect(heuristicClassify('5 km in miles').intent).toBe('compute');
  });

  it('the same unit on both sides is prose, not a conversion', () => {
    const result = heuristicClassify(
      'Schreibe einen Beitrag zur Klimakrise: 2 Grad Erwärmung, gemessen in Grad Celsius, sind zu viel'
    );
    expect(result.intent).not.toBe('compute');
  });

  it('"Tempo 30 in der Innenstadt … als …" is a post, not a conversion', () => {
    const result = heuristicClassify(
      'Erstelle einen Post zu Tempo 30 in der Innenstadt als Beitrag für unsere Kampagne'
    );
    expect(result.intent).toBe('social_post');
  });

  it('"35 °C in Berlin" is not a conversion', () => {
    const result = heuristicClassify(
      'Schreib einen Post zur Hitzewelle: gestern 35 °C in Berlin, wir fordern mehr Stadtgrün'
    );
    expect(result.intent).not.toBe('compute');
  });

  it('"500 m in wenigen Minuten" is not a conversion', () => {
    const result = heuristicClassify(
      'Schreib einen Beitrag über den neuen Radweg: 500 m in wenigen Minuten, sicher für alle'
    );
    expect(result.intent).not.toBe('compute');
  });
});

describe('nounNearCreateVerb', () => {
  const noun = /\b(instagram)\b/i;

  it('true when verb and noun sit close together', () => {
    expect(nounNearCreateVerb('erstelle einen instagram-post zu tempo 30', noun)).toBe(true);
  });

  it('false when the noun sits far from the verb', () => {
    const text = `schreibe eine produktvorstellung. ${'wort '.repeat(40)}instagram ist eine plattform`;
    expect(nounNearCreateVerb(text, noun)).toBe(false);
  });

  it('false without a creation verb', () => {
    expect(nounNearCreateVerb('instagram ist eine plattform', noun)).toBe(false);
  });
});

describe('detectSocialPlatform', () => {
  it('detects the four platforms', () => {
    expect(detectSocialPlatform('ein insta-post bitte')).toBe('instagram');
    expect(detectSocialPlatform('was für facebook')).toBe('facebook');
    expect(detectSocialPlatform('einen tweet dazu')).toBe('twitter');
    expect(detectSocialPlatform('für linkedin formulieren')).toBe('linkedin');
  });

  it('maps mastodon/bluesky to the twitter budget', () => {
    expect(detectSocialPlatform('post für mastodon')).toBe('twitter');
    expect(detectSocialPlatform('bluesky post')).toBe('twitter');
  });

  it('returns null when no platform is named', () => {
    expect(detectSocialPlatform('social media post zur verkehrswende')).toBe(null);
  });
});

describe('resolveSocialPostEscape', () => {
  it('routes "nur Text" to examples', () => {
    expect(resolveSocialPostEscape('nur den text bitte')).toBe('examples');
    expect(resolveSocialPostEscape('post ohne sharepic')).toBe('examples');
  });

  it('routes "nur Sharepic" / "ohne Text" to sharepic', () => {
    expect(resolveSocialPostEscape('nur ein sharepic')).toBe('sharepic');
    expect(resolveSocialPostEscape('bitte ohne text')).toBe('sharepic');
  });

  it('returns null for plain creation requests', () => {
    expect(resolveSocialPostEscape('instagram-post zu tempo 30')).toBe(null);
  });

  it('inclusion phrasing ("mit Sharepic") is NOT an escape — combined flow', () => {
    expect(resolveSocialPostEscape('insta-post mit sharepic zu tempo 30')).toBe(null);
    expect(resolveSocialPostEscape('post mit einem passenden sharepic')).toBe(null);
    expect(resolveSocialPostEscape('tweet inklusive spruchbild')).toBe(null);
  });

  it('unambiguous text-only nouns escape to examples without a "nur"', () => {
    expect(resolveSocialPostEscape('gib mir den wortlaut für insta')).toBe('examples');
    expect(resolveSocialPostEscape('post als bildunterschrift')).toBe('examples');
    expect(resolveSocialPostEscape('reiner text bitte')).toBe('examples');
  });

  it('compound "-text" nouns (Posttext, Beitragstext, Social-Media-Text) escape to examples', () => {
    expect(resolveSocialPostEscape('schreib mir den posttext zu tempo 30')).toBe('examples');
    expect(resolveSocialPostEscape('beitragstext für facebook')).toBe('examples');
    expect(resolveSocialPostEscape('beitragsstext zur verkehrswende')).toBe('examples');
    expect(resolveSocialPostEscape('social-media-text über x')).toBe('examples');
    expect(resolveSocialPostEscape('post-text bitte')).toBe('examples');
  });

  it('a bare "Text" stays combined (needs a "nur"/"reine" qualifier)', () => {
    expect(resolveSocialPostEscape('schreib einen text für einen insta-post')).toBe(null);
  });

  it('exclusionary sharepic wording still escapes despite inclusion words elsewhere', () => {
    expect(resolveSocialPostEscape('nur ein sharepic mit sonnenblume')).toBe('sharepic');
  });
});

describe('parseClassifierResponse: new intent values', () => {
  it('accepts social_post intent from LLM', () => {
    const json = JSON.stringify({
      intent: 'social_post',
      searchQuery: 'Tempo 30',
      optimizedSearchQuery: 'Tempo 30 Verkehrswende',
      reasoning: 'Combined post request',
      contentType: null,
      needsResearch: false,
      needsClarification: false,
    });
    const result = parseClassifierResponse(json, 'Schreib einen Instagram-Post zu Tempo 30');
    expect(result).not.toBeNull();
    expect(result!.intent).toBe('social_post');
  });

  it('accepts chart intent from LLM', () => {
    const json = JSON.stringify({
      intent: 'chart',
      searchQuery: 'Wahlergebnisse als Balkendiagramm',
      optimizedSearchQuery: null,
      reasoning: 'Chart request',
      contentType: null,
      needsResearch: false,
      needsClarification: false,
    });
    const result = parseClassifierResponse(json, 'Erstelle ein Balkendiagramm');
    expect(result).not.toBeNull();
    expect(result!.intent).toBe('chart');
  });

  it('accepts save_as_doc intent from LLM', () => {
    const json = JSON.stringify({
      intent: 'save_as_doc',
      searchQuery: null,
      optimizedSearchQuery: null,
      reasoning: 'User wants to save as document',
      contentType: null,
      needsResearch: false,
      needsClarification: false,
    });
    const result = parseClassifierResponse(json, 'Speichere das als Dokument');
    expect(result).not.toBeNull();
    expect(result!.intent).toBe('save_as_doc');
  });

  it('accepts modify_doc intent from LLM', () => {
    const json = JSON.stringify({
      intent: 'modify_doc',
      searchQuery: null,
      optimizedSearchQuery: null,
      reasoning: 'User wants to edit mentioned document',
      contentType: null,
      needsResearch: false,
      needsClarification: false,
    });
    const result = parseClassifierResponse(json, 'Ändere den zweiten Absatz');
    expect(result).not.toBeNull();
    expect(result!.intent).toBe('modify_doc');
  });

  it('accepts modify_board intent from LLM', () => {
    const json = JSON.stringify({
      intent: 'modify_board',
      searchQuery: null,
      optimizedSearchQuery: null,
      reasoning: 'User wants to add tasks to board',
      contentType: null,
      needsResearch: false,
      needsClarification: false,
    });
    const result = parseClassifierResponse(json, 'Füge neue Aufgaben zum Board hinzu');
    expect(result).not.toBeNull();
    expect(result!.intent).toBe('modify_board');
  });
});
