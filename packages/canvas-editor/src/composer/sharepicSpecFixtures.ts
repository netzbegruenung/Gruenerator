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

const plain = (extra: Partial<SharepicSlide>): SharepicSlide => ({
  background: { kind: 'farbe', color: 'weiss' },
  position: 'unten',
  align: 'links',
  logo: true,
  items: [
    { type: 'headline', lines: ['Mach mit', 'bei uns!'], akzent: 1 },
    { type: 'text', text: 'Gemeinsam für Klimaschutz vor Ort.' },
  ],
  ...extra,
});

/** composeSharepic.vitest: one photo slide with stoerer and button. */
export const foto: SharepicSpec = {
  locale: 'de-DE',
  slides: [
    {
      background: { kind: 'foto', filename: 'wind.jpg', textSeite: 'unten' },
      position: 'unten',
      align: 'links',
      items: [
        { type: 'headline', lines: ['Mach mit', 'bei uns!'], akzent: 1 },
        { type: 'text', text: 'Gemeinsam für **Klimaschutz** vor Ort.' },
        { type: 'button', text: 'Jetzt Mitglied werden' },
      ],
      stoerer: { text: 'Neu dabei!' },
      logo: true,
    },
  ],
};

/** composeSharepic.format: every footer and panel path, on the tall format. */
const formatSlides = (color: 'tanne' | 'dunkelgruen'): SharepicSlide[] => [
  plain({ background: { kind: 'foto', filename: 'wind.jpg', textSeite: 'unten' } }),
  plain({ background: { kind: 'foto-oben', filename: 'wind.jpg', panelColor: color } }),
  plain({
    background: { kind: 'foto-unten', filename: 'wind.jpg', panelColor: color },
    position: 'oben',
  }),
  plain({
    background: { kind: 'farbe', color },
    align: 'zentriert',
    datum: { weekday: 'Di', date: '18.11.', time: '19 Uhr' },
    ort: { lines: ['Gasthaus Zur Post', 'Landstraße 12'] },
  }),
  plain({
    background: { kind: 'farbe', color },
    items: [
      { type: 'headline', lines: ['Mieten steigen'] },
      {
        type: 'diagramm',
        art: 'balken',
        werte: [
          { name: '2015', wert: 100 },
          { name: '2025', wert: 138 },
        ],
      },
    ],
    quelle: 'Stadt Musterstadt',
  }),
];
export const formatDe: SharepicSpec = {
  locale: 'de-DE',
  format: 'post-portrait-tall',
  slides: formatSlides('tanne'),
};
export const formatAt: SharepicSpec = {
  locale: 'de-AT',
  format: 'post-portrait-tall',
  slides: formatSlides('dunkelgruen'),
};

/** composeSharepic.upload: an own photo on every photo background. */
export const upload: SharepicSpec = {
  locale: 'de-DE',
  slides: [
    plain({ background: { kind: 'foto', filename: 'upload:1', textSeite: 'unten' } }),
    plain({ background: { kind: 'foto-oben', filename: 'upload:1', panelColor: 'tanne' } }),
    plain({ background: { kind: 'foto-unten', filename: 'upload:1', panelColor: 'tanne' } }),
  ],
};
export const uploadAt: SharepicSpec = {
  locale: 'de-AT',
  slides: [
    plain({ background: { kind: 'foto-oben', filename: 'upload:1', panelColor: 'dunkelgruen' } }),
  ],
};

/** composeSharepic.rahmen: teaser beside the arrow, page dots, a carousel without arrows. */
const absatzSlide = (extra: Partial<SharepicSlide> = {}): SharepicSlide => ({
  background: { kind: 'farbe', color: 'dunkeltanne' },
  position: 'mitte',
  align: 'links',
  items: [{ type: 'absatz', text: 'Ein Satz, der etwas erklärt.' }],
  logo: false,
  ...extra,
});
export const rahmen: SharepicSpec = {
  locale: 'de-DE',
  seitenzahl: 'punkte',
  slides: [
    absatzSlide({ weiter: 'Wie stoppen wir das? Die Antwort →' }),
    absatzSlide(),
    absatzSlide(),
  ],
};
export const rahmenAt: SharepicSpec = {
  locale: 'de-AT',
  pfeil: false,
  slides: [absatzSlide(), absatzSlide()],
};

/** composeSharepic.belege / .listeZahl: one item per slide. */
const single = (item: SharepicSlide['items'][number]): SharepicSlide =>
  absatzSlide({ items: [item] });
