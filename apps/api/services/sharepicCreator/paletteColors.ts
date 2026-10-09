/**
 * Colours a person asks for that the sharepic palette does not have.
 *
 * Live (07.10.2026) "Hintergrund auf Sand" ran the draft 2–3 times into the
 * colour enum and then fell back to hellgrau without a word. The closest
 * colour is decided here instead, told to the model up front, forced onto
 * any off-palette value the model still writes, and reported to the person.
 */
import {
  isSharepicUploadId,
  SHAREPIC_COLOR_LABELS,
  SHAREPIC_LOCALE_COLORS,
  type SharepicColor,
  type SharepicCreatorLocale,
  type SharepicSpec,
} from '@gruenerator/contracts';

interface Nearest {
  /** Matched against the request, case-insensitively. */
  word: string;
  'de-DE': SharepicColor;
  'de-AT': SharepicColor;
}

// Light neutrals go to the light grounds (CD: hellgrau/mint in DE, weiss in AT),
// dark ones to the darkest green; the other country's palette names to their
// counterpart. Compounds first: "dunkelgrau" is no light grey.
const NEAREST: readonly Nearest[] = [
  { word: 'dunkelgrau', 'de-DE': 'dunkeltanne', 'de-AT': 'dunkelgruen' },
  { word: 'mintgr(?:ü|ue)n', 'de-DE': 'mint', 'de-AT': 'hellgruen' },
  { word: 'dunkeltanne', 'de-DE': 'dunkeltanne', 'de-AT': 'dunkelgruen' },
  { word: 'grasgr(?:ü|ue)n', 'de-DE': 'grasgruen', 'de-AT': 'hellgruen' },
  { word: 'hellgrau', 'de-DE': 'hellgrau', 'de-AT': 'weiss' },
  { word: 'dunkelgr(?:ü|ue)n', 'de-DE': 'tanne', 'de-AT': 'dunkelgruen' },
  { word: 'hellgr(?:ü|ue)n', 'de-DE': 'mint', 'de-AT': 'hellgruen' },
  { word: 'sand', 'de-DE': 'creme', 'de-AT': 'weiss' },
  { word: 'beige', 'de-DE': 'creme', 'de-AT': 'weiss' },
  { word: 'cr(?:e|è)me', 'de-DE': 'creme', 'de-AT': 'weiss' },
  { word: 'elfenbein', 'de-DE': 'creme', 'de-AT': 'weiss' },
  { word: 'grau', 'de-DE': 'hellgrau', 'de-AT': 'weiss' },
  { word: 'klee', 'de-DE': 'grasgruen', 'de-AT': 'hellgruen' },
  { word: 'schwarz', 'de-DE': 'dunkeltanne', 'de-AT': 'dunkelgruen' },
  { word: 'tanne', 'de-DE': 'tanne', 'de-AT': 'dunkelgruen' },
  { word: 'mint', 'de-DE': 'mint', 'de-AT': 'hellgruen' },
];

/** Shade words that keep a colour's family: "sandbeige", "zartmint". */
const PREFIX = '(?:hell|zart|pastell|licht|warm|kalt|sand|cr(?:e|è)me|beige|mint)?';

/** The deck's current backgrounds in words, for an answer about an unchanged edit. */
export function describeBackgrounds(spec: SharepicSpec): string {
  const words = spec.slides.map((slide) => {
    const bg = slide.background;
    if (bg.kind === 'farbe') return SHAREPIC_COLOR_LABELS[bg.color];
    const photo = isSharepicUploadId(bg.filename) ? 'eigenes Foto' : 'Foto';
    return bg.kind === 'foto'
      ? photo
      : `${photo} mit Fläche ${SHAREPIC_COLOR_LABELS[bg.panelColor]}`;
  });
  const same = words.every((w) => w === words[0]);
  return same
    ? `Aktueller Hintergrund: ${words[0]}.`
    : `Aktueller Hintergrund: ${words.map((w, i) => `Folie ${i + 1} ${w}`).join(', ')}.`;
}

/** A sentence about colour at all: "Sand" elsewhere is a topic, not a colour. */
const COLOUR_CONTEXT =
  /farb|f(?:ä|ae)rb|hintergrund|fl(?:ä|ae)che|(?<!\p{L})t(?:o|ö)ne?(?!\p{L})/iu;
const SUFFIX = '(?:farb(?:en|ig|e)?)?(?:e?[nmrs]|e)?';

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

function nearestOf(core: string): Nearest | null {
  const key = plain(core);
  return NEAREST.find((e) => new RegExp(`^${PREFIX}${e.word}$`, 'iu').test(key)) ?? null;
}

export function paletteSubstitutions(
  order: string,
  locale: SharepicCreatorLocale
): PaletteSubstitution[] {
  const allowed = SHAREPIC_LOCALE_COLORS[locale];
  const words = NEAREST.map((e) => e.word).join('|');
  const re = new RegExp(`(?<!\\p{L})(${PREFIX}(?:${words}))${SUFFIX}(?!\\p{L})`, 'giu');
  const found = new Map<string, PaletteSubstitution>();
  for (const sentence of order.split(/[.!?\n]+/)) {
    if (!COLOUR_CONTEXT.test(sentence)) continue;
    for (const match of sentence.matchAll(re)) {
      const core = match[1]!;
      if (allowed.includes(plain(core) as SharepicColor)) continue;
      const entry = nearestOf(core);
      if (!entry) continue;
      const asked = core.charAt(0).toUpperCase() + core.slice(1).toLowerCase();
      found.set(plain(core), { asked, color: entry[locale] });
    }
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
        `${s.asked} gibt es im Sharepic-Baukasten nicht – ich habe ${SHAREPIC_COLOR_LABELS[s.color]} genommen.`
    )
    .join(' ');
}

/** A result the person did not get (nothing changed) must not claim the swap. */
export function withoutPaletteHinweis(hinweis: string | null): string | null {
  if (!hinweis) return null;
  const rest = hinweis
    .replace(/[^.]*? gibt es im Sharepic-Baukasten nicht – ich habe [^.]*? genommen\.\s*/g, '')
    .trim();
  return rest || null;
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
    const entry = nearestOf(key);
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
