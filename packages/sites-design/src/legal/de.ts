// DRAFT: this text awaits legal sign-off (spec "Offen" point 2).
// `status` flips to 'approved' only with that sign-off.

import { type LegalTemplate } from './types.js';

export const impressumDe: LegalTemplate = {
  status: 'draft',
  title: 'Impressum',
  sections: [
    {
      heading: 'Angaben gemäß § 5 DDG',
      blocks: [{ kind: 'address', lines: 'full' }, { kind: 'contact' }],
    },
    {
      heading: 'Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV',
      blocks: [{ kind: 'address', lines: 'full' }],
    },
    {
      heading: 'Hinweis',
      blocks: [
        {
          kind: 'pending',
          note: 'Ob weitere Angaben nötig sind, etwa Funktion, Mandat oder das Verhältnis zur Partei.',
        },
      ],
    },
  ],
};

export const datenschutzDe: LegalTemplate = {
  status: 'draft',
  title: 'Datenschutzerklärung',
  sections: [
    {
      heading: 'Verantwortliche Stelle',
      blocks: [{ kind: 'address', lines: 'full' }, { kind: 'contact' }],
    },
    {
      heading: 'Hosting und Server-Protokolle',
      blocks: [
        {
          kind: 'pending',
          note: 'Betreiber, Speicherort und Speicherdauer der Server-Protokolle.',
        },
      ],
    },
    {
      heading: 'Schriften und Bilder',
      blocks: [
        {
          kind: 'pending',
          note: 'Woher Schriften und Bilder geladen werden und ob dabei Daten übertragen werden.',
        },
      ],
    },
    {
      heading: 'Eingebettete Inhalte von Instagram',
      blocks: [
        {
          kind: 'text',
          text: 'Inhalte von Instagram werden erst nach einem Klick auf „Instagram-Inhalte laden" geladen. Vorher besteht keine Verbindung zu Instagram. Wer „Meine Auswahl für diesen Browser merken" wählt, dessen Entscheidung speichert der Browser lokal.',
        },
        {
          kind: 'pending',
          note: 'Rechtsgrundlage und Angaben zur Verarbeitung durch Meta Platforms Ireland Ltd.',
        },
      ],
    },
    {
      heading: 'Rechte der betroffenen Personen',
      blocks: [
        {
          kind: 'pending',
          note: 'Rechte nach Art. 15 bis 21 DSGVO und das Beschwerderecht bei einer Aufsichtsbehörde.',
        },
      ],
    },
  ],
};
