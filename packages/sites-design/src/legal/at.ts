// DRAFT: this text awaits legal sign-off (spec "Offen" point 2).
// `status` flips to 'approved' only with that sign-off.

import { datenschutzDe } from './de.js';
import { type LegalSection, type LegalTemplate } from './types.js';

export const impressumAt: LegalTemplate = {
  status: 'draft',
  title: 'Impressum',
  sections: [
    {
      heading: 'Angaben gemäß § 5 ECG',
      blocks: [{ kind: 'address', lines: 'full' }, { kind: 'contact' }],
    },
    {
      heading: 'Offenlegung gemäß § 25 MedienG',
      blocks: [
        { kind: 'text', text: 'Medieninhaber:' },
        { kind: 'address', lines: 'name-and-city' },
        { kind: 'pending', note: 'Grundlegende Richtung der Website (§ 25 Abs. 4 MedienG).' },
      ],
    },
  ],
};

export const datenschutzAt: LegalTemplate = {
  ...datenschutzDe,
  sections: datenschutzDe.sections.map((section): LegalSection =>
    section.heading === 'Rechte der betroffenen Personen'
      ? {
          ...section,
          blocks: [
            {
              kind: 'pending',
              note: 'Rechte nach Art. 15 bis 21 DSGVO und dem DSG sowie das Beschwerderecht bei der Datenschutzbehörde.',
            },
          ],
        }
      : section
  ),
};
