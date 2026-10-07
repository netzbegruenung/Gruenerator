/** Specs covering every item type, both locales and the special layouts; shared by composer tests. */
import { type SharepicSlide, type SharepicSpec } from '@gruenerator/contracts';

/** Monospace stand-in: half the font size per character. */
export const measure = (text: string, fontSize: number) => text.length * fontSize * 0.5;
export const options = { photoSrc: (f: string) => `/api/image-picker/stock-image/${f}`, measure };

const REF = (n: number) => `ki:scene-ref-000000000${n}`;
export const farbe = (
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

export const deCarousel: SharepicSpec = {
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

export const infografik: SharepicSpec = {
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

export const deBoxed: SharepicSpec = {
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

export const deStrips: SharepicSpec = {
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
export const cover: SharepicSpec = {
  locale: 'de-DE',
  slides: [
    farbe('tanne', [
      { type: 'dachzeile', text: 'Neu' },
      { type: 'headline', lines: ['Klimaschutz ist Heimatschutz für alle'] },
    ]),
  ],
};

export const at: SharepicSpec = {
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

export const SPECS = { deCarousel, infografik, deBoxed, deStrips, cover, at };
