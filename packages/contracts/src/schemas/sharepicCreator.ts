import { z } from 'zod';

import { markerCanOpenAt, parseInlineMarks } from '../text/inlineMarks.js';

/**
 * Free-text sharepic creator (experimental).
 *
 * The model never writes pixels or hex colours. It writes a `SharepicSpec` out
 * of building blocks — one slide, or a carousel of several — and the canvas
 * editor's composer turns each slide into an editable `freeform` page with the
 * brand's own layout rules. The vision review answers with patch operations
 * against the same spec.
 *
 * Texts may carry `==accent==` on single words (the editor's accent mark) and
 * `**bold**`. DE quotes, paragraphs and headlines may also carry up to two
 * `++marker++` passages (the marker box); AT sets those as `==accent==`.
 */

export const sharepicCreatorLocaleSchema = z.enum(['de-DE', 'de-AT']);
export type SharepicCreatorLocale = z.infer<typeof sharepicCreatorLocaleSchema>;

/**
 * Brand colours by name. The palette follows what the parties actually post
 * (analysis of the 20 newest Instagram posts each, 10/2026), not the older
 * template set: DE posts use Dunkeltanne, Grasgrün, Mint and Hellgrau — Klee and Sand
 * hardly appear any more.
 */
export const sharepicColorSchema = z.enum([
  'tanne',
  'dunkeltanne',
  'grasgruen',
  'mint',
  'hellgrau',
  'dunkelgruen',
  'hellgruen',
  'weiss',
]);
export type SharepicColor = z.infer<typeof sharepicColorSchema>;

export const SHAREPIC_LOCALE_COLORS: Record<SharepicCreatorLocale, readonly SharepicColor[]> = {
  'de-DE': ['tanne', 'dunkeltanne', 'grasgruen', 'mint', 'hellgrau', 'weiss'],
  'de-AT': ['dunkelgruen', 'hellgruen', 'weiss'],
};

/** The grounds an infographic stands on: its illustrations are painted for a light one. */
export const SHAREPIC_INFOGRAFIK_COLORS: readonly SharepicColor[] = ['hellgrau', 'weiss'];

/**
 * Canvas format ids, mirrored from the canvas editor's format registry (this
 * package cannot import it; a test there holds both lists together). Absent
 * on a spec: `post-portrait`, 4:5. `post-portrait-tall` is 3:4.
 */
export const sharepicFormatSchema = z.enum(['post-portrait', 'post-portrait-tall']);
export type SharepicFormat = z.infer<typeof sharepicFormatSchema>;

export const sharepicPositionSchema = z.enum(['oben', 'mitte', 'unten']);
export type SharepicPosition = z.infer<typeof sharepicPositionSchema>;
export const sharepicAlignSchema = z.enum(['links', 'zentriert']);
export type SharepicAlign = z.infer<typeof sharepicAlignSchema>;
export const sharepicTextSideSchema = z.enum(['unten', 'oben', 'links', 'rechts']);
export type SharepicTextSide = z.infer<typeof sharepicTextSideSchema>;

/** One `++marker++` passage per pair; a slide may carry at most this many (DE only). */
export const SHAREPIC_MARKER_PASSAGES = 2;

/** `C++` is text, not a marker: the one word-bound rule the inline parser uses too. */
const isOpener = (text: string, at: number, mark: '==' | '++') =>
  mark === '==' || markerCanOpenAt(text, at);

/** Tightens whitespace just inside every matched `<mark>…<mark>` pair of one delimiter. */
function tightenPairs(text: string, mark: '==' | '++'): string {
  let out = '';
  let pos = 0;
  let from = 0;
  for (;;) {
    const open = text.indexOf(mark, from);
    if (open !== -1 && !isOpener(text, open, mark)) {
      from = open + 2;
      continue;
    }
    const close = open === -1 ? -1 : text.indexOf(mark, open + 2);
    if (close === -1) return out + text.slice(pos);
    const inner = text.slice(open + 2, close).trim();
    out += inner ? `${text.slice(pos, open)}${mark}${inner}${mark}` : text.slice(pos, close + 2);
    pos = close + 2;
    from = pos;
  }
}

/**
 * Tightens whitespace just inside a matched `==…==` or `++…++` pair: `== x ==`,
 * `==x ==` and `== x==` become `==x==`. The inline tokenizer only closes a mark
 * behind a non-space, so a model's `==Mach mit! ==` would otherwise render
 * literally. Linear scan, no regex; an unpaired mark stays and is rejected by
 * the draft validation.
 */
export function tightenAccentMarks(text: string): string {
  return tightenPairs(tightenPairs(text, '=='), '++');
}

/**
 * True when a `==` or `++` is left without its partner, or the marks cross
 * (`++a ==b++ c==`) — nothing can repair that by whitespace. Judged by the
 * inline parser itself: whatever it leaves as literal mark characters is
 * stray, except a `++` glued to a word (`C++`), which is text.
 */
export function hasUnpairedAccentMark(text: string): boolean {
  return text.split('\n').some((line) => {
    const shown = parseInlineMarks(line)
      .map((run) => run.text)
      .join('');
    return shown.includes('==') || strayPlusPlus(shown);
  });
}

function strayPlusPlus(text: string): boolean {
  for (let at = text.indexOf('++'); at !== -1; at = text.indexOf('++', at + 2)) {
    if (markerCanOpenAt(text, at)) return true;
  }
  return false;
}

/** How many `++marker++` passages a text carries: stretches of marked runs, per line. */
export function countMarkerPassages(text: string): number {
  let passages = 0;
  for (const line of text.split('\n')) {
    let inside = false;
    for (const run of parseInlineMarks(line)) {
      if (run.marker && !inside) passages += 1;
      inside = run.marker;
    }
  }
  return passages;
}

/**
 * A model sometimes writes a line break as the two characters `\n` (JSON
 * escaped twice); the canvas would print them. They become one space — no
 * field of a slide wants a hard break the model typed as text.
 */
export function unescapeLiteralNewlines(text: string): string {
  return text.includes('\\')
    ? // Two linear passes: a leading `[ \t]*` before the escape would backtrack quadratically.
      text.replace(/(?:\\r)?\\n/g, ' ').replace(/[ \t]{2,}/g, ' ')
    : text;
}

/**
 * Applies `unescapeLiteralNewlines` and `tightenAccentMarks` to every string of
 * a spec or patch op, whatever its field — ids, filenames and colours never
 * contain `==` or a backslash, so a blanket walk cannot touch them and cannot
 * miss a text field added later.
 */
