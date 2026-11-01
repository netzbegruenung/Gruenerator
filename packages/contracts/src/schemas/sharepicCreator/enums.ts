import { z } from 'zod';

export const sharepicCreatorLocaleSchema = z.enum(['de-DE', 'de-AT']);
export type SharepicCreatorLocale = z.infer<typeof sharepicCreatorLocaleSchema>;

/**
 * Whose corporate design a sharepic wears. The country stays `locale`; the
 * brand picks the organisation within it. Absent on a spec: `gruene`.
 */
export const sharepicBrandSchema = z.enum(['gruene', 'gruene-jugend']);
export type SharepicBrand = z.infer<typeof sharepicBrandSchema>;

/** One design per brand and country — the key of every per-design table. */
export const SHAREPIC_BRAND_IDS = ['gruene-de', 'gruene-at', 'gj-de', 'gj-at'] as const;
export type SharepicBrandId = (typeof SHAREPIC_BRAND_IDS)[number];

/** The only translation from (country, brand) to a design. */
export function brandIdFor(
  locale: SharepicCreatorLocale | string | null | undefined,
  brand?: SharepicBrand | null
): SharepicBrandId {
  const at = locale === 'de-AT';
  if (brand === 'gruene-jugend') return at ? 'gj-at' : 'gj-de';
  return at ? 'gruene-at' : 'gruene-de';
}

/** The brand a design id stands for. */
export const brandOfId = (id: SharepicBrandId): SharepicBrand =>
  id === 'gj-de' || id === 'gj-at' ? 'gruene-jugend' : 'gruene';

/**
 * Brand colours by name. The palette follows what the parties actually post
 * (analysis of the 20 newest Instagram posts each, 10/2026), not the older
 * template set: DE posts use Dunkeltanne, Grasgrün, Mint and Hellgrau — Klee and Sand
 * hardly appear any more. Creme and Aubergine are the grounds of the DE
 * candidates' text slides (interview pages, a long letter).
 */
export const sharepicColorSchema = z.enum([
  'tanne',
  'dunkeltanne',
  'grasgruen',
  'mint',
  'hellgrau',
  'creme',
  'aubergine',
  'dunkelgruen',
  'hellgruen',
  'weiss',
  // Themed grounds: valid only on a spec with the matching `thema`.
  'lila',
  'flieder',
  'violett',
  'pride',
  'europablau',
  'himmelblau',
  // GRÜNE JUGEND Deutschland (CD März 2024, S. 11).
  'limette',
  'apricot',
  'lavendel',
  'pink',
  'schwarz',
  // GJ DE's darker green (CD „Dunkelgrün“ #33C270): dates, a calendar's ground.
  'wiese',
  // Grüne Jugend Österreich (gemessen an @gruenejugend.at, 10/2026).
  'waldgruen',
  'maigruen',
  'gelb',
  'veilchen',
]);
export type SharepicColor = z.infer<typeof sharepicColorSchema>;

/**
 * A themed sharepic: Pride/CSD (`queer`), 8 March, Equal Pay, Safe Abortion
 * Day (`frauen`) or Europe Day, Schengen, EU decisions (`europa`). The theme recolours accent, marker, badges, charts and
 * dates and unlocks its grounds; layout and type stay the locale's CD.
 */
export const sharepicThemaSchema = z.enum(['queer', 'frauen', 'europa']);
export type SharepicThema = z.infer<typeof sharepicThemaSchema>;

/** The grounds a theme brings; a spec without that theme may not use them. */
export const SHAREPIC_THEMA_COLORS: Record<SharepicThema, readonly SharepicColor[]> = {
  queer: ['violett', 'pride'],
  frauen: ['lila', 'flieder'],
  europa: ['europablau', 'himmelblau'],
};

/** The theme a themed ground belongs to; undefined for a plain CD colour. */
export const themaOfColor = (color: SharepicColor): SharepicThema | undefined =>
  sharepicThemaSchema.options.find((t) => SHAREPIC_THEMA_COLORS[t].includes(color));

/** The plain CD palette per locale; themed grounds come on top via `sharepicColorsFor`. */
export const SHAREPIC_LOCALE_COLORS: Record<SharepicCreatorLocale, readonly SharepicColor[]> = {
  'de-DE': ['tanne', 'dunkeltanne', 'grasgruen', 'mint', 'hellgrau', 'creme', 'aubergine', 'weiss'],
  'de-AT': ['dunkelgruen', 'hellgruen', 'weiss'],
};

/** The plain CD palette per design; the Grünen rows are `SHAREPIC_LOCALE_COLORS`. */
export const SHAREPIC_BRAND_COLORS: Record<SharepicBrandId, readonly SharepicColor[]> = {
  'gruene-de': SHAREPIC_LOCALE_COLORS['de-DE'],
  'gruene-at': SHAREPIC_LOCALE_COLORS['de-AT'],
  // Primaries first: the model opens with the first one when nothing else fits.
  'gj-de': ['limette', 'apricot', 'lavendel', 'pink', 'wiese', 'weiss', 'schwarz'],
  'gj-at': ['waldgruen', 'maigruen', 'creme', 'gelb', 'veilchen'],
};

