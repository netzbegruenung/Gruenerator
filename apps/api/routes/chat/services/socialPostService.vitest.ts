import { describe, it, expect } from 'vitest';

import { parseSocialPostText } from './socialPostService.js';

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