export function tightenAccentMarksDeep<T>(value: T): T {
  if (typeof value === 'string') return tightenAccentMarks(unescapeLiteralNewlines(value)) as T;
  if (Array.isArray(value)) return value.map(tightenAccentMarksDeep) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, v]) => [key, tightenAccentMarksDeep(v)])
    ) as T;
  }
  return value;
}

/** Hard copy limits — longer text breaks the layout, not just the style. */
export const SHAREPIC_LIMITS = {
  headlineLine: 24,
  headlineLines: 5,
  dachzeile: 40,
  text: 220,
  zitat: 220,
  listItem: 70,
  button: 32,
  stoerer: 28,
  ortLine: 45,
  absatz: 240,
  quelle: 90,
  zitatQuelle: 80,
  frage: 160,
  frageVon: 20,
  diagrammName: 24,
  diagrammTitel: 60,
  diagrammEinheit: 6,
  iconlisteText: 70,
  vergleichTitel: 32,
  vergleichPunkt: 60,
  faktencheck: 120,
  infografikTitel: 28,
  infografikText: 90,
  infografikMotiv: 200,
  weiter: 40,
  aufruf: 90,
  aufrufAdressat: 50,
  aufrufHinweis: 40,
  zahlWert: 14,
  zahlLabel: 70,
  rechnungWert: 16,
  rechnungLabel: 30,
  terminDatum: 16,
  terminTitel: 50,
  terminOrt: 40,
  schlagzeileMedium: 30,
  schlagzeileTitel: 120,
  bingoFeld: 28,
  slides: 8,
} as const;

const line = (max: number) => z.string().trim().min(1).max(max);

export const sharepicHeadlineSizeSchema = z.enum(['gross']);
const sharepicAccentSchema = z.union([
  z.number().int().min(0),
  z.array(z.number().int().min(0)).min(1).max(4),
]);
/** The accent line indices, whatever form the spec gives them in. */
export function accentLines(akzent: number | number[] | undefined): number[] {
  return akzent === undefined ? [] : Array.isArray(akzent) ? akzent : [akzent];
}

export const sharepicChartKindSchema = z.enum(['balken', 'balken-quer', 'linie', 'kreis', 'donut']);
export type SharepicChartKind = z.infer<typeof sharepicChartKindSchema>;

/**
 * Icons of an `iconliste` row, by topic. A closed set so the model cannot
 * invent an icon id; the composer maps each key to an icon of the editor's sets.
 */
export const sharepicIconSchema = z.enum([
  'haken',
  'kreuz',
  'euro',
  'klima',
  'sonne',
  'wind',
  'strom',
  'bahn',
  'bus',
  'fahrrad',
  'auto',
  'haus',
  'schule',
  'gesundheit',
  'pflege',
  'familie',
  'arbeit',
  'wald',
  'wasser',
  'tiere',
  'herz',
  'demokratie',
  'gerechtigkeit',
  'europa',
  'stadt',
  'land',
  'daten',
  'uhr',
  'megafon',
  // Added for infographics (10/2026).
  'muell',
  'recycling',
  'einkauf',
  'essen',
  'person',
  'menschen',
  'fabrik',
  'heizen',
  'wolke',
  'flugzeug',
  'handy',
  'temperatur',
  'pflanze',
  'flasche',
]);
export type SharepicIcon = z.infer<typeof sharepicIconSchema>;

/** Items that sit on a card of their own — an infographic takes the slide instead. */
export const sharepicAufrufStilSchema = z.enum(['ausruf', 'kernsatz', 'petition']);
export type SharepicAufrufStil = z.infer<typeof sharepicAufrufStilSchema>;

/** How a carousel numbers its pages: a row of dots, or "2/5" in the corner. */
export const sharepicSeitenzahlSchema = z.enum(['punkte', 'bruch']);
export type SharepicSeitenzahl = z.infer<typeof sharepicSeitenzahlSchema>;

/** How a list marks its points: bullets, big numerals, arrows or ticks (a Bilanz). */
export const sharepicListeStilSchema = z.enum(['punkte', 'ziffern', 'pfeile', 'haken']);
/** One big figure: stacked over its label, filling the width, or in a countdown circle. */
export const sharepicZahlStilSchema = z.enum(['stapel', 'riesenwort', 'countdown']);
/** A point per slide: a big numeral above the text, or a pale one behind it. */
export const sharepicNummerSchema = z.enum(['gross', 'geist']);
export type SharepicNummer = z.infer<typeof sharepicNummerSchema>;
export const sharepicRechenzeichenSchema = z.enum(['+', '−', '×', '÷']);

const CARD_ITEM_TYPES = [
  'schlagzeile',
  'bingo',
  'liste',
  'diagramm',
  'iconliste',
  'vergleich',
  'faktencheck',
  'rechnung',
  'termine',
  'zahl',
] as const;

export const sharepicInfografikFormSchema = z.enum([
  'raster',
  'ablauf',
  'mengen',
  'anteil',
  'zahl',
]);
export type SharepicInfografikForm = z.infer<typeof sharepicInfografikFormSchema>;

/**
 * An image painted for this draft — a scene background or an infographic's
 * illustration: `ki:<shareToken>` of the file in the user's media library.
 * Only the server writes one; it survives revisions.
 */
export const SHAREPIC_SCENE_REF = /^ki:([\w-]{16,64})$/;
export const isSharepicSceneRef = (filename: string): boolean => SHAREPIC_SCENE_REF.test(filename);

const sharepicInfografikPunktSchema = z.object({
  /** Short title — may be the figure itself ("300 Becher"). */
  titel: line(SHAREPIC_LIMITS.infografikTitel),
  text: line(SHAREPIC_LIMITS.infografikText).optional(),
  /** Always set: stands in for the illustration when none is painted. */
  icon: sharepicIconSchema,
  /** English, what to paint — one object, no text. */
  motiv: line(SHAREPIC_LIMITS.infografikMotiv).optional(),
  /** Set by the server once the illustration is painted. */
  bild: z.string().regex(SHAREPIC_SCENE_REF).optional(),
  /**
   * `mengen`: the quantity the illustration's size follows. `anteil`: the part
   * of `von` drawn in the accent ("9" of "9 von 10").
   */
  wert: z.number().finite().nonnegative().optional(),
  /** `anteil` only: the whole, as units in a row (2–10) or a 10 × 10 grid (100). */
  von: z.number().int().positive().optional(),
});
export type SharepicInfografikPunkt = z.infer<typeof sharepicInfografikPunktSchema>;

const sharepicVergleichSeiteSchema = z.object({
  titel: line(SHAREPIC_LIMITS.vergleichTitel),
  punkte: z.array(line(SHAREPIC_LIMITS.vergleichPunkt)).min(2).max(3),
});

