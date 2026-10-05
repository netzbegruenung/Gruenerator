import { describe, expect, it } from 'vitest';

import { snippetMarkdown } from './ResearchHitCard';

describe('snippetMarkdown', () => {
  it('drops bold markers the highlight split apart', () => {
    expect(snippetMarkdown('längere **<mark>Hitze</mark>**perioden')).toBe(
      'längere <mark>Hitze</mark>perioden'
    );
  });

  it('escapes gender stars so two of them are not one italic span', () => {
    expect(snippetMarkdown('Arbeitnehmer*innen und Patient*innen')).toBe(
      'Arbeitnehmer\\*innen und Patient\\*innen'
    );
  });

  it('leaves list stars and standalone stars alone', () => {
    expect(snippetMarkdown('* Punkt 5 * 3')).toBe('* Punkt 5 * 3');
  });
});
