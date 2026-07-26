/**
 * The download name is the only part of an export a user sees before opening
 * the file. It used to be taken from the first H2 in the content, which beat
 * the title they had given the document — so a "Social-Media-Trendscout" came
 * down as "🔥_Aktuelle_virale_Themen_&_Hashtags.pdf".
 */

import { describe, expect, it } from 'vitest';

import { extractFilenameFromContent, extractTitleFromContent } from './titleExtractor';

const CONTENT = '<h2>🔥 Aktuelle virale Themen</h2><p>Text</p>';

describe('extractFilenameFromContent', () => {
  it('uses the document title, not the first heading', () => {
    expect(extractFilenameFromContent(CONTENT, 'Social-Media-Trendscout')).toBe(
      'Social-Media-Trendscout'
    );
  });

  it('falls back to the heading when the document is untitled', () => {
    // Callers pass `docData.title || 'Dokument'`, so an untitled document
    // arrives as the fallback string itself.
    expect(extractFilenameFromContent(CONTENT, 'Dokument')).toBe('🔥 Aktuelle virale Themen');
    expect(extractFilenameFromContent(CONTENT)).toBe('🔥 Aktuelle virale Themen');
  });

  it('treats a whitespace-only title as no title', () => {
    expect(extractFilenameFromContent(CONTENT, '   ')).toBe('🔥 Aktuelle virale Themen');
  });

  it('strips characters no filesystem accepts — from the title too', () => {
    // This is what went out raw before: a slash split the name into a path.
    expect(extractFilenameFromContent('', 'Haushalt 2026/2027')).toBe('Haushalt 2026_2027');
    expect(extractFilenameFromContent('<h2>A?B*C</h2>')).toBe('A_B_C');
  });

  it('keeps spaces rather than underscoring them', () => {
    expect(extractFilenameFromContent('', 'Antrag zum Radverkehr')).toBe('Antrag zum Radverkehr');
  });

  it('collapses whitespace and trims the result', () => {
    expect(extractFilenameFromContent('', '  Antrag   zum   Radverkehr  ')).toBe(
      'Antrag zum Radverkehr'
    );
  });

  it('caps the length so the name stays a name', () => {
    expect(extractFilenameFromContent('', 'A'.repeat(200))).toHaveLength(80);
  });

  it('never returns an empty name', () => {
    // A title of nothing but illegal characters would otherwise produce ".pdf".
    expect(extractFilenameFromContent('', '///')).toBe('Dokument');
    expect(extractFilenameFromContent('')).toBe('Dokument');
  });
});

describe('extractTitleFromContent', () => {
  it('decodes entities and drops nested markup', () => {
    expect(extractTitleFromContent('<h2>Klima &amp; <strong>Energie</strong></h2>')).toBe(
      'Klima & Energie'
    );
  });

  it('returns the fallback when there is no usable heading', () => {
    expect(extractTitleFromContent('<p>Nur Text</p>', 'Ersatz')).toBe('Ersatz');
    expect(extractTitleFromContent('<h2>  </h2>', 'Ersatz')).toBe('Ersatz');
  });
});
