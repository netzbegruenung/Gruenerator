import { describe, it, expect } from 'vitest';

import { parseSocialPostText, extractPostConstraints } from './socialPostService.js';

describe('extractPostConstraints', () => {
  it('reads the limits out of the live request that was ignored', () => {
    // Instagram's platform max is 2200; the request asked for 500 and got 765.
    expect(
      extractPostConstraints(
        'Schreib mir einen Instagram-Post zum Thema Klimaschutz, max. 500 Zeichen, maximal 3 Hashtags',
        2200
      )
    ).toEqual({ maxChars: 500, maxHashtags: 3 });
  });

  it('ignores a char limit that would RAISE the platform maximum', () => {
    expect(extractPostConstraints('Ein Tweet mit 500 Zeichen bitte', 280)).toEqual({
      maxChars: null,
      maxHashtags: null,
    });
  });

  it('returns nothing for a request without format instructions', () => {
    expect(extractPostConstraints('Schreib einen Post über bezahlbaren Wohnraum', 2200)).toEqual({
      maxChars: null,
      maxHashtags: null,
    });
  });

  it('takes each limit on its own', () => {
    expect(extractPostConstraints('Bitte höchstens 4 Hashtags verwenden', 2200)).toEqual({
      maxChars: null,
      maxHashtags: 4,
    });
  });
});

describe('parseSocialPostText', () => {
  it('extracts hashtags and char count from a plain post', () => {
    const raw = `🌱 Klimaschutz beginnt vor Ort!

Unsere Forderung: Tempo 30 in allen Wohngebieten.

#Klimaschutz #Tempo30 #Verkehrswende`;
    const parsed = parseSocialPostText(raw);
    expect(parsed.hashtags).toEqual(['#Klimaschutz', '#Tempo30', '#Verkehrswende']);
    expect(parsed.charCount).toBe(parsed.text.length);
    expect(parsed.text.startsWith('🌱 Klimaschutz')).toBe(true);
  });

  it('dedupes repeated hashtags', () => {
    const parsed = parseSocialPostText('Los gehts #Gruene mitmachen #Gruene');
    expect(parsed.hashtags).toEqual(['#Gruene']);
  });

  it('strips code fences', () => {
    const parsed = parseSocialPostText('```\nMein Post #Test\n```');
    expect(parsed.text).toBe('Mein Post #Test');
  });

  it('strips a lead-in meta line', () => {
    const parsed = parseSocialPostText('Hier ist dein Post:\n\nEchter Inhalt #Tag');
    expect(parsed.text).toBe('Echter Inhalt #Tag');
  });

  it('keeps umlauts and Genderstern intact', () => {
    const parsed = parseSocialPostText('Für alle Bürger*innen! #GrüneVorOrt');
    expect(parsed.hashtags).toEqual(['#GrüneVorOrt']);
    expect(parsed.text).toContain('Bürger*innen');
  });

  it('handles a post without hashtags', () => {
    const parsed = parseSocialPostText('Kurzer Tweet ohne Tags.');
    expect(parsed.hashtags).toEqual([]);
    expect(parsed.charCount).toBe('Kurzer Tweet ohne Tags.'.length);
  });
});
