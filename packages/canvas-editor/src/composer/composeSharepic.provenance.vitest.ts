import { type SharepicSlide, type SharepicSpec } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { composeSharepic, type ComposedSlide } from './composeSharepic';
import { invertLiftedText } from './sharepicProvenance';

import { type SharepicProvenance } from './index';

/** Monospace stand-in: half the font size per character. */
const measure = (text: string, fontSize: number) => text.length * fontSize * 0.5;
const options = { photoSrc: (f: string) => `/api/image-picker/stock-image/${f}`, measure };

const REF = (n: number) => `ki:scene-ref-000000000${n}`;
const farbe = (
  color: 'tanne' | 'weiss' | 'hellgrau' | 'dunkelgruen',
  items: SharepicSlide['items']
) =>
  ({
    background: { kind: 'farbe', color },
    position: 'mitte',
    align: 'links',
    items,
    logo: false,
  }) satisfies SharepicSlide;

const deCarousel: SharepicSpec = {
  locale: 'de-DE',
  seitenzahl: 'bruch',
  slides: [
    {
      background: { kind: 'foto', filename: 'wind.jpg', textSeite: 'unten' },
      position: 'unten',
      align: 'links',
      items: [
        { type: 'dachzeile', text: 'Klimaschutz vor Ort' },
        { type: 'headline', lines: ['Mach mit', 'bei uns!'], akzent: 1 },
        { type: 'text', text: 'Gemeinsam für **Klimaschutz** vor Ort.' },
        { type: 'button', text: 'Jetzt Mitglied werden' },
      ],
      stoerer: { text: 'Neu dabei!' },
      logo: true,
      quelle: 'Umweltbundesamt 2025',
      weiter: 'Denn',
    },
    farbe('tanne', [
      { type: 'headline', lines: ['Drei Gründe', 'für Wind', 'und Sonne'] },
      { type: 'liste', items: ['Saubere Luft', 'Günstiger **Strom**', 'Jobs vor Ort'] },
    ]),
    farbe('weiss', [
      { type: 'liste', stil: 'ziffern', items: ['Erstens', 'Zweitens'] },
      {
        type: 'diagramm',
        art: 'kreis',
        titel: 'Strommix',
        einheit: '%',
        werte: [{ name: 'Wind', wert: 40 }],
      },
    ]),
    farbe('tanne', [
      {
        type: 'iconliste',
        zeilen: [
          { icon: 'klima', text: 'Klima schützen' },
          { icon: 'euro', text: 'Geld sparen' },
        ],
      },
      { type: 'zahl', stil: 'stapel', wert: '40 %', label: 'mehr Wind' },
    ]),
    farbe('hellgrau', [
      {
        type: 'vergleich',
        links: { titel: 'Die anderen', punkte: ['Kohle', 'Stillstand'] },
        rechts: { titel: 'Wir', punkte: ['Wind', 'Fortschritt'] },
      },
    ]),
    farbe('tanne', [
      { type: 'faktencheck', paare: [{ mythos: 'Wind ist teuer', fakt: 'Wind ist günstig' }] },
    ]),
    farbe('tanne', [
      {
        type: 'rechnung',
        glieder: [
          { wert: '63 €', label: 'Ticket' },
          { op: '−', wert: '5 €', label: 'Rabatt' },
        ],
        ergebnis: { wert: '58 €', label: 'bleibt' },
      },
      { type: 'zahl', stil: 'countdown', wert: '10', label: 'Tage' },
    ]),
    farbe('tanne', [
      {
        type: 'schlagzeile',
        stil: 'ausriss',
        medium: 'SZ',
        titel: 'Wind boomt',
        datum: '3.4.2026',
      },
      { type: 'schlagzeile', stil: 'karte', medium: 'FAZ', titel: 'Sonne auch' },
    ]),
    farbe('tanne', [{ type: 'bingo', felder: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'] }]),
    farbe('tanne', [
      {
        type: 'termine',
        eintraege: [
          { datum: '3.4.', titel: 'Infostand', ort: 'Marktplatz' },
          { datum: '5.4.', titel: 'Demo' },
        ],
      },
    ]),
    farbe('tanne', [
      { type: 'zitat', text: 'Wir machen das.', name: 'Anna', quelle: 'im SZ-Interview' },
      { type: 'zitat', text: 'Geht nicht.', name: 'Bernd', seite: 'gegner' },
    ]),
    farbe('tanne', [
      { type: 'frage', von: 'SZ', text: 'Warum Wind?' },
      { type: 'frage', text: 'Und Sonne?' },
      { type: 'absatz', text: 'Weil es **günstig** ist.', betont: true },
    ]),
    {
      ...farbe('tanne', [
        {
          type: 'aufruf',
          stil: 'petition',
          text: 'Unterschreib jetzt!',
          adressat: 'An den Landtag',
          hinweis: 'gruene.de/petition',
        },
      ]),
      nummer: 'gross',
    },
    {
      ...farbe('tanne', [{ type: 'aufruf', stil: 'ausruf', text: 'Wählen gehen' }]),
      nummer: 'geist',
      ort: { lines: ['Marktplatz', 'Musterstadt'] },
      datum: { weekday: 'SA', date: '3.4.', time: '10 Uhr' },
      quelle: 'Quelle: schon dabei',
    },
  ],
};

const infografik: SharepicSpec = {
  locale: 'de-DE',
  seitenzahl: 'punkte',
  slides: (['raster', 'ablauf', 'zahl', 'anteil', 'mengen'] as const).map((form) =>
    farbe('weiss', [
      {
        type: 'infografik',
        form,
        punkte:
          form === 'zahl'
            ? [{ titel: '300 Becher', text: 'pro Tag', icon: 'essen', bild: REF(1) }]
            : [
                {
                  titel: 'Rad',
                  text: 'Kurze Wege.',
                  icon: 'fahrrad',
                  bild: REF(2),
                  wert: 3,
                  von: 10,
                },
                { titel: 'Bus', icon: 'bus', wert: 9, von: 10 },
              ],
      },
    ])
  ),
};

const deBoxed: SharepicSpec = {
  locale: 'de-DE',
  slides: [
    {
      background: { kind: 'foto', filename: 'demo.jpg', textSeite: 'unten' },
      position: 'mitte',
      align: 'links',
      zeilenboxen: true,
      items: [
        { type: 'headline', lines: ['Wir sind', '==viele=='], akzent: 1 },
        { type: 'absatz', text: 'Und wir werden mehr, jeden Tag ein bisschen.' },
        { type: 'text', text: 'Komm vorbei.' },
      ],
      logo: false,
    },
  ],
};

const deStrips: SharepicSpec = {
  locale: 'de-DE',
  slides: [
    {
      background: { kind: 'foto-oben', filename: 'a.jpg', panelColor: 'tanne' },
      position: 'mitte',
      align: 'links',
      items: [{ type: 'headline', lines: ['Infostand'] }],
      datum: { date: '3.4.' },
      ort: { lines: ['Marktplatz'] },
      logo: true,
    },
    {
      background: { kind: 'foto-unten', filename: 'b.jpg', panelColor: 'weiss' },
      position: 'oben',
      align: 'zentriert',
      items: [{ type: 'text', text: 'Bis dann!' }],
      logo: false,
    },
  ],
};

/** A headline alone on a colour: the cover grows by splitting its lines. */
const cover: SharepicSpec = {
  locale: 'de-DE',
  slides: [
    farbe('tanne', [
      { type: 'dachzeile', text: 'Neu' },
      { type: 'headline', lines: ['Klimaschutz ist Heimatschutz für alle'] },
    ]),
  ],
};

const at: SharepicSpec = {
  locale: 'de-AT',
  slides: [
    {
      background: { kind: 'foto', filename: 'wind.jpg', textSeite: 'unten' },
      position: 'unten',
      align: 'links',
      items: [{ type: 'zitat', text: 'Wir schaffen das.', name: 'Leonore' }],
      logo: false,
    },
    farbe('dunkelgruen', [
      { type: 'headline', lines: ['Mehr ++Grün++', 'für alle'], akzent: 1 },
      { type: 'liste', items: ['Bahn', 'Rad'] },
      { type: 'absatz', text: 'Ganz ++klar++.' },
    ]),
    farbe('dunkelgruen', [
      { type: 'aufruf', stil: 'petition', text: 'Jetzt unterschreiben', hinweis: 'gruene.at' },
    ]),
  ],
};

const SPECS = { deCarousel, infografik, deBoxed, deStrips, cover, at };

/** Every id a composed slide carries, in any collection. */
const emittedIds = (slide: ComposedSlide) =>
  new Set([
    ...slide.additionalTexts.map((t) => t.id),
    ...slide.pillBadgeInstances.map((p) => p.id),
    ...slide.circleBadgeInstances.map((c) => c.id),
    ...slide.shapeInstances.map((s) => s.id),
    ...slide.assetInstances.map((a) => a.id),
    ...slide.chartInstances.map((c) => c.id),
    ...slide.userImageInstances.map((u) => u.id),
    ...slide.selectedIcons,
    ...Object.keys(slide.iconStates),
    ...slide.layerOrder,
  ]);

const textOf = (slide: ComposedSlide, id: string) =>
  slide.additionalTexts.find((t) => t.id === id)?.text ??
  slide.pillBadgeInstances.find((p) => p.id === id)?.text ??
  null;

const fieldValue = (source: unknown, field: string): unknown =>
  field.split('.').reduce<unknown>((value, key) => {
    if (value === null || typeof value !== 'object') return null;
    return (value as Record<string, unknown>)[key] ?? null;
  }, source);

const provenanceOf = (spec: SharepicSpec) => {
  const composed = composeSharepic(spec, { ...options, provenance: true });
  return { composed, provenance: composed.provenance ?? [] };
};

describe('composeSharepic provenance', () => {
  it.each(Object.entries(SPECS))('gives every emitted id of %s an entry', (_name, spec) => {
    const { composed, provenance } = provenanceOf(spec);
    expect(provenance).toHaveLength(composed.slides.length);
    composed.slides.forEach((slide, s) => {
      const ids = emittedIds(slide);
      expect(new Set(Object.keys(provenance[s]!))).toEqual(ids);
      for (const [id, prov] of Object.entries(provenance[s]!)) {
        if (prov.kind !== 'item') continue;
        const item = spec.slides[s]!.items[prov.item!]!;
        expect(
          id.startsWith(`sc-${prov.item}-${item.type}`) || id.startsWith(`chart-sc-${prov.item}-`)
        ).toBe(true);
      }
    });
  });

  it.each(Object.entries(SPECS))(
    'inverts every liftable text of %s back to its spec field exactly',
    (_name, spec) => {
      const { composed, provenance } = provenanceOf(spec);
      composed.slides.forEach((slide, s) => {
        for (const [id, prov] of Object.entries(provenance[s]!)) {
          if (prov.lift === 'opaque') continue;
          const text = textOf(slide, id);
          expect(text, id).not.toBeNull();
          expect(prov.field, id).toBeTruthy();
          const source = prov.kind === 'item' ? spec.slides[s]!.items[prov.item!] : spec.slides[s];
          expect(invertLiftedText(prov.lift, text!), id).toEqual(fieldValue(source, prov.field!));
        }
      });
    }
  );

  it('lifts what is reversible and keeps every rewrite it cannot undo opaque', () => {
    const lifts = (spec: SharepicSpec, s: number): Record<string, SharepicProvenance> =>
      provenanceOf(spec).provenance[s]!;
    const first = lifts(deCarousel, 0);
    expect(first['sc-0-dachzeile']).toEqual({
      kind: 'item',
      item: 0,
      field: 'text',
      lift: 'verbatim',
    });
    expect(first['sc-1-headline-0']).toEqual({
      kind: 'item',
      item: 1,
      field: 'lines.0',
      lift: 'verbatim',
    });
    expect(first['sc-1-headline-1-box']).toMatchObject({ kind: 'item', item: 1, lift: 'opaque' });
    expect(first['sc-quelle']).toEqual({ kind: 'chrome', field: 'quelle', lift: 'prefix' });
    expect(first['sc-weiter']).toEqual({ kind: 'chrome', field: 'weiter', lift: 'verbatim' });
    expect(first['sc-scrim']).toEqual({ kind: 'plane', lift: 'opaque' });
    expect(first['sc-stoerer']).toMatchObject({ kind: 'chrome', lift: 'opaque' });
    expect(first['sc-ki-label']).toEqual({ kind: 'chrome', lift: 'opaque' });
    // Three plain lines share one text element: no single field to write back to.
    expect(lifts(deCarousel, 1)['sc-0-headline-0']?.lift).toBe('opaque');
    expect(lifts(deCarousel, 1)['sc-1-liste']).toEqual({
      kind: 'item',
      item: 1,
      field: 'items',
      lift: 'bullets',
    });
    expect(lifts(deCarousel, 2)['sc-0-liste-1']).toMatchObject({
      field: 'items.1',
      lift: 'verbatim',
    });
    expect(lifts(deCarousel, 2)['chart-sc-1-diagramm']).toMatchObject({
      kind: 'item',
      lift: 'opaque',
    });
    // The medium credit and the role join the name; the medium's prefix joins the question.
    expect(lifts(deCarousel, 10)['sc-0-zitat-name']?.lift).toBe('opaque');
    expect(lifts(deCarousel, 11)['sc-0-frage']?.lift).toBe('opaque');
    expect(lifts(deCarousel, 11)['sc-1-frage']?.lift).toBe('verbatim');
    // Date appended to the medium.
    expect(lifts(deCarousel, 7)['sc-0-schlagzeile-medium']?.lift).toBe('opaque');
    expect(lifts(deCarousel, 7)['sc-1-schlagzeile-medium']?.lift).toBe('verbatim');
    // A source that already says "Quelle:" would not come back as written.
    expect(lifts(deCarousel, 13)['sc-quelle']?.lift).toBe('opaque');
    expect(lifts(deCarousel, 13)['sc-ort']?.lift).toBe('opaque');
    expect(lifts(deCarousel, 12)['sc-nummer']).toEqual({ kind: 'chrome', lift: 'opaque' });
    // Boxed lines are rewrapped; boxed headline lines lose their marks.
    const boxed = lifts(deBoxed, 0);
    expect(boxed['sc-0-headline-0']?.lift).toBe('verbatim');
    expect(boxed['sc-0-headline-1']?.lift).toBe('opaque');
    expect(boxed['sc-1-absatz-0']?.lift).toBe('opaque');
    // The cover split its line: none of its pieces is a spec line any more.
    expect(
      Object.entries(lifts(cover, 0)).filter(
        ([id, p]) => id.includes('headline') && p.lift !== 'opaque'
      )
    ).toEqual([]);
    // AT reads ++marker++ as ==accent==: changed text, not liftable.
    const atSlide = lifts(at, 1);
    expect(atSlide['sc-0-headline-0']?.lift).toBe('opaque');
    expect(atSlide['sc-0-headline-1']?.lift).toBe('verbatim');
    expect(atSlide['sc-1-liste']?.lift).toBe('bullets');
    expect(atSlide['sc-2-absatz']?.lift).toBe('opaque');
    expect(lifts(at, 0)['sc-0-zitat-name']?.lift).toBe('verbatim');
  });

  it('changes nothing without the flag', () => {
    for (const spec of Object.values(SPECS)) {
      const plain = composeSharepic(spec, options);
      expect('provenance' in plain).toBe(false);
      const { provenance: _provenance, ...rest } = composeSharepic(spec, {
        ...options,
        provenance: true,
      });
      expect(rest).toEqual(plain);
    }
  });

  it('inverts the reversible rewrites strictly', () => {
    expect(invertLiftedText('verbatim', 'a **b**')).toBe('a **b**');
    expect(invertLiftedText('bullets', '• a\n• b')).toEqual(['a', 'b']);
    expect(invertLiftedText('bullets', '• a\nb')).toBeNull();
    expect(invertLiftedText('prefix', 'Quelle: UBA')).toBe('UBA');
    expect(invertLiftedText('prefix', 'UBA')).toBeNull();
    expect(invertLiftedText('opaque', 'x')).toBeNull();
  });
});
