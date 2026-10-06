import * as cheerio from 'cheerio';
import { describe, expect, it } from 'vitest';

import { extractTitle } from './bundestagMarkup.js';

describe('extractTitle', () => {
  it('prefers the h1', () => {
    const $ = cheerio.load('<title>Seite | Bundestagsfraktion</title><h1> Klimaschutz </h1>');
    expect(extractTitle($)).toBe('Klimaschutz');
  });

  it('drops the site name from the <title> fallback', () => {
    const $ = cheerio.load(
      '<title>Ukraine und Klimakrise | Bundestagsfraktion Bündnis 90/Die Grünen</title>'
    );
    expect(extractTitle($)).toBe('Ukraine und Klimakrise');
  });

  it('keeps a title without the site name', () => {
    const $ = cheerio.load('<title>Wärmewende | Ein Überblick</title>');
    expect(extractTitle($)).toBe('Wärmewende | Ein Überblick');
  });
});