/** One text group, read top to bottom. Every slide has exactly one. */
export const sharepicItemSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('dachzeile'), text: line(SHAREPIC_LIMITS.dachzeile) }),
  z.object({
    type: z.literal('headline'),
    /** Explicit line breaks — the composer re-wraps only for `groesse`. */
    lines: z.array(line(SHAREPIC_LIMITS.headlineLine)).min(1).max(SHAREPIC_LIMITS.headlineLines),
    /** Emphasised line(s): one index, or a few consecutive ones for a closing line. */
    akzent: sharepicAccentSchema.optional(),
    /** "Schrift größer": a higher size cap, and shorter lines where width holds it back. */
    groesse: sharepicHeadlineSizeSchema.optional(),
  }),
  z.object({ type: z.literal('text'), text: line(SHAREPIC_LIMITS.text) }),
  /**
   * A paragraph of a carousel slide, set larger than `text`. Several in a row
   * tell a story; `betont` sets one apart (DE: green line boxes, AT: yellow).
   */
  z.object({
    type: z.literal('absatz'),
    text: line(SHAREPIC_LIMITS.absatz),
    betont: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('zitat'),
    text: line(SHAREPIC_LIMITS.zitat),
    name: line(60),
    funktion: line(80).optional(),
    /** Medium credit, set after the name: "im FAZ-Interview". */
    quelle: line(SHAREPIC_LIMITS.zitatQuelle).optional(),
    /** The other side's words, set muted with ✗ — the claim a carousel then answers. */
    seite: z.literal('gegner').optional(),
  }),
  /** An interview question; the answer follows as the next `absatz`. */
  z.object({
    type: z.literal('frage'),
    text: line(SHAREPIC_LIMITS.frage),
    /** The medium's short name, set before the question: "SZ: …". */
    von: line(SHAREPIC_LIMITS.frageVon).optional(),
  }),
  z.object({
    type: z.literal('liste'),
    items: z.array(line(SHAREPIC_LIMITS.listItem)).min(2).max(5),
    stil: sharepicListeStilSchema.optional(),
  }),
  z.object({ type: z.literal('button'), text: line(SHAREPIC_LIMITS.button) }),
  /**
   * Numbers from the request as a chart, on a white card. No colours: the
   * composer takes them from the locale's palette. A single value only as a
   * share of a whole — the composer adds the rest to 100 %.
   */
  z.object({
    type: z.literal('diagramm'),
    art: sharepicChartKindSchema,
    werte: z
      .array(z.object({ name: line(SHAREPIC_LIMITS.diagrammName), wert: z.number().finite() }))
      .min(1)
      .max(8),
    /** Appended to every value label: "%", "€", "t". */
    einheit: line(SHAREPIC_LIMITS.diagrammEinheit).optional(),
    titel: line(SHAREPIC_LIMITS.diagrammTitel).optional(),
  }),
  /** Parallel points, each behind a topic icon. */
  z.object({
    type: z.literal('iconliste'),
    zeilen: z
      .array(z.object({ icon: sharepicIconSchema, text: line(SHAREPIC_LIMITS.iconlisteText) }))
      .min(2)
      .max(4),
  }),
  /** The opponent's plan (`links`, muted) against ours (`rechts`, accented). */
  z.object({
    type: z.literal('vergleich'),
    links: sharepicVergleichSeiteSchema,
    rechts: sharepicVergleichSeiteSchema,
  }),
  /**
   * A fact check: a claim going round (`mythos`), set faint and crossed, and
   * the correction (`fakt`) on the accent below it.
   */
  z.object({
    type: z.literal('faktencheck'),
    paare: z
      .array(
        z.object({
          mythos: line(SHAREPIC_LIMITS.faktencheck),
          fakt: line(SHAREPIC_LIMITS.faktencheck),
        })
      )
      .min(1)
      .max(3),
  }),
  /**
   * An illustrated infographic: points in a grid (`raster`), steps in order
   * (`ablauf`), quantities standing on a horizon, sized by `wert` (`mengen`),
   * shares as rows of pictograms, `wert` of `von` coloured (`anteil`), or one
   * figure, huge, under the thing it counts (`zahl`).
   */
  z.object({
    type: z.literal('infografik'),
    form: sharepicInfografikFormSchema,
    punkte: z.array(sharepicInfografikPunktSchema).min(1).max(6),
  }),
  /** One figure as the hero of the slide: "−40°", "10.000", "6,3 Mrd. €". */
  z.object({
    type: z.literal('zahl'),
    stil: sharepicZahlStilSchema,
    wert: line(SHAREPIC_LIMITS.zahlWert),
    label: line(SHAREPIC_LIMITS.zahlLabel).optional(),
  }),
  /**
   * A sum set out line by line: "63 € − 5,75 € − 3,15 € = 44,10 €", or a
   * formula in words ("Hohe Nachfrage + leere Speicher = steigender Preis").
   */
  z.object({
    type: z.literal('rechnung'),
    glieder: z
      .array(
        z.object({
          op: sharepicRechenzeichenSchema.optional(),
          wert: line(SHAREPIC_LIMITS.rechnungWert),
          label: line(SHAREPIC_LIMITS.rechnungLabel).optional(),
        })
      )
      .min(2)
      .max(4),
    ergebnis: z.object({
      wert: line(SHAREPIC_LIMITS.rechnungWert),
      label: line(SHAREPIC_LIMITS.rechnungLabel).optional(),
    }),
  }),
  /** A real headline as evidence: medium, title, date on a paper card. */
  z.object({
    type: z.literal('schlagzeile'),
    stil: z.enum(['ausriss', 'karte']),
    medium: line(SHAREPIC_LIMITS.schlagzeileMedium),
    titel: line(SHAREPIC_LIMITS.schlagzeileTitel),
    datum: line(SHAREPIC_LIMITS.terminDatum).optional(),
  }),
  /** Bullshit bingo: the other side's stock phrases in a 3×3 or 4×4 grid. */
  z.object({
    type: z.literal('bingo'),
    felder: z
      .array(line(SHAREPIC_LIMITS.bingoFeld))
      .refine((f) => f.length === 9 || f.length === 16, 'Ein Bingo hat 9 oder 16 Felder.'),
  }),
  /** Several dates under each other: a week's programme, a campaign calendar. */
  z.object({
    type: z.literal('termine'),
    eintraege: z
      .array(
        z.object({
          datum: line(SHAREPIC_LIMITS.terminDatum),
          titel: line(SHAREPIC_LIMITS.terminTitel),
          ort: line(SHAREPIC_LIMITS.terminOrt).optional(),
        })
      )
      .min(2)
      .max(6),
  }),
  /**
   * A carousel's last word: what the reader should do now. `ausruf` sets a
   * huge "!" over the demand and its addressee, `kernsatz` the key sentence
   * centred over the logo, `petition` the call with its hint as a pill.
   */
  z.object({
    type: z.literal('aufruf'),
    stil: sharepicAufrufStilSchema,
    text: line(SHAREPIC_LIMITS.aufruf),
    adressat: line(SHAREPIC_LIMITS.aufrufAdressat).optional(),
    hinweis: line(SHAREPIC_LIMITS.aufrufHinweis).optional(),
  }),
]);
export type SharepicItem = z.infer<typeof sharepicItemSchema>;
export type SharepicItemType = SharepicItem['type'];

