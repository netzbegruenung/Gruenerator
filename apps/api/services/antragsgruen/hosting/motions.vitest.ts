/** Abschnitte gegen den Antragstyp, wie ihn Antragsgrün 4.18.1 für eine neue Seite liefert (lokal gemessen). */
import { describe, expect, it } from 'vitest';

import { AntragsgruenFormError } from './formClient.js';
import { motionSections } from './motions.js';

const STANDARD = {
  id: 2,
  sections: [
    { id: 4, type: 'Title', title: 'Titel', required: 'yes' },
    { id: 5, type: 'TextSimple', title: 'Antragstext', required: 'yes' },
    { id: 6, type: 'TextSimple', title: 'Begründung', required: 'no' },
  ],
};

describe('motionSections', () => {
  it('fills title, text and reason, converting Markdown to HTML', () => {
    const out = motionSections(STANDARD, {
      title: 'Radwege',
      text: '- **mehr** Radwege',
      reason: 'Klima',
    });
    expect(out.map((s) => s.section_id)).toEqual([4, 5, 6]);
    expect(out[0].data).toBe('Radwege');
    expect(out[1].data).toContain('<strong>mehr</strong>');
    expect(out[2].data).toContain('Klima');
  });

  it('leaves the optional reason out when there is none', () => {
    const out = motionSections(STANDARD, { title: 'Radwege', text: 'Text', reason: null });
    expect(out.map((s) => s.section_id)).toEqual([4, 5]);
  });

  it('refuses a motion type with a required section it cannot fill', () => {
    const type = {
      ...STANDARD,
      sections: [...STANDARD.sections, { id: 7, type: 'Image', title: 'Bild', required: 'yes' }],
    };
    expect(() => motionSections(type, { title: 'T', text: 'x', reason: null })).toThrow(
      AntragsgruenFormError
    );
  });
});
