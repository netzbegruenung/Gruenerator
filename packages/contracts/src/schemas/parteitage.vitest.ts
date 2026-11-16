import { describe, expect, it } from 'vitest';

import {
  conventionManifestSchema,
  conventionStatsPublicSchema,
  parteitageErrorSchema,
  parteitageImportBodySchema,
  parteitageUpdateBodySchema,
} from './parteitage.js';

const file = (name: string) => ({ name, sha256: 'a'.repeat(64), sizeBytes: 1234 });

const stat = { n: 10, median: 92.5, mittel: 92.1, min: 80, max: 99 };

const speech = (first: string, last: string, place: number) => ({
  key: `${place}-${last.toLowerCase()}`,
  day: '2026-11-13',
  dayLabel: 'Freitag',
  listPlace: place,
  seatType: 'frauenplatz',
  firstName: first,
  lastName: last,
  kv: 'Bochum&Wattenscheid',
  area: 'kreisfreie_stadt',
  contested: false,
  elected: true,
  resultPercent: 91.2,
  deliveredBy: null,
  topic: 'klima',
  durationS: 120,
  wordCount: 300,
  transcript: 'Liebe Freundinnen und Freunde, heute geht es um die Zukunft.',
  words: [{ word: 'Liebe', start: 0, end: 0.4 }],
  analysis: {
    anrede: 'Liebe Freundinnen und Freunde',
    schluss: ['Danke'],
    nennungen: { Bundesregierung: 1 },
    signatur: 'zukunft, klima',
    wpm: 140,
    woerter: 300,
    vorgetragen: false,
  },
  files: { reel: file(`${place}.mp4`), poster: file(`${place}.jpg`) },
});

const manifest = () => ({
  version: 1,
  key: 'nrw-lv-2026-essen',
  slugName: 'lv-essen-2026',
  title: 'Landesversammlung Essen 2026',
  shortTitle: 'Essen 2026',
  organizer: 'Grüne NRW',
  audience: 'de-DE',
  startsOn: '2026-11-13',
  endsOn: '2026-11-15',
  location: 'Essen',
  sourceLinks: [{ label: 'Antragsgrün', url: 'https://example.org/a' }],
  report: file('bericht.pdf'),
  statsVersion: 1,
  stats: {
    gesamt: { n: 2, topWoerter: [['zukunft', 5]], anrede: [['Liebe Freundinnen und Freunde', 2]] },
    wahl: {
      formel: 'Ja / (Ja + Nein + Enthaltungen)',
      gesamt: stat,
      platzart: { frauenplatz: stat, offen: stat },
      block: { '1–10': stat },
      thema: { Klima: stat },
      anrede: { 'ohne Anrede': stat },
      korrelation: { platz: 0.27 },
      korrelationP: { platz: 0.015 },
      kampf: [
        {
          platz: 12,
          tag: 'Freitag',
          kandidierende: [
            { name: 'Erika Muster', anteil: 54.5, gewaehlt: true },
            { name: 'Jörg Ölmüller', anteil: 43.3, gewaehlt: false },
          ],
        },
      ],
      extreme: { hoch: [[52, 'Erika Muster', 98.6]], tief: [[85, 'Jörg Ölmüller', 79.6]] },
      raum: { kreisfreie_stadt: stat, kreis: stat },
      raumPlatzMedian: { kreisfreie_stadt: 47, kreis: 56.5 },
    },
    liste: { bloecke: [{ block: '1–10', kreisfreieStadt: 8, kreis: 2, ohne: 0 }] },
    vergleichRaum: [
      {
        art: 'anrede',
        kategorie: 'Liebe Freund*innen',
        a: 4,
        na: 40,
        b: 17,
        nb: 51,
        p: 0.01,
        q: 0.27,
      },
    ],
    signaturRaum: { kreisfreie_stadt: [['bock', 23, 3.87, 2.94]], kreis: [['raum', 20, 3, 1.5]] },
    motto: {
      gesamt: 7,
      sinngemaess: 2,
      reden: [{ platz: 9, name: 'Erika Muster', n: 2, zitat: '…den Weg gemeinsam gehen' }],
    },
    methodik: [{ titel: 'Quelle', text: 'Transkripte.' }],
    grenzen: 'Kleine Fallzahlen.',
  },
  speeches: [speech('Erika', 'Muster', 1), speech('Jörg', 'Ölmüller', 2)],
});

