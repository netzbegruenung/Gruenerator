import { describe, expect, it } from 'vitest';

import {
  sharepicBerichtEintragSchema,
  sharepicChatPropsSchema,
  sharepicDraftResponseSchema,
} from './sharepicCreator.js';

const spec = {
  locale: 'de-DE',
  slides: [
    {
      background: { kind: 'farbe', color: 'tanne' },
      position: 'mitte',
      align: 'links',
      logo: true,
      items: [{ type: 'headline', lines: ['Mehr Busse', 'für alle'] }],
    },
  ],
};

const EINTRAEGE = [
  { art: 'form', form: 'veranstaltung', von: 'creator', statt: 'diagramm' },
  { art: 'fehlt', fakt: 'termin' },
  { art: 'repariert', feld: 'datum.date', wert: '14.11.' },
  { art: 'foto', id: 'upload:1', status: 'ungeschnitten', grund: 'nicht freistellbar' },
  { art: 'gestaltung', text: 'Die Szene ließ sich nicht malen.' },
];

describe('the sharepic Bericht', () => {
  it('parses one entry of every art', () => {
    for (const eintrag of EINTRAEGE) {
      expect(sharepicBerichtEintragSchema.safeParse(eintrag).success).toBe(true);
    }
  });

  it('rejects a photo that is no upload id', () => {
    expect(
      sharepicBerichtEintragSchema.safeParse({ art: 'foto', id: 'stock.jpg', status: 'verwendet' })
        .success
    ).toBe(false);
  });

  it('is optional on chat props and draft response', () => {
    expect(sharepicChatPropsSchema.safeParse({ creatorSpec: spec, attributions: [] }).success).toBe(
      true
    );
    expect(
      sharepicChatPropsSchema.safeParse({
        creatorSpec: spec,
        attributions: [],
        bericht: EINTRAEGE,
      }).success
    ).toBe(true);
    expect(
      sharepicDraftResponseSchema.safeParse({
        spec,
        chapters: [],
        attributions: [],
        bericht: EINTRAEGE,
      }).success
    ).toBe(true);
  });
});

describe('sharepicChatPropsSchema photos', () => {
  const url = '/api/share/abcdefghijklmnop1234/download';
  it('accepts id and library url, optional', () => {
    const base = { creatorSpec: spec, attributions: [] };
    expect(
      sharepicChatPropsSchema.safeParse({ ...base, photos: [{ id: 'upload:1', url }] }).success
    ).toBe(true);
    expect(
      sharepicChatPropsSchema.safeParse({ ...base, photos: [{ id: 'foto', url }] }).success
    ).toBe(false);
    expect(
      sharepicChatPropsSchema.safeParse({
        ...base,
        photos: [{ id: 'upload:1', url: 'https://x/y' }],
      }).success
    ).toBe(false);
  });
});