/** What a person calls each item type — in status lines and when naming a selection to the model. */
export const SHAREPIC_ITEM_LABELS: Record<SharepicItemType, string> = {
  absatz: 'Absatz',
  aufruf: 'Aufruf',
  bingo: 'Bingo',
  button: 'Button',
  dachzeile: 'Dachzeile',
  diagramm: 'Diagramm',
  faktencheck: 'Faktencheck',
  frage: 'Frage',
  headline: 'Überschrift',
  iconliste: 'Icon-Liste',
  infografik: 'Infografik',
  liste: 'Liste',
  rechnung: 'Rechnung',
  schlagzeile: 'Schlagzeile',
  termine: 'Termine',
  text: 'Text',
  vergleich: 'Vergleich',
  zahl: 'Zahl',
  zitat: 'Zitat',
};

export const SHAREPIC_COLOR_LABELS: Record<SharepicColor, string> = {
  tanne: 'Tanne',
  dunkeltanne: 'Dunkeltanne',
  grasgruen: 'Grasgrün',
  mint: 'Mint',
  hellgrau: 'Hellgrau',
  dunkelgruen: 'Dunkelgrün',
  hellgruen: 'Hellgrün',
  weiss: 'Weiß',
};

const ORDINALS = ['erst', 'zweit', 'dritt', 'viert', 'fünft', 'sechst', 'siebt', 'acht'];
const SLIDE_NOUN = '(?:slide|folie)';
const NAMED_SLIDE = new RegExp(
  `(?<!\\d)(\\d{1,2})\\.\\s*${SLIDE_NOUN}|${SLIDE_NOUN}\\s*(?:nr\\.?\\s*)?(\\d{1,2})(?!\\d)|(?<!\\p{L})(${ORDINALS.join('|')}|letzt)e[nmrs]?\\s+${SLIDE_NOUN}`,
  'giu'
);

/**
 * Item types a slide can be named by („Folie mit dem Zitat“, „die Zahlen-Folie“,
 * „beim Diagramm“). Headline, paragraph and text stand on nearly every slide
 * and name none.
 */
const CONTENT_STEMS: Partial<Record<SharepicItemType, string>> = {
  zitat: 'zitat',
  zahl: 'zahl',
  diagramm: 'diagramm',
  liste: 'liste',
  iconliste: 'icon-?liste',
  infografik: 'infografik',
  faktencheck: 'faktencheck',
  vergleich: 'vergleich',
  termine: 'termin',
  schlagzeile: 'schlagzeile',
  bingo: 'bingo',
  rechnung: 'rechnung',
  frage: 'frage',
  aufruf: 'aufruf',
};
const CONTENT_REFS = Object.entries(CONTENT_STEMS).map(([type, stem]) => {
  const word = `${stem}(?:e|en|n|s|es)?`;
  return {
    type: type as SharepicItemType,
    pattern: new RegExp(
      `${SLIDE_NOUN}\\s+mit\\s+(?:(?:de[mnr]|die|das|eine[mnr]?|ein)\\s+)?${word}(?!\\p{L})|(?<!\\p{L})${word}-?${SLIDE_NOUN}|(?<!\\p{L})(?:beim|bei\\s+(?:de[mr]|die)|im|in\\s+der|am)\\s+${word}(?!\\p{L})`,
      'iu'
    ),
  };
});

/**
 * The slides a request names as people count them — „1. Slide“, „Folie 2“,
 * „dritte Folie“, „letzte Slide“ — or by what they show („Folie mit dem
 * Zitat“: every slide with a quote), as 0-based indices. „5 Slides“ names a
 * count, not a slide.
 */
export function namedSharepicSlides(
  order: string,
  slides: readonly Pick<SharepicSlide, 'items'>[]
): number[] {
  const count = slides.length;
  const named = new Set<number>();
  for (const m of order.matchAll(NAMED_SLIDE)) {
    const word = m[3]?.toLowerCase();
    const index =
      word === 'letzt' ? count - 1 : word ? ORDINALS.indexOf(word) : Number(m[1] ?? m[2]) - 1;
    if (index >= 0 && index < count) named.add(index);
  }
  for (const { type, pattern } of CONTENT_REFS) {
    if (!pattern.test(order)) continue;
    slides.forEach((slide, i) => {
      if (slide.items.some((item) => item.type === type)) named.add(i);
    });
  }
  return [...named].sort((a, b) => a - b);
}

/** Key order is no content: a spec that went through a patch or the wire may list keys differently. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, canonical(v)])
    );
  }
  return value;
}

/** Same content for the person looking at it: equal up to key order. */
export function sameSharepicContent(a: unknown, b: unknown): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

/** The user's own photos of one request are numbered `upload:1` … `upload:4`. */
export const SHAREPIC_UPLOAD_MAX = 4;
export const SHAREPIC_UPLOAD_ID = new RegExp(`^upload:[1-${SHAREPIC_UPLOAD_MAX}]$`);
export const isSharepicUploadId = (filename: string): boolean => SHAREPIC_UPLOAD_ID.test(filename);

/** A stock photo's file name, the id of one of the user's own photos, or a painted scene. */
const sharepicPhotoFilenameSchema = z
  .string()
  .regex(
    new RegExp(
      `^(?:[\\w.-]+\\.jpe?g|${SHAREPIC_UPLOAD_ID.source.slice(1, -1)}|${SHAREPIC_SCENE_REF.source.slice(1, -1)})$`,
      'i'
    ),
    'filename aus fotos_suchen oder die id eines eigenen Fotos (upload:N) übernehmen'
  );

