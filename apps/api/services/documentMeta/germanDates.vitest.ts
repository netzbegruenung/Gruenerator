/**
 * Die Scraper lesen ihre Datumsmuster seit dem Umzug aus `germanDates.ts`.
 * Diese Fälle halten fest, dass sich dabei nichts an ihrem Verhalten ändert —
 * sie liefen vor dem Umzug gegen den alten Code genauso grün.
 */
import { describe, expect, it } from 'vitest';

import { ContentExtractor } from '../scrapers/implementations/LandesverbandScraper/extractors/ContentExtractor.js';
import { DateExtractor } from '../scrapers/implementations/LandesverbandScraper/extractors/DateExtractor.js';

describe('ContentExtractor.normalizeGermanDate — unverändert', () => {
  it.each([
    ['21. Mai 2026', '2026-05-21'],
    ['3. märz 2024', '2024-03-03'],
    ['am Donnerstag, 2. März 2023', '2023-03-02'],
    ['19.02.2026', '2026-02-19'],
    ['2.4.2026', '2026-04-02'],
    ['02.04.2026', '2026-04-02'],
    ['29.04.99', '1999-04-29'],
    ['01.01.50', '2050-01-01'],
    ['2026-02-19', '2026-02-19'],
    ['  2026-02-19T10:00:00Z ', '2026-02-19T10:00:00Z'],
    ['kein Datum', 'kein Datum'],
    ['Maerz 2024', 'Maerz 2024'],
  ])('%s → %s', (input, expected) => {
    expect(ContentExtractor.normalizeGermanDate(input)).toBe(expected);
  });
});

describe('DateExtractor.extractWolkeFileNameDate — unverändert', () => {
  it.each([
    ['2024-01-08_Beschluss.pdf', '2024-01-08'],
    ['Beschluss 08.01.2025.pdf', '2025-01-08'],
    ['20230905_protokoll.pdf', '2023-09-05'],
    ['250117_Positionspapier.pdf', '2025-01-17'],
    ['22-02-17-wahlprogramm.pdf', '2022-02-17'],
    ['beschluss-12-oktober-2024.pdf', '2024-10-12'],
    ['Beschluss 24. Mai 2025.pdf', '2025-05-24'],
    ['Wahlpruefsteine 2021 BUND.pdf', null],
    ['Beschluss 31.02.2024.pdf', null],
    ['Beschluss 01.01.1985.pdf', null],
  ])('%s → %s', (name, expected) => {
    expect(DateExtractor.extractWolkeFileNameDate(name).dateString).toBe(expected);
  });
});
