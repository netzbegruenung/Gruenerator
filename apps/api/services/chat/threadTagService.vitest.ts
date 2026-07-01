import { describe, expect, it } from 'vitest';

import { parseTags } from './threadTagService.js';

describe('parseTags', () => {
  it('parses a clean JSON array', () => {
    expect(parseTags('["klimaschutz","antrag","verkehr"]')).toEqual([
      'klimaschutz',
      'antrag',
      'verkehr',
    ]);
  });

  it('strips markdown code fences around the array', () => {
    expect(parseTags('```json\n["energie","wärmepumpe"]\n```')).toEqual(['energie', 'wärmepumpe']);
  });

  it('extracts the array even with surrounding prose', () => {
    expect(parseTags('Hier sind die Tags: ["mobilität", "radverkehr"]. Passt das?')).toEqual([
      'mobilität',
      'radverkehr',
    ]);
  });

  it('lowercases, trims and dedupes', () => {
    expect(parseTags('["Klima", " klima ", "KLIMA", "Verkehr"]')).toEqual(['klima', 'verkehr']);
  });

  it('caps at four tags', () => {
    expect(parseTags('["a1","b2","c3","d4","e5","f6"]')).toEqual(['a1', 'b2', 'c3', 'd4']);
  });

  it('drops entries shorter than two characters', () => {
    expect(parseTags('["ok","x","ja"]')).toEqual(['ok', 'ja']);
  });

  it('falls back to comma/newline splitting when not valid JSON', () => {
    expect(parseTags('klimaschutz, verkehr\nantrag')).toEqual(['klimaschutz', 'verkehr', 'antrag']);
  });

  it('returns an empty array for unparseable garbage', () => {
    expect(parseTags('')).toEqual([]);
    expect(parseTags('.')).toEqual([]);
  });

  it('truncates over-long tags to the max length', () => {
    const long = 'a'.repeat(40);
    const [tag] = parseTags(`["${long}"]`);
    expect(tag.length).toBe(24);
  });
});
