/**
 * Colours a person asks for that the sharepic palette does not have.
 *
 * Live (07.10.2026) "Hintergrund auf Sand" ran the draft 2–3 times into the
 * colour enum and then fell back to hellgrau without a word. The closest
 * colour is decided here instead, told to the model up front, forced onto
 * any off-palette value the model still writes, and reported to the person.
 */
import {
  SHAREPIC_LOCALE_COLORS,
  type SharepicColor,
  type SharepicCreatorLocale,
} from '@gruenerator/contracts';

interface Nearest {
  label: string;
  /** Matched against the request, case-insensitively. */
  word: string;
  'de-DE': SharepicColor;
  'de-AT': SharepicColor;
}

// Light neutrals go to the light grounds (CD: hellgrau/mint in DE, weiss in AT);
// the other country's palette names to their counterpart.
const NEAREST: readonly Nearest[] = [
  { label: 'Sand', word: 'sand', 'de-DE': 'hellgrau', 'de-AT': 'weiss' },
  { label: 'Beige', word: 'beige', 'de-DE': 'hellgrau', 'de-AT': 'weiss' },
  { label: 'Creme', word: 'cr(?:e|è)me', 'de-DE': 'hellgrau', 'de-AT': 'weiss' },
  { label: 'Elfenbein', word: 'elfenbein', 'de-DE': 'hellgrau', 'de-AT': 'weiss' },
  { label: 'Grau', word: 'grau', 'de-DE': 'hellgrau', 'de-AT': 'weiss' },
  { label: 'Klee', word: 'klee', 'de-DE': 'grasgruen', 'de-AT': 'hellgruen' },
  { label: 'Schwarz', word: 'schwarz', 'de-DE': 'dunkeltanne', 'de-AT': 'dunkelgruen' },
  { label: 'Tanne', word: 'tanne', 'de-DE': 'tanne', 'de-AT': 'dunkelgruen' },
  { label: 'Dunkeltanne', word: 'dunkeltanne', 'de-DE': 'dunkeltanne', 'de-AT': 'dunkelgruen' },
  { label: 'Grasgrün', word: 'grasgr(?:ü|ue)n', 'de-DE': 'grasgruen', 'de-AT': 'hellgruen' },
  { label: 'Mint', word: 'mint', 'de-DE': 'mint', 'de-AT': 'hellgruen' },
  { label: 'Hellgrau', word: 'hellgrau', 'de-DE': 'hellgrau', 'de-AT': 'weiss' },
  { label: 'Dunkelgrün', word: 'dunkelgr(?:ü|ue)n', 'de-DE': 'tanne', 'de-AT': 'dunkelgruen' },
  { label: 'Hellgrün', word: 'hellgr(?:ü|ue)n', 'de-DE': 'mint', 'de-AT': 'hellgruen' },
];

const COLOR_LABELS: Record<SharepicColor, string> = {
  tanne: 'Tanne',
  dunkeltanne: 'Dunkeltanne',
  grasgruen: 'Grasgrün',
  mint: 'Mint',
  hellgrau: 'Hellgrau',
  dunkelgruen: 'Dunkelgrün',
  hellgruen: 'Hellgrün',
  weiss: 'Weiß',
};

/** A sentence about colour at all: "Sand" elsewhere is a topic, not a colour. */
const COLOUR_CONTEXT =
  /farb|f(?:ä|ae)rb|hintergrund|fl(?:ä|ae)che|(?<!\p{L})t(?:o|ö)ne?(?!\p{L})/iu;
const SUFFIX = '(?:farben|farbig|farbe|e[nmrs]?)?';

export interface PaletteSubstitution {
  /** As the person would name it. */
  asked: string;
  color: SharepicColor;
}

function plain(value: string): string {
  return value
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/è/g, 'e');
}

export function paletteSubstitutions(
  order: string,
  locale: SharepicCreatorLocale
): PaletteSubstitution[] {
  const allowed = SHAREPIC_LOCALE_COLORS[locale];
  const sentences = order.split(/[.!?\n]+/).filter((s) => COLOUR_CONTEXT.test(s));
  const found = new Map<string, PaletteSubstitution>();
  for (const entry of NEAREST) {
    const color = entry[locale];
    if (allowed.includes(plain(entry.label) as SharepicColor)) continue;
    const re = new RegExp(`(?<!\\p{L})${entry.word}${SUFFIX}(?!\\p{L})`, 'iu');
    if (sentences.some((s) => re.test(s))) found.set(entry.label, { asked: entry.label, color });
  }
  return [...found.values()];
}

/** For the draft prompt: the mapping, decided before the model writes. */
export function paletteHint(subs: readonly PaletteSubstitution[]): string {
  return subs
    .map(
      (s) =>
        `„${s.asked}“ gibt es im Sharepic-Baukasten nicht – nimm stattdessen \`${s.color}\` und schreib nie "${plain(s.asked)}".`
    )
    .join('\n');
}

/** For the person: what they asked for and what they got instead. */
export function paletteHinweis(subs: readonly PaletteSubstitution[]): string | null {
  if (!subs.length) return null;
  return subs
    .map(
      (s) =>
        `${s.asked} gibt es im Sharepic-Baukasten nicht – ich habe ${COLOR_LABELS[s.color]} genommen.`
    )
    .join(' ');
}

const COLOR_KEYS = new Set(['color', 'panelColor']);

/**
 * Replaces off-palette colour names under `color`/`panelColor` with their
 * nearest palette colour, so the enum check never sends the model round again
 * for a colour that does not exist. Unknown names stay for the validator.
 */
export function withPaletteColors(input: unknown, locale: SharepicCreatorLocale): unknown {
  const allowed = SHAREPIC_LOCALE_COLORS[locale];
  const nearest = (value: string): string => {
    const key = plain(value.trim());
    if (allowed.includes(key as SharepicColor)) return key;
    const entry = NEAREST.find((e) => new RegExp(`^${e.word}$`, 'iu').test(key));
    return entry ? entry[locale] : value;
  };
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (!node || typeof node !== 'object') return node;
    return Object.fromEntries(
      Object.entries(node).map(([k, v]) => [
        k,
        COLOR_KEYS.has(k) && typeof v === 'string' ? nearest(v) : walk(v),
      ])
    );
  };
  return walk(input);
}