export const sharepicBackgroundSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('farbe'), color: sharepicColorSchema }),
  z.object({
    kind: z.literal('foto'),
    filename: sharepicPhotoFilenameSchema,
    /** Where the text sits on the photo; that side gets a darkening gradient. */
    textSeite: sharepicTextSideSchema,
  }),
  z.object({
    kind: z.literal('foto-oben'),
    filename: sharepicPhotoFilenameSchema,
    panelColor: sharepicColorSchema,
  }),
  /** Text on the brand colour above, the photo below fading into it. */
  z.object({
    kind: z.literal('foto-unten'),
    filename: sharepicPhotoFilenameSchema,
    panelColor: sharepicColorSchema,
  }),
]);
export type SharepicBackground = z.infer<typeof sharepicBackgroundSchema>;

/** One page: one text group on one background, plus a few extras. */
export const sharepicSlideSchema = z.object({
  background: sharepicBackgroundSchema,
  position: sharepicPositionSchema,
  align: sharepicAlignSchema,
  items: z.array(sharepicItemSchema).min(1).max(6),
  stoerer: z.object({ text: line(SHAREPIC_LIMITS.stoerer) }).optional(),
  // Only what the request names: the circle reads what is there. „Am 14. März"
  // names no weekday — a date alone still makes a circle.
  datum: z
    .object({
      weekday: line(12).optional(),
      date: line(12).optional(),
      time: line(12).optional(),
    })
    .refine((d) => d.weekday !== undefined || d.date !== undefined, {
      message: 'datum braucht weekday oder date',
    })
    .optional(),
  ort: z.object({ lines: z.array(line(SHAREPIC_LIMITS.ortLine)).min(1).max(2) }).optional(),
  logo: z.boolean(),
  /** DE only: every line in its own box — the story slides on photos. */
  zeilenboxen: z.boolean().optional(),
  /** Where a number on the slide comes from, small at the bottom. */
  quelle: line(SHAREPIC_LIMITS.quelle).optional(),
  /** A point per slide: the composer counts the numbered slides and sets the numeral. */
  nummer: sharepicNummerSchema.optional(),
  /** Carousel: a teaser beside the "swipe on" arrow ("Denn →", "Und jetzt?"). Never on the last slide. */
  weiter: line(SHAREPIC_LIMITS.weiter).optional(),
});
export type SharepicSlide = z.infer<typeof sharepicSlideSchema>;

