import { describe, expect, it } from 'vitest';

import { SHAREPIC_FORMS, sharepicAlternativeForm, sharepicAlternativeRequest } from './forms.js';

describe('the chat chip request', () => {
  it.each(SHAREPIC_FORMS.map((f) => f.id))('reads back the pick of %s', (id) => {
    expect(sharepicAlternativeForm(sharepicAlternativeRequest(id))).toBe(id);
    expect(sharepicAlternativeForm(` ${sharepicAlternativeRequest(id)}\n`)).toBe(id);
  });

  it('keeps the text the chip has always sent', () => {
    expect(sharepicAlternativeRequest('karussell')).toBe('Andere Variante als Karussell');
    expect(sharepicAlternativeRequest('zahl')).toBe('Andere Variante als Große Zahl');
  });

  it.each([
    'Andere Variante als Karussell, aber kürzer',
    'andere variante als karussell',
    'Mach eine andere Variante als Karussell',
    'Andere Variante als Termin',
    'Insta-Karussell: bei allen Terminen',
    '',
  ])('takes nothing typed for a pick: %s', (text) => {
    expect(sharepicAlternativeForm(text)).toBeNull();
  });
});