/** The grounds a spec may use: its design's CD, plus its theme's own. */
export function sharepicColorsFor(
  locale: SharepicCreatorLocale,
  thema?: SharepicThema | null,
  brand?: SharepicBrand | null
): readonly SharepicColor[] {
  const own = SHAREPIC_BRAND_COLORS[brandIdFor(locale, brand)];
  return thema ? [...own, ...SHAREPIC_THEMA_COLORS[thema]] : own;
}

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

export const sharepicHeadlineSizeSchema = z.enum(['gross']);

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
  // An invitation's when and where (GJ DE, DbVz_btDJDb/01).
  'kalender',
  'ort',
]);
export type SharepicIcon = z.infer<typeof sharepicIconSchema>;

/** Items that sit on a card of their own — an infographic takes the slide instead. */
export const sharepicAufrufStilSchema = z.enum(['ausruf', 'kernsatz', 'petition']);
export type SharepicAufrufStil = z.infer<typeof sharepicAufrufStilSchema>;

/** How a carousel numbers its pages: a row of dots, or "2/5" in the corner. */
export const sharepicSeitenzahlSchema = z.enum(['punkte', 'bruch']);
export type SharepicSeitenzahl = z.infer<typeof sharepicSeitenzahlSchema>;

/**
 * How a list marks its points: bullets, big numerals, arrows or ticks (a
 * Bilanz); `kasten` (DE): no marker, each point opens with its key figure in
 * a `++box++` (Dd6hROjIMQC).
 */
export const sharepicListeStilSchema = z.enum([
  'punkte',
  'ziffern',
  'pfeile',
  'haken',
  'kasten',
  'emoji',
]);

/**
 * The emoji a `liste` with `stil: "emoji"` may set before a point. A closed
 * set: the composer draws each one as a vendored Noto image, so it looks the
 * same on every device.
 */
export const SHAREPIC_EMOJI = [
  '🗳️',
  '📰',
  '🪧',
  '✍️',
  '📣',
  '📢',
  '🤝',
  '💚',
  '❤️',
  '✅',
  '❌',
  '👉',
  '💪',
  '👏',
  '🧑‍🤝‍🧑',
  '🌍',
  '🌱',
  '🌳',
  '🌻',
  '☀️',
  '💨',
  '⚡',
  '🔥',
  '💧',
  '♻️',
  '🐝',
  '🚲',
  '🚆',
  '🚌',
  '🏠',
  '🏫',
  '🏥',
  '💶',
  '📈',
  '📉',
  '📅',
  '📍',
  '📱',
  '💬',
  '💡',
  '⚖️',
  '🕊️',
  '🎓',
  '🌈',
] as const;
export type SharepicEmoji = (typeof SHAREPIC_EMOJI)[number];

/** Codepoints without the variation selector: "🗳️" → "1f5f3" (the Noto file name). */
export const sharepicEmojiCode = (emoji: string): string =>
  [...emoji.replace(/\uFE0F/g, '')].map((c) => c.codePointAt(0)!.toString(16)).join('_');

const EMOJI_BY_CODE = new Map<string, SharepicEmoji>(
  SHAREPIC_EMOJI.map((e) => [sharepicEmojiCode(e), e])
);
/** A model may write an emoji with or without its variation selector; both mean the same one. */
export const sharepicEmojiSchema = z
  .string()
  .transform((value) => EMOJI_BY_CODE.get(sharepicEmojiCode(value.trim())) ?? value)
  .pipe(z.enum(SHAREPIC_EMOJI));
/** One big figure: stacked over its label, filling the width, or in a countdown circle. */
export const sharepicZahlStilSchema = z.enum(['stapel', 'riesenwort', 'countdown']);
/** A point per slide: a big numeral above the text, or a pale one behind it. */
export const sharepicNummerSchema = z.enum(['gross', 'geist']);
export type SharepicNummer = z.infer<typeof sharepicNummerSchema>;
export const sharepicRechenzeichenSchema = z.enum(['+', '−', '×', '÷']);

export const sharepicInfografikFormSchema = z.enum([
  'raster',
  'ablauf',
  'mengen',
  'anteil',
  'zahl',
]);
export type SharepicInfografikForm = z.infer<typeof sharepicInfografikFormSchema>;

/** `karten`: two cards in the column (default). `spalten`: the slide split edge to edge, a VS between (DE). */
export const sharepicVergleichStilSchema = z.enum(['karten', 'spalten']);
export type SharepicVergleichStil = z.infer<typeof sharepicVergleichStilSchema>;

/** Where a photo inside the slide sits; the composer gives each a fixed place beside the text. */
export const sharepicBildAusschnittSchema = z.enum([
  'streifen-unten',
  'streifen-oben',
  'karte',
  'kreis',
  'freigestellt',
]);
export type SharepicBildAusschnitt = z.infer<typeof sharepicBildAusschnittSchema>;
/** `gruen`: tinted in the locale's green, as the posts set photos of people. */
export const sharepicBildFilterSchema = z.enum(['gruen', 'grau', 'original']);
export type SharepicBildFilter = z.infer<typeof sharepicBildFilterSchema>;