/** "1.234,5 €" → 1234.5; null for words ("Hohe Nachfrage"). German notation only. */
export function parseSharepicNumber(value: string): number | null {
  // One leading class, no second whitespace run after it: two quantifiers over
  // the same characters backtrack polynomially on a string of tabs (CodeQL).
  const m = /^[^\d+−-]*([+−-]?)(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?(?!\d)/.exec(value.trim());
  if (!m) return null;
  const whole = m[2]!.replace(/\./g, '');
  const n = Number(`${whole}${m[3] ? `.${m[3]}` : ''}`);
  return m[1] === '−' || m[1] === '-' ? -n : n;
}

/**
 * A sum must add up. Every term numeric: computed left to right, compared
 * to the result at the result's own precision. Any term in words: a formula,
 * nothing to compute.
 */
function rechnungProblem({
  glieder,
  ergebnis,
}: Extract<SharepicItem, { type: 'rechnung' }>): string | null {
  const values = glieder.map((g) => parseSharepicNumber(g.wert));
  const result = parseSharepicNumber(ergebnis.wert);
  if (result === null || values.some((v) => v === null)) return null;
  const total = glieder.reduce((acc, g, k) => {
    const v = values[k]!;
    if (k === 0) return v;
    switch (g.op ?? '+') {
      case '+':
        return acc + v;
      case '−':
        return acc - v;
      case '×':
        return acc * v;
      case '÷':
        return acc / v;
    }
  }, 0);
  const decimals = /,(\d+)/.exec(ergebnis.wert)?.[1]?.length ?? 0;
  if (Math.abs(total - result) <= 0.51 * 10 ** -decimals) return null;
  const shown = total.toLocaleString('de-DE', { maximumFractionDigits: Math.max(decimals, 2) });
  return `Die rechnung geht nicht auf: die Glieder ergeben ${shown}, nicht ${ergebnis.wert}.`;
}

/**
 * A sharepic is one slide; a carousel is several, swiped in order. Every
 * slide but the last gets a "swipe on" arrow unless `pfeil` is false.
 */
const sharepicSpecShapeSchema = z.object({
  locale: sharepicCreatorLocaleSchema,
  format: sharepicFormatSchema.optional(),
  /** Carousel only: page numbers the composer counts itself. */
  seitenzahl: sharepicSeitenzahlSchema.optional(),
  /** Carousel only: the "swipe on" arrow on every slide but the last. Absent: on. */
  pfeil: z.boolean().optional(),
  slides: z.array(sharepicSlideSchema).min(1).max(SHAREPIC_LIMITS.slides),
});

export const sharepicSpecSchema = sharepicSpecShapeSchema.superRefine((spec, ctx) => {
  const allowed = SHAREPIC_LOCALE_COLORS[spec.locale];
  const last = spec.slides.length - 1;
  if (spec.seitenzahl && last === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['seitenzahl'],
      message: 'seitenzahl nur in einem Karussell.',
    });
  }
  if (spec.pfeil === false && spec.slides.some((slide) => slide.weiter)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['pfeil'],
      message: 'weiter steht neben dem Pfeil – ohne Pfeil kein weiter.',
    });
  }
  spec.slides.forEach((slide, s) => {
    const at = (...path: (string | number)[]) => ['slides', s, ...path];
    const bg = slide.background;
    const color = bg.kind === 'farbe' ? bg.color : bg.kind === 'foto' ? null : bg.panelColor;
    if (color && !allowed.includes(color)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: at('background'),
        message: `Farbe "${color}" gibt es für ${spec.locale} nicht. Erlaubt: ${allowed.join(', ')}.`,
      });
    }
    const headlines = slide.items.filter((i) => i.type === 'headline');
    if (headlines.length > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: at('items'),
        message: 'Nur eine headline pro Slide.',
      });
    }
    for (const h of headlines) {
      const outside =
        h.type === 'headline' ? accentLines(h.akzent).filter((i) => i >= h.lines.length) : [];
      if (outside.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: at('items'),
          message: `akzent ${outside.join(', ')} zeigt auf keine Zeile.`,
        });
      }
    }
    if (slide.items.filter((i) => i.type === 'button').length > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: at('items'),
        message: 'Höchstens ein button pro Slide.',
      });
    }
    if (slide.items.filter((i) => i.type === 'faktencheck').length > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: at('items'),
        message: 'Höchstens ein faktencheck pro Slide.',
      });
    }
    if (slide.items.filter((i) => i.type === 'vergleich').length > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: at('items'),
        message: 'Höchstens ein vergleich pro Slide.',
      });
    }
    const infografiken = slide.items.flatMap((i) => (i.type === 'infografik' ? [i] : []));
    const issue = (message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: at('items'), message });
    if (infografiken.length > 1) issue('Höchstens eine infografik pro Slide.');
    // The illustrations are painted in dark and light greens for a light
    // ground; on a green slide half of them vanish.
    if (
      infografiken.length &&
      (slide.background.kind !== 'farbe' ||
        !SHAREPIC_INFOGRAFIK_COLORS.includes(slide.background.color))
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: at('background'),
        message:
          'Eine infografik steht auf hellem Grund: background {"kind":"farbe","color":"weiss"} (in Deutschland auch "hellgrau").',
      });
    }
    if (
      infografiken.length &&
      slide.items.some((i) => (CARD_ITEM_TYPES as readonly string[]).includes(i.type))
    ) {
      issue(
        'Eine infografik füllt die Slide: kein diagramm, keine liste, iconliste, kein vergleich oder faktencheck daneben.'
      );
    }
    for (const info of infografiken) {
      if (info.form === 'zahl' && info.punkte.length !== 1) {
        issue('Eine infografik mit form "zahl" hat genau einen Punkt: die Zahl und ihr Bild.');
      }
      if (info.form !== 'anteil' && info.form !== 'zahl' && info.punkte.length < 2) {
        issue(
          'Eine infografik braucht mindestens 2 Punkte (nur "anteil" und "zahl" kommen mit einem aus).'
        );
      }
      if (info.form === 'mengen' && info.punkte.some((p) => p.wert === undefined)) {
        issue('Eine infografik mit form "mengen" braucht bei jedem Punkt einen wert.');
      }
      if (
        info.form !== 'mengen' &&
        info.form !== 'anteil' &&
        info.punkte.some((p) => p.wert !== undefined)
      ) {
        issue('wert gibt es nur bei form "mengen" und "anteil" – sonst steht die Zahl im titel.');
      }
      if (info.form !== 'anteil' && info.punkte.some((p) => p.von !== undefined)) {
        issue('von gibt es nur bei form "anteil".');
      }
      if (info.form === 'anteil') {
        if (info.punkte.length > 3) issue('Ein anteil-Bild hat höchstens 3 Anteile.');
        for (const p of info.punkte) {
          const { wert, von } = p;
          if (wert === undefined || von === undefined) {
            issue(`Jeder Anteil braucht wert und von ("${p.titel}": 9 von 10 → wert 9, von 10).`);
          } else if (!(von === 100 || (von >= 2 && von <= 10))) {
            issue(
              `von ${von} ("${p.titel}"): ein Anteil zählt 2–10 Einheiten oder 100 (Prozent) – „3 von 8“ ja, „37 von 120“ als Prozent.`
            );
          } else if (!Number.isInteger(wert) || wert > von) {
            issue(
              `wert ${wert} von ${von} ("${p.titel}"): eine ganze Zahl bis ${von} – eine Kommazahl passt nicht in Einheiten, dann lieber ein diagramm.`
            );
          } else {
            // The figure written must be the one drawn: "9 von 10" over 9 of 10.
            const figures = (p.titel.match(/\d+/g) ?? []).map(Number);
            if (
              figures.length &&
              (!figures.includes(wert) || (von !== 100 && !figures.includes(von)))
            ) {
              issue(
                `titel "${p.titel}" passt nicht zu wert ${wert} von ${von} – die Zahl im titel ist die, die gezeichnet wird.`
              );
            }
          }
        }
      }
      if (info.form === 'ablauf' && info.punkte.length > 5) {
        issue('Ein ablauf hat höchstens 5 Schritte.');
      }
      if (info.form === 'mengen' && info.punkte.length > 4) {
        issue('Ein mengen-Bild hat höchstens 4 Mengen.');
      }
    }
    const charts = slide.items.flatMap((i) => (i.type === 'diagramm' ? [i] : []));
    if (charts.length > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: at('items'),
        message: 'Höchstens ein diagramm pro Slide.',
      });
    }
    for (const chart of charts) {
      const parts = chart.art === 'kreis' || chart.art === 'donut';
      if (parts && chart.werte.length > 5) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: at('items'),
          message: `Ein ${chart.art}-diagramm hat höchstens 5 Teile – mehr als balken-quer.`,
        });
      }
      if (parts && chart.werte.some((w) => w.wert < 0)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: at('items'),
          message: `Ein ${chart.art}-diagramm zeigt Anteile – keine negativen Werte.`,
        });
      }
      const sum = chart.werte.reduce((total, w) => total + w.wert, 0);
      if (chart.werte.length < 2 && !(parts && chart.einheit === '%' && sum < 100)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: at('items'),
          message:
            'Ein einzelner Wert nur als Anteil: art kreis oder donut mit einheit "%" – den Rest ergänzt der Grünerator. Sonst mindestens zwei werte.',
        });
      }
      if (parts && chart.einheit === '%' && sum > 100.5) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: at('items'),
          message: `Die Anteile ergeben ${sum} % – mehr als 100 %.`,
        });
      }
    }
    if (slide.weiter && s === last) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: at('weiter'),
        message: 'weiter führt zur nächsten Slide – nicht auf der letzten.',
      });
    }
    for (const type of ['zahl', 'rechnung', 'termine', 'schlagzeile', 'bingo'] as const) {
      if (slide.items.filter((i) => i.type === type).length > 1) {
        issue(`Höchstens ein ${type} pro Slide.`);
      }
    }
    if (slide.nummer && slide.items.some((i) => i.type === 'liste' && i.stil === 'ziffern')) {
      issue('nummer oder eine liste mit ziffern – nicht beides auf einer Slide.');
    }
    for (const item of slide.items) {
      if (item.type !== 'rechnung') continue;
      const problem = rechnungProblem(item);
      if (problem) issue(problem);
    }
    const aufrufe = slide.items.filter((i) => i.type === 'aufruf');
    if (aufrufe.length && s !== last) {
      issue('Ein aufruf steht auf der letzten Slide.');
    }
    if (aufrufe.length > 1) issue('Höchstens ein aufruf.');
    if (aufrufe.length && slide.items.some((i) => i.type !== 'aufruf' && i.type !== 'dachzeile')) {
      issue('Der aufruf trägt seine Slide allein (höchstens eine dachzeile darüber).');
    }
    if (slide.zeilenboxen && spec.locale !== 'de-DE') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: at('zeilenboxen'),
        message: 'zeilenboxen gibt es nur im deutschen Corporate Design.',
      });
    }
  });
});
export type SharepicSpec = z.infer<typeof sharepicSpecSchema>;

