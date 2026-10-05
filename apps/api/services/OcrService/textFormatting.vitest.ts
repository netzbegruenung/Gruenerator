/**
 * Eine Zeile wie „9. September 2026" oder „19. Wahlperiode" darf Überschrift
 * werden, aber ihre Zahl ist Inhalt und muss stehen bleiben (#4123).
 */
import { describe, it, expect } from 'vitest';

import { applyMarkdownFormatting } from './textFormatting.js';

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
});
