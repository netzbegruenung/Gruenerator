import { describe, expect, it } from 'vitest';

import { datenschutzAt, impressumAt } from './at.js';
import { datenschutzDe, impressumDe } from './de.js';
import { legalTemplate } from './index.js';

const ALL = [impressumDe, datenschutzDe, impressumAt, datenschutzAt];

describe('legal templates', () => {
  it('every template is still a draft', () =>
    expect(ALL.map((t) => t.status)).toEqual(['draft', 'draft', 'draft', 'draft']));
  it('the German Impressum names § 5 DDG and § 18 Abs. 2 MStV', () =>
    expect(impressumDe.sections.map((s) => s.heading)).toEqual([
      'Angaben gemäß § 5 DDG',
      'Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV',
      'Hinweis',
    ]));
  it('the Austrian Impressum names § 5 ECG and § 25 MedienG', () =>
    expect(impressumAt.sections.map((s) => s.heading)).toEqual([
      'Angaben gemäß § 5 ECG',
      'Offenlegung gemäß § 25 MedienG',
    ]));
  it('picks the template by locale and document', () => {
    expect(legalTemplate('de-AT', 'impressum')).toBe(impressumAt);
    expect(legalTemplate('de-DE', 'datenschutz')).toBe(datenschutzDe);
  });
  it('every template starts with the address of the person responsible', () =>
    ALL.forEach((t) =>
      expect(t.sections[0]?.blocks[0]).toEqual({ kind: 'address', lines: 'full' })
    ));
  it('no template mentions a German law in Austria or an Austrian one in Germany', () => {
    expect(JSON.stringify([impressumAt, datenschutzAt])).not.toMatch(/DDG|MStV/);
    expect(JSON.stringify([impressumDe, datenschutzDe])).not.toMatch(/ECG|MedienG|DSG\b/);
  });
});
