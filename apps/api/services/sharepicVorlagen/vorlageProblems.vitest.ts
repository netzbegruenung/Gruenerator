import { type SharepicVorlageFileEntry } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { vorlageProblems } from './vorlageProblems.js';

const entry = (over: Partial<SharepicVorlageFileEntry> = {}): SharepicVorlageFileEntry => ({
  id: 'de-zitat',
  titel: 'Zitat',
  beschreibung: 'Ein Zitat.',
  form: 'zitat',
  herkunft: 'alt-template',
  chat: { prompts: ['Erstelle ein Zitat-Sharepic zum Radverkehr'] },
  spec: {
    locale: 'de-DE',
    slides: [
      {
        background: { kind: 'farbe', color: 'tanne' },
        position: 'mitte',
        align: 'links',
        items: [{ type: 'zitat', text: 'Mehr ++Platz++ fürs Rad.', name: 'Vorname Nachname' }],
        logo: true,
      },
    ],
  },
  ...over,
});

describe('vorlageProblems', () => {
  it('passes a consistent entry', () => {
    expect(vorlageProblems(entry())).toEqual([]);
  });

  it('flags a prompt that would get another form', () => {
    expect(vorlageProblems(entry({ chat: { prompts: ['Karussell zum Radverkehr'] } }))).toEqual([
      'prompt names karussell, not zitat: „Karussell zum Radverkehr“',
    ]);
  });

  it('lets an Einzelbild prompt leave the form open', () => {
    expect(
      vorlageProblems(entry({ form: 'einzelbild', chat: { prompts: ['Sharepic zum Radverkehr'] } }))
    ).toEqual([]);
  });

  it('flags a DE marker in an AT spec and a photo we do not host', () => {
    const at = entry();
    at.spec = {
      ...at.spec,
      locale: 'de-AT',
      slides: [
        {
          ...at.spec.slides[0]!,
          background: { kind: 'foto', filename: 'nicht-da.jpg', textSeite: 'unten' },
        },
      ],
    };
    expect(vorlageProblems(at)).toEqual([
      'unknown stock photo nicht-da.jpg',
      '++marker++ in an AT spec',
    ]);
  });
});
