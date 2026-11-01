import { z } from 'zod';

import {
  sharepicAufrufStilSchema,
  sharepicBildAusschnittSchema,
  sharepicBildFilterSchema,
  sharepicChartKindSchema,
  type SharepicColor,
  sharepicEmojiSchema,
  sharepicHeadlineSizeSchema,
  sharepicIconSchema,
  sharepicInfografikFormSchema,
  sharepicListeStilSchema,
  sharepicRechenzeichenSchema,
  sharepicVergleichStilSchema,
  sharepicZahlStilSchema,
} from './enums.js';
import { SHAREPIC_LIMITS } from './limits.js';
import { line, sharepicAccentSchema } from './primitives.js';
import {
  SHAREPIC_SCENE_REF,
  sharepicCutOutRefSchema,
  sharepicPhotoFilenameSchema,
} from './refs.js';

export const CARD_ITEM_TYPES = [
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

/**
 * The card items a DE `kopfband` can end at: the composer draws them on a
 * white `-card` shape, the band's lower edge. The other card items stand on
 * the ground itself and would leave the band undrawn.
 */
export const KOPFBAND_CARD_TYPES = ['schlagzeile', 'liste', 'diagramm', 'vergleich', 'faktencheck'];

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

/** Card limits are the default; `spalten` takes the wider ones (checked in the slide refine). */
const sharepicVergleichSeiteSchema = z.object({
  titel: line(SHAREPIC_LIMITS.vergleichSpaltenTitel),
  /** A point may open with "✓ " or "✗ " to override its side's marker (a concession on theirs). */
  punkte: z.array(line(SHAREPIC_LIMITS.vergleichSpaltenPunkt)).min(2).max(5),
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
    text: line(SHAREPIC_LIMITS.absatzLang),
    betont: z.boolean().optional(),
    /** Body size, never grown to fill the slide: a closing line, a long text page. */
    klein: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('zitat'),
    text: line(SHAREPIC_LIMITS.zitatLang),
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
    /** `stil: "emoji"` only: one emoji per point, in order. */
    zeichen: z.array(sharepicEmojiSchema).optional(),
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
    stil: sharepicVergleichStilSchema.optional(),
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
  /**
   * A photo inside the slide, beside the text: a strip across the bottom or
   * top third, on a white card, round, or the person cut out (`freigestellt`).
   */
  z.object({
    type: z.literal('bild'),
    quelle: sharepicPhotoFilenameSchema,
    ausschnitt: sharepicBildAusschnittSchema,
    filter: sharepicBildFilterSchema,
    /** `freigestellt` only: the cut-out of `quelle`, set by the server (or shipped by a Vorlage). */
    freisteller: sharepicCutOutRefSchema.optional(),
  }),
  /**
   * A person introduces themselves: the greeting small, the name large with a
   * waving hand, short traits around them, each with a hand-drawn arrow to
   * the person. Fills the slide; the person is the background photo or a
   * cut-out `bild` on a colour.
   */
  z.object({
    type: z.literal('steckbrief'),
    /** Small above the name: "Hallo, ich bin". */
    gruss: line(SHAREPIC_LIMITS.steckbriefGruss),
    name: line(SHAREPIC_LIMITS.steckbriefName),
    /** In the person's own words, from the request: "Bouldert trotz Höhenangst". */
    merkmale: z.array(line(SHAREPIC_LIMITS.steckbriefMerkmal)).min(3).max(10),
  }),
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
  bild: 'Bild',
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
  steckbrief: 'Steckbrief',
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
  creme: 'Creme',
  aubergine: 'Aubergine',
  dunkelgruen: 'Dunkelgrün',
  hellgruen: 'Hellgrün',
  weiss: 'Weiß',
  lila: 'Lila',
  flieder: 'Flieder',
  violett: 'Violett',
  pride: 'Pride-Verlauf',
  europablau: 'Europablau',
  himmelblau: 'Himmelblau',
  limette: 'Hellgrün',
  wiese: 'Grün',
  apricot: 'Apricot',
  lavendel: 'Lavendel',
  pink: 'Pink',
  schwarz: 'Schwarz',
  waldgruen: 'Waldgrün',
  maigruen: 'Maigrün',
  gelb: 'Gelb',
  veilchen: 'Violett',
};

/** Items whose words only the request gives: a draft may not reword them. */
export const SHAREPIC_REQUEST_BOUND_ITEMS: ReadonlySet<SharepicItemType> =
  new Set<SharepicItemType>([
    'zitat',
    'zahl',
    'diagramm',
    'rechnung',
    'termine',
    'schlagzeile',
    'faktencheck',
    'bingo',
    'steckbrief',
  ]);
