/**
 * Eine Zeile wie „9. September 2026" oder „19. Wahlperiode" darf Überschrift
 * werden, aber ihre Zahl ist Inhalt und muss stehen bleiben (#4123).
 *
 * Listenpunkte und Sätze, die zufällig in Großbuchstaben stehen oder auf einen
 * Doppelpunkt enden, sind keine Überschriften (#6142).
 */
import { describe, it, expect } from 'vitest';

import { applyMarkdownFormatting, isLikelyHeading } from './textFormatting.js';

describe('applyMarkdownFormatting', () => {
  it.each([
    ['9. September 2026', '## 9. September 2026'],
    ['78. Sitzung', '## 78. Sitzung'],
    ['19. Wahlperiode', '## 19. Wahlperiode'],
    ['1. Einleitung', '## 1. Einleitung'],
  ])('keeps the leading number of %j', (line, expected) => {
    expect(applyMarkdownFormatting(`Vorlauf\nmehr Vorlauf\nnoch mehr\n${line}`)).toContain(
      `\n${expected}`
    );
  });

  it('still turns speaker lines into headings', () => {
    expect(applyMarkdownFormatting('a\nb\nc\nPräsidentin Cornelia Seibeld:')).toContain(
      '\n## Präsidentin Cornelia Seibeld:'
    );
  });

  it('leaves the upper-case list of the Rhein-Sieg statute as a list', () => {
    const text = [
      'Schreibweisen in Großbuchstaben vereinheitlicht. Demnach heißt es:',
      '- "BÜNDNIS 90/DIE GRÜNEN"',
      '- "DIE GRÜNEN"',
      '- "GRÜNE"',
      '- "GRÜNE JUGEND"',
    ].join('\n');
    expect(applyMarkdownFormatting(text)).toBe(text);
  });
});

describe('isLikelyHeading', () => {
  it.each([
    '- "GRÜNE"',
    '• GRÜNE JUGEND',
    '* DIE GRÜNEN',
    '(2) Die KMV entscheidet:',
    'a) Die Mitglieder haben folgende Rechte:',
    '- über die Richtlinien:',
    'Schreibweisen in Großbuchstaben vereinheitlicht. Demnach heißt es:',
  ])('rejects %j', (line) => {
    expect(isLikelyHeading(line)).toBe(false);
  });

  it.each([
    'PRÄAMBEL',
    'Präsidentin Cornelia Seibeld:',
    'Dr. Anton Hofreiter (BÜNDNIS 90/DIE GRÜNEN):',
    'Prof. Dr. Lars Castellucci (SPD):',
    'Tagesordnung:',
    '2.1 Hintergrund',
  ])('accepts %j', (line) => {
    expect(isLikelyHeading(line)).toBe(true);
  });
});
