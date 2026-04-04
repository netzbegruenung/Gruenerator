import { describe, it, expect } from 'vitest';

import { extractCompoundTopic } from './compoundTopicExtractor.js';

describe('extractCompoundTopic', () => {
  it('strips action verbs and extracts the factual topic', () => {
    expect(extractCompoundTopic('erstelle eine Pressemitteilung über Klimapolitik', [])).toBe(
      'Klimapolitik'
    );
  });

  it('strips content type nouns and prepositions', () => {
    expect(extractCompoundTopic('schreibe einen Antrag zum Thema Nahverkehr', [])).toBe(
      'Nahverkehr'
    );
  });

  it('strips articles and prepositions but preserves topic nouns', () => {
    expect(extractCompoundTopic('was sagen die Grünen zum Nahverkehr?', [])).toBe(
      'was sagen Grünen Nahverkehr?'
    );
  });

  it('falls back to notebook display name when clean text is too short', () => {
    expect(extractCompoundTopic('erstelle eine', ['hamburg-notebook'])).toBe('Hamburg');
  });

  it('falls back to notebook display name when clean text is empty', () => {
    expect(extractCompoundTopic('', ['hamburg-notebook'])).toBe('Hamburg');
  });

  it('combines multiple notebook names', () => {
    expect(extractCompoundTopic('', ['hamburg-notebook', 'berlin-notebook'])).toBe(
      'Hamburg, Berlin'
    );
  });

  it('falls back to notebook name when only content type words remain', () => {
    // "PM" is a content type stop word, so it gets filtered
    expect(extractCompoundTopic('PM', ['hamburg-notebook'])).toBe('Hamburg');
  });

  it('returns "aktuelle Themen" as absolute fallback', () => {
    expect(extractCompoundTopic('', [])).toBe('aktuelle Themen');
  });

  it('handles complex compound with multiple action verbs', () => {
    expect(
      extractCompoundTopic(
        'erstelle mir bitte eine ausführliche Pressemitteilung über die Energiewende',
        []
      )
    ).toBe('Energiewende');
  });

  it('handles unknown notebook IDs gracefully', () => {
    expect(extractCompoundTopic('', ['unknown-notebook'])).toBe('aktuelle Themen');
  });
});