/**
 * What the vision review may change. A slide is addressed by its index in
 * `spec.slides` (default 0), an item by its index in that slide's `items` —
 * the review sees the spec with indices, nothing else.
 */
const onSlide = { slide: z.number().int().min(0).optional() };
export const sharepicPatchOpSchema = z.discriminatedUnion('op', [
  z.object({
    ...onSlide,
    op: z.literal('set_text'),
    item: z.number().int().min(0),
    text: z.string().trim().min(1),
  }),
  z.object({
    ...onSlide,
    op: z.literal('set_headline'),
    /** Turns this item into the headline — for a slide that has none yet. */
    item: z.number().int().min(0).optional(),
    lines: z.array(z.string().trim().min(1)).min(1),
    akzent: sharepicAccentSchema.optional(),
  }),
  z.object({ ...onSlide, op: z.literal('remove_item'), item: z.number().int().min(0) }),
  z.object({ ...onSlide, op: z.literal('set_position'), position: sharepicPositionSchema }),
  z.object({ ...onSlide, op: z.literal('set_align'), align: sharepicAlignSchema }),
  z.object({ ...onSlide, op: z.literal('set_text_side'), textSeite: sharepicTextSideSchema }),
  z.object({ ...onSlide, op: z.literal('set_color'), color: sharepicColorSchema }),
  /** Drop a photo that does not fit and use a brand colour instead. */
  z.object({ ...onSlide, op: z.literal('use_color'), color: sharepicColorSchema }),
  z.object({
    ...onSlide,
    op: z.literal('remove_extra'),
    extra: z.enum(['stoerer', 'datum', 'ort', 'logo', 'quelle']),
  }),
]);
export type SharepicPatchOp = z.infer<typeof sharepicPatchOpSchema>;

export const sharepicPhotoAttributionSchema = z.object({
  photographer: z.string(),
  profileUrl: z.string(),
  photoUrl: z.string(),
});
export type SharepicPhotoAttribution = z.infer<typeof sharepicPhotoAttributionSchema>;

export const SHAREPIC_ELEMENT_KINDS = [
  'text',
  'pill',
  'circle',
  'shape',
  'asset',
  'chart',
  'userImage',
  'icon',
] as const;

/** What the composer wrote for one element; compared against the page to find hand edits. */
export const sharepicFingerprintSchema = z.object({
  kind: z.enum(SHAREPIC_ELEMENT_KINDS),
  x: z.number(),
  y: z.number(),
  width: z.number().optional(),
  height: z.number().optional(),
  fontSize: z.number().optional(),
  fill: z.string().optional(),
  rotation: z.number().optional(),
  scale: z.number().optional(),
  /** Shapes scale on two axes; `scale` holds their x. */
  scaleY: z.number().optional(),
  opacity: z.number().optional(),
  text: z.string().optional(),
});
export type SharepicFingerprint = z.infer<typeof sharepicFingerprintSchema>;

export const sharepicBackgroundFingerprintSchema = z.object({
  color: z.string().nullable(),
  imageSrc: z.string().nullable(),
  offset: z.object({ x: z.number(), y: z.number() }).nullable(),
  scale: z.number().nullable(),
});
export type SharepicBackgroundFingerprint = z.infer<typeof sharepicBackgroundFingerprintSchema>;

/** Element fingerprints keyed by element id; the background has its own field (ids are free-form). */
export const sharepicBaselineSchema = z.object({
  elements: z.record(z.string(), sharepicFingerprintSchema),
  background: sharepicBackgroundFingerprintSchema,
});
export type SharepicBaseline = z.infer<typeof sharepicBaselineSchema>;

/** F0: the page-state key and `v` are persisted in Yjs documents; change additively only. */
export const SHAREPIC_SOURCE_KEY = 'sharepicSource' as const;

/** Tweak id -> chosen option (see canvas-editor sharepicTweaks). */
export const sharepicTweakChoiceSchema = z.record(z.string(), z.string());

/**
 * Semantic origin of a creator page, stored in its Yjs `state`. `slide` is the
 * BASE (untweaked) one-slide spec; `deck` groups the pages of one carousel.
 */
export const sharepicSourceSchema = z.object({
  v: z.literal(1),
  deck: z.string().uuid(),
  // Shape only: a slide cut from a carousel fails the deck-level refinements
  // (seitenzahl, weiter); deckSpec() validates the assembled deck in full.
  slide: sharepicSpecShapeSchema.refine((spec) => spec.slides.length === 1, {
    message: 'slide must hold exactly one slide.',
  }),
  attribution: sharepicPhotoAttributionSchema.nullable(),
  tweaks: sharepicTweakChoiceSchema.optional(),
  baseline: sharepicBaselineSchema,
});
export type SharepicSource = z.infer<typeof sharepicSourceSchema>;

/**
 * One line of free text that ends up in a prompt: control characters, line
 * breaks and backticks become spaces, so a field cannot open a section or close
 * a fence. The length is capped before and after the clean-up.
 */