describe('conventionManifestSchema', () => {
  it('accepts a complete manifest', () => {
    const r = conventionManifestSchema.safeParse(manifest());
    expect(r.success).toBe(true);
  });

  it('rejects a speech with a gender field', () => {
    const m = manifest();
    (m.speeches[0] as Record<string, unknown>)['geschlecht'] = 'weiblich';
    const r = conventionManifestSchema.safeParse(m);
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.join('.') === 'speeches.0')).toBe(true);
    }
  });

  it('rejects stats with a gender key', () => {
    const m = manifest();
    (m.stats.wahl as Record<string, unknown>)['geschlecht'] = { weiblich: stat };
    expect(conventionManifestSchema.safeParse(m).success).toBe(false);
  });

  it('rejects a kampf candidate carrying geschlecht', () => {
    const m = manifest();
    (m.stats.wahl.kampf[0]!.kandidierende[0] as Record<string, unknown>)['geschlecht'] = 'weiblich';
    expect(conventionManifestSchema.safeParse(m).success).toBe(false);
  });

  it('rejects a gender key in platzart', () => {
    const m = manifest();
    (m.stats.wahl.platzart as Record<string, unknown>)['weiblich'] = stat;
    expect(conventionManifestSchema.safeParse(m).success).toBe(false);
  });

  it.each(['javascript:alert(1)', 'data:text/html,x', '//evil.example'])(
    'rejects source link url %s',
    (url) => {
      const m = manifest();
      m.sourceLinks = [{ label: 'x', url }];
      expect(conventionManifestSchema.safeParse(m).success).toBe(false);
    }
  );

  it.each(['13.11.2026', '2026-11', 'morgen'])('rejects non-ISO date %s', (d) => {
    const m = manifest();
    m.startsOn = d;
    expect(conventionManifestSchema.safeParse(m).success).toBe(false);
  });

  it('public stats take no person-level blocks', () => {
    const { stats } = manifest();
    expect(conventionStatsPublicSchema.safeParse(stats).success).toBe(false);
    const { kampf: _kampf, extreme: _extreme, ...wahl } = stats.wahl;
    const { reden: _reden, ...motto } = stats.motto;
    expect(conventionStatsPublicSchema.safeParse({ ...stats, wahl, motto }).success).toBe(true);
  });

  it.each(['LDK-NRW', 'a/b', 'ab', '-abc', 'a_b_c'])('rejects convention key %s', (key) => {
    const m = manifest();
    m.key = key;
    expect(conventionManifestSchema.safeParse(m).success).toBe(false);
  });

  it('error schema accepts only known codes', () => {
    const base = { success: false, message: 'x' };
    for (const code of ['INTERNAL', 'RATE_LIMITED', 'MISSING_UPLOADS', 'LOCKED']) {
      expect(parteitageErrorSchema.safeParse({ ...base, code }).success).toBe(true);
    }
    expect(parteitageErrorSchema.safeParse({ ...base, code: 'WHATEVER' }).success).toBe(false);
  });

  it('rejects an empty password but allows null', () => {
    expect(parteitageUpdateBodySchema.safeParse({ password: '' }).success).toBe(false);
    expect(parteitageUpdateBodySchema.safeParse({ password: null }).success).toBe(true);
    expect(
      parteitageImportBodySchema.safeParse({ manifest: manifest(), uploads: {}, password: '' })
        .success
    ).toBe(false);
  });
});