const schlagzeile = {
  type: 'schlagzeile' as const,
  medium: 'tagesschau.de',
  titel: 'Erneuerbare decken erstmals mehr als 60 Prozent des Stroms',
  datum: '2.10.2026',
};
export const belege: SharepicSpec = {
  locale: 'de-DE',
  slides: [
    single({ ...schlagzeile, stil: 'karte' }),
    single({ ...schlagzeile, stil: 'ausriss' }),
    single({ type: 'bingo', felder: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'] }),
  ],
};
export const listeZahl: SharepicSpec = {
  locale: 'de-AT',
  slides: [
    absatzSlide({ items: [{ type: 'headline', lines: ['3 Gründe'] }] }),
    single({ type: 'liste', items: ['Mehr Busse', 'Mehr Bahn'] }),
    single({ type: 'liste', stil: 'haken', items: ['Mehr Busse', 'Mehr Bahn'] }),
    absatzSlide({ nummer: 'gross' }),
    absatzSlide({ nummer: 'geist' }),
    single({ type: 'zahl', stil: 'stapel', wert: '6,3 Mrd. €', label: 'kostet die Hitze' }),
    single({ type: 'zahl', stil: 'riesenwort', wert: '−40°' }),
    single({ type: 'zahl', stil: 'countdown', wert: '3', label: 'Tage bis zur Wahl' }),
  ],
};

/** composeSharepic.infografik: a headline over painted points (userImageInstances). */
export const infografikTipps: SharepicSpec = {
  locale: 'de-DE',
  slides: [
    {
      background: { kind: 'farbe', color: 'hellgrau' },
      position: 'oben',
      align: 'zentriert',
      items: [
        { type: 'headline', lines: ['Nachhaltiger', 'leben'] },
        {
          type: 'infografik',
          form: 'raster',
          punkte: [
            { titel: 'Nimm das Rad', text: 'Kurze Wege.', icon: 'fahrrad', bild: REF(1) },
            { titel: 'Eigener Becher', text: 'Spart Becher.', icon: 'essen', bild: REF(2) },
            { titel: 'Kleider tauschen', icon: 'einkauf', bild: REF(3) },
            { titel: 'Jutebeutel', icon: 'einkauf', bild: REF(4) },
          ],
        },
      ],
      logo: false,
    },
  ],
};

/** composeSharepicMarker: ++marker++ on a quote and on a headline number. */
const QUOTE: SharepicSlide['items'] = [
  {
    type: 'zitat',
    text: 'Wir bauen ++Wohnungen für alle++ und lassen niemanden zurück.',
    name: 'A B',
  },
];
export const marker: SharepicSpec = {
  locale: 'de-DE',
  slides: [
    farbe('tanne', QUOTE),
    {
      ...farbe('tanne', QUOTE),
      background: { kind: 'foto', filename: 'wind.jpg', textSeite: 'unten' },
    },
    farbe('weiss', [{ type: 'headline', lines: ['Reiche vernichten', '++186.600++ Jobs'] }]),
  ],
};
export const markerAt: SharepicSpec = {
  locale: 'de-AT',
  slides: [farbe('dunkelgruen', QUOTE)],
};

/** sharepicTweaks: "3 Gründe" — cover, intro, three points, the call. */
const mint = (
  items: SharepicSlide['items'],
  extra: Partial<SharepicSlide> = {}
): SharepicSlide => ({
  background: { kind: 'farbe', color: 'mint' },
  position: 'oben',
  align: 'links',
  items,
  logo: false,
  ...extra,
});
const grund = (n: number) =>
  mint([
    { type: 'headline', lines: [`Grund ${n}`] },
    { type: 'absatz', text: 'Weil es stimmt.' },
  ]);
export const gruende: SharepicSpec = {
  locale: 'de-DE',
  slides: [
    mint([{ type: 'headline', lines: ['Mehr Radwege'] }], {
      background: { kind: 'farbe', color: 'dunkeltanne' },
    }),
    mint(
      [
        { type: 'dachzeile', text: 'Warum?' },
        { type: 'absatz', text: 'Drei Gründe.' },
      ],
      { weiter: 'Denn' }
    ),
    grund(1),
    grund(2),
    grund(3),
    mint([{ type: 'aufruf', stil: 'ausruf', text: 'Unterschreibt!', hinweis: 'Link in der Bio' }], {
      background: { kind: 'farbe', color: 'grasgruen' },
    }),
  ],
};

/** composeSharepic.emoji: a headline over a list with an emoji before each point. */
const EMOJI_LISTE: SharepicSlide['items'] = [
  { type: 'headline', lines: ['Mach mit!'], akzent: 0 },
  {
    type: 'liste',
    stil: 'emoji',
    items: [
      'Geh **wählen**, denn jede Stimme zählt',
      'Bleib **informiert** und lies nach',
      'Komm zur **Demo** in deiner Stadt',
      'Sag es **weiter**',
    ],
    zeichen: ['🗳️', '📰', '🪧', '📣'],
  },
];
export const emojiListe: SharepicSpec = {
  locale: 'de-DE',
  slides: [{ ...farbe('tanne', EMOJI_LISTE), position: 'oben' }],
};
export const emojiListeAt: SharepicSpec = {
  locale: 'de-AT',
  slides: [{ ...farbe('dunkelgruen', EMOJI_LISTE), position: 'oben', align: 'zentriert' }],
};

<<<<<<< HEAD
/** composeSharepic.handMarks: ((circle)) and __underline__ on headline and paragraph, both locales. */
export const handMarks: SharepicSpec = {
  locale: 'de-AT',
  slides: [
    {
      ...farbe('dunkelgruen', [
        { type: 'headline', lines: ['Die ((Lösung?))'] },
        { type: 'absatz', text: 'Für den __Abschluss__ empfehlen wir:' },
      ]),
      align: 'zentriert',
    },
    {
      background: { kind: 'foto', filename: 'wind.jpg', textSeite: 'unten' },
      position: 'unten',
      align: 'links',
      logo: false,
      items: [
        {
          type: 'headline',
          lines: ['((5 Fakten,))', 'die wir nach', 'diesem Sommer', 'ins __Schwitzen__'],
          akzent: 2,
        },
      ],
    },
  ],
};
export const handMarksDe: SharepicSpec = {
  locale: 'de-DE',
  slides: [
    farbe('tanne', [
      { type: 'headline', lines: ['Unsere ((Nutzpflanzen))', 'unter Stress'] },
      { type: 'absatz', text: '__Herbert sagt:__ das stimmt nicht.' },
    ]),
    farbe('weiss', [{ type: 'text', text: 'Achte dazwischen auf ((Pausen)).' }]),
=======
/** A photo in the slide: one slide per ausschnitt, on the colours the posts set them on. */
const bildSlide = (
  color: 'tanne' | 'weiss' | 'dunkelgruen' | 'hellgrau',
  bild: Omit<Extract<SharepicSlide['items'][number], { type: 'bild' }>, 'type' | 'quelle'>,
  position: SharepicSlide['position'] = 'oben'
): SharepicSlide => ({
  ...farbe(color, [
    { type: 'headline', lines: ['Der Rechtsruck', 'macht dir', '==Sorgen?=='] },
    { type: 'text', text: 'Das kannst du tun.' },
    { type: 'bild', quelle: 'wind.jpg', ...bild },
  ]),
  position,
});
export const bild: SharepicSpec = {
  locale: 'de-DE',
  slides: [
    bildSlide('tanne', { ausschnitt: 'streifen-unten', filter: 'gruen' }),
    bildSlide('weiss', { ausschnitt: 'streifen-oben', filter: 'grau' }, 'unten'),
    bildSlide('hellgrau', { ausschnitt: 'karte', filter: 'original' }),
    bildSlide('tanne', { ausschnitt: 'kreis', filter: 'gruen' }),
    bildSlide('tanne', { ausschnitt: 'freigestellt', filter: 'gruen' }),
  ],
};
export const bildAt: SharepicSpec = {
  locale: 'de-AT',
  slides: [
    bildSlide('dunkelgruen', { ausschnitt: 'streifen-unten', filter: 'gruen' }),
    bildSlide('weiss', { ausschnitt: 'streifen-oben', filter: 'grau' }, 'unten'),
    bildSlide('dunkelgruen', { ausschnitt: 'karte', filter: 'original' }),
    bildSlide('dunkelgruen', { ausschnitt: 'kreis', filter: 'gruen' }),
    bildSlide('dunkelgruen', { ausschnitt: 'freigestellt', filter: 'gruen' }),
>>>>>>> 97adb395a (feat(sharepic): in-slide bild item with preset crops and green tint)
  ],
};

/** Beyond the provenance specs: one per feature of the other composer tests. */
export const MORE_SPECS = {
  foto,
  formatDe,
  formatAt,
  upload,
  uploadAt,
  rahmen,
  rahmenAt,
  belege,
  listeZahl,
  infografikTipps,
  marker,
  markerAt,
  gruende,
  emojiListe,
  emojiListeAt,
<<<<<<< HEAD
  handMarks,
  handMarksDe,
=======
  bild,
  bildAt,
>>>>>>> 97adb395a (feat(sharepic): in-slide bild item with preset crops and green tint)
};