const oneLine = (max: number) =>
  z
    .string()
    .max(max * 4)
    // eslint-disable-next-line no-control-regex -- stripping control characters is the point
    .transform((value) => value.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029`]+/g, ' '))
    .pipe(z.string().trim().min(1).max(max));

export const sharepicPhotoFitSchema = z.enum(['vollflaeche', 'oben', 'unten']);
export type SharepicPhotoFit = z.infer<typeof sharepicPhotoFitSchema>;

/**
 * What the vision model sees in one of the user's own photos. It never names
 * or identifies a person — `personen` is a head count, nothing more.
 */
export const sharepicPhotoAnalysisModelSchema = z.object({
  /** Short description of the motif. */
  motiv: oneLine(240),
  personen: z.number().int().min(0).max(99),
  /** Where text has room: the calm side of the picture. */
  ruhigeSeite: sharepicTextSideSchema,
  hell: z.boolean(),
  /** `vollflaeche` = the whole sharepic; `oben`/`unten` = the photo fills only that half. */
  eignung: sharepicPhotoFitSchema,
  stichworte: z.array(oneLine(40)).max(8),
});

export const sharepicPhotoAnalysisSchema = sharepicPhotoAnalysisModelSchema.extend({
  /** false = the vision call failed; the other fields are neutral placeholders. */
  analysiert: z.boolean(),
});
export type SharepicPhotoAnalysis = z.infer<typeof sharepicPhotoAnalysisSchema>;

/** What a draft gets when vision is unavailable: a placeholder that claims nothing. */
export const SHAREPIC_NEUTRAL_PHOTO_ANALYSIS: SharepicPhotoAnalysis = {
  motiv: 'Eigenes Foto (nicht automatisch beschrieben)',
  personen: 0,
  ruhigeSeite: 'unten',
  hell: false,
  eignung: 'vollflaeche',
  stichworte: [],
  analysiert: false,
};

export const sharepicOwnPhotoSchema = z.object({
  id: z.string().regex(SHAREPIC_UPLOAD_ID),
  analysis: sharepicPhotoAnalysisSchema,
});
export type SharepicOwnPhoto = z.infer<typeof sharepicOwnPhotoSchema>;

/** The durable URL `uploadBlobToMediaLibrary` returns — the server reads the file itself, it never fetches. */
export const SHAREPIC_PHOTO_URL = /^\/api\/share\/([\w-]{16,64})\/download$/;
export const sharepicPhotoUrlSchema = z.string().regex(SHAREPIC_PHOTO_URL);

export const sharepicAnalyzePhotoBodySchema = z.object({ url: sharepicPhotoUrlSchema });

/**
 * What a sharepic can be. A request that names one gets it; otherwise the
 * creator picks one and offers two others as alternatives.
 */
export const SHAREPIC_FORMS = [
  { id: 'einzelbild', label: 'Einzelbild' },
  { id: 'zitat', label: 'Zitat' },
  { id: 'karussell', label: 'Karussell' },
  { id: 'interview', label: 'Interview' },
  { id: 'infografik', label: 'Infografik' },
  { id: 'diagramm', label: 'Diagramm' },
  { id: 'zahl', label: 'Große Zahl' },
  { id: 'rechnung', label: 'Rechnung' },
  { id: 'termine', label: 'Termine' },
  { id: 'schlagzeile', label: 'Schlagzeile' },
  { id: 'bingo', label: 'Bingo' },
  { id: 'vergleich', label: 'Vergleich' },
  { id: 'faktencheck', label: 'Faktencheck' },
  { id: 'faktenbild', label: 'Faktenbild' },
  { id: 'veranstaltung', label: 'Veranstaltung' },
] as const;
export type SharepicFormId = (typeof SHAREPIC_FORMS)[number]['id'];
export const sharepicFormSchema = z.enum(
  SHAREPIC_FORMS.map((f) => f.id) as [SharepicFormId, ...SharepicFormId[]]
);

export function sharepicFormLabel(id: SharepicFormId): string {
  return SHAREPIC_FORMS.find((f) => f.id === id)!.label;
}

/** Longest request the creator takes — long enough to convert a whole press release. */
export const SHAREPIC_PROMPT_MAX = 20_000;

/** The part of a carousel a change request is about: a 0-based slide, optionally composer element ids on it. */
export const sharepicDraftFocusSchema = z.object({
  slide: z.number().int().min(0),
  elements: z.array(z.string()).optional(),
});
export type SharepicDraftFocus = z.infer<typeof sharepicDraftFocusSchema>;

export const sharepicDraftBodySchema = z.object({
  prompt: z.string().trim().min(3).max(SHAREPIC_PROMPT_MAX),
  locale: sharepicCreatorLocaleSchema.optional(),
  /** The draft to change; `prompt` is then the change request. */
  current: sharepicSpecSchema.optional(),
  /** The user's own photos (already analysed) — the only `upload:N` ids a draft may use. */
  photos: z
    .array(sharepicOwnPhotoSchema)
    .max(SHAREPIC_UPLOAD_MAX)
    .refine((photos) => new Set(photos.map((p) => p.id)).size === photos.length, 'doppelte id')
    .optional(),
  /** A form picked from the offered alternatives; otherwise the request's wording decides. */
  form: sharepicFormSchema.optional(),
  /** With `current`: the slide (and elements) the change request is about. */
  focus: sharepicDraftFocusSchema.optional(),
});

export const sharepicDraftResponseSchema = z.object({
  spec: sharepicSpecSchema,
  /** Chapters the model asked for — shown in the UI so the knowledge path stays visible. */
  chapters: z.array(z.string()),
  /** Photo credit per slide, `null` on a colour slide. */
  attributions: z.array(sharepicPhotoAttributionSchema.nullable()),
  /** One sentence for the user when the draft fell short of the request (no painted scene). */
  hinweis: z.string().max(300).optional(),
  /** The form the draft was built as — named in the request or chosen by the creator. */
  form: sharepicFormSchema.optional(),
  /** Two other forms that would suit the request. */
  alternativen: z.array(sharepicFormSchema).max(2).optional(),
});
export type SharepicDraftResponse = z.infer<typeof sharepicDraftResponseSchema>;

/** `edit`: the draft was just revised on `prompt` (a change request) — the review must not undo it. */
export const sharepicReviewModeSchema = z.enum(['draft', 'edit']);
export type SharepicReviewMode = z.infer<typeof sharepicReviewModeSchema>;

export const sharepicReviewBodySchema = z.object({
  spec: sharepicSpecSchema,
  prompt: z.string().trim().min(1).max(SHAREPIC_PROMPT_MAX),
  /** PNG/JPEG data URL of the rendered draft — a carousel as one contact sheet. */
  image: z.string().startsWith('data:image/').max(8_000_000),
  mode: sharepicReviewModeSchema.optional(),
});

export const sharepicReviewResponseSchema = z.object({
  ok: z.boolean(),
  issues: z.array(z.string()),
  patch: z.array(sharepicPatchOpSchema),
});
export type SharepicReviewResponse = z.infer<typeof sharepicReviewResponseSchema>;

export const sharepicCreatorErrorSchema = z.object({ error: z.string() });

/**
 * A creator sharepic as the chat carries it (`SharepicVariant.initialProps`).
 * The server only has the spec; every renderer composes it in the browser.
 * `slide` picks the page of a carousel, `revisionOf` names the variant this one
 * revises, `editorChangesDropped` marks a revision of a sharepic that had been
 * opened in the editor.
 */
export const sharepicChatPropsSchema = z.object({
  creatorSpec: sharepicSpecSchema,
  /** The untweaked spec and the choice behind `creatorSpec`, when the minter composes from the tweaked one. */
  creatorBase: sharepicSpecSchema.optional(),
  creatorTweaks: sharepicTweakChoiceSchema.optional(),
  attributions: z.array(sharepicPhotoAttributionSchema.nullable()),
  slide: z.number().int().min(0).optional(),
  revisionOf: z.string().optional(),
  editorChangesDropped: z.literal(true).optional(),
});
export type SharepicChatProps = z.infer<typeof sharepicChatPropsSchema>;

export function parseSharepicChatProps(value: unknown): SharepicChatProps | null {
  const parsed = sharepicChatPropsSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
