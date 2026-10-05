import { describe, expect, it } from 'vitest';

import { validateDraft } from './draftAgent.js';

const withText = (text: string) => ({
  slides: [
    {
      background: { kind: 'farbe', color: 'tanne' },
      position: 'oben',
      align: 'links',
      items: [
        { type: 'headline', lines: ['Jetzt', 'handeln!'] },
        { type: 'text', text },
      ],
      logo: true,
    },
  ],
});

describe('numbers in a draft', () => {
  it('takes a formula like CO2 for a word, not for the number 2', () => {
    const result = validateDraft(
      withText('Wirksame CO2-Bepreisung'),
      'de-DE',
      'Kundgebung für Klimaschutz'
    );
    expect(result.ok).toBe(true);
  });

  it('still rejects a number the brief does not give', () => {
    const result = validateDraft(withText('Schon 300 Menschen dabei'), 'de-DE', 'Kundgebung');
    expect(!result.ok && result.error).toMatch(/nennt 300/);
  });
});
