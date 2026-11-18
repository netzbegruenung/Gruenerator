/**
 * Which Grünerator-Vorlagen fit a design, and in what order the „Vorlagen" tab
 * shows them: only those of the design's format, the ones that look like the
 * design first — the same theme (a Pride design gets the Pride Vorlagen), the
 * same ground colour, as much photo, as many pages.
 *
 * The catalogue carries no colour analysis, and none is needed: a Vorlage's
 * spec names its grounds, a page's state holds its own.
 */
import { SHAREPIC_SOURCE_KEY, sharepicThemaSchema } from '@gruenerator/contracts';

import { SHAREPIC_COLOR_HEX } from '../composer/chromeParts';
import { SHAREPIC_THEMES } from '../composer/sharepicThemes';

import type {
  SharepicBackground,
  SharepicFormat,
  SharepicSeite,
  SharepicThema,
} from '@gruenerator/contracts';

export interface VorlageLike {
  spec: {
    format?: SharepicFormat;
    thema?: SharepicThema | null;
    slides: readonly { background: SharepicBackground; items: readonly { type: string }[] }[];
  };
}

interface PageLike {
  state: Record<string, unknown>;
}

interface Profile {
  /** Share of pages that show a photo, 0–1. */
  photo: number;
  /** The ground colour most pages share; null when no page has one. */
  color: string | null;
  pages: number;
  thema: SharepicThema | null;
}

/** Most frequent entry; the first one seen wins a tie. */
function dominant(colors: string[]): string | null {
  const counts = new Map<string, number>();
  for (const c of colors) counts.set(c, (counts.get(c) ?? 0) + 1);
  let best: string | null = null;
  for (const [c, n] of counts) if (best === null || n > counts.get(best)!) best = c;
  return best;
}

function vorlageProfile(vorlage: VorlageLike): Profile {
  const { slides } = vorlage.spec;
  const colors: string[] = [];
  let photos = 0;
  for (const { background, items } of slides) {
    if (background.kind === 'farbe') colors.push(SHAREPIC_COLOR_HEX[background.color]);
    else if (background.kind !== 'foto') colors.push(SHAREPIC_COLOR_HEX[background.panelColor]);
    if (background.kind !== 'farbe' || items.some((item) => item.type === 'bild')) photos++;
  }
  return {
    photo: photos / Math.max(slides.length, 1),
    color: dominant(colors),
    pages: slides.length,
    thema: vorlage.spec.thema ?? null,
  };
}

/**
 * A page's theme: what its composer source names, or — on a page without one —
 * the theme sign someone placed by hand (Progress Pride flag, EU stars).
 */
function pageThema(state: Record<string, unknown>): SharepicThema | null {
  const source = state[SHAREPIC_SOURCE_KEY] as { slide?: { thema?: unknown } } | undefined;
  const named = source?.slide?.thema;
  const parsed = sharepicThemaSchema.safeParse(named);
  if (parsed.success) return parsed.data;
  const assets = Array.isArray(state.assetInstances) ? state.assetInstances : [];
  const placed = (id: string) => assets.some((a) => (a as { assetId?: unknown })?.assetId === id);
  return (
    sharepicThemaSchema.options.find((t) => (SHAREPIC_THEMES[t].sign?.assets ?? []).some(placed)) ??
    null
  );
}

function deckProfile(pages: readonly PageLike[]): Profile {
  const colors: string[] = [];
  const themen: string[] = [];
  let photos = 0;
  for (const { state } of pages) {
    const thema = pageThema(state);
    if (thema) themen.push(thema);
    const photoGround = state.backgroundMode !== 'color' && Boolean(state.currentImageSrc);
    const placed = Array.isArray(state.userImageInstances) && state.userImageInstances.length > 0;
    if (photoGround || placed) photos++;
    if (!photoGround && typeof state.backgroundColor === 'string') {
      colors.push(state.backgroundColor.toLowerCase());
    }
  }
  return {
    photo: photos / Math.max(pages.length, 1),
    color: dominant(colors),
    pages: pages.length,
    thema: dominant(themen) as SharepicThema | null,
  };
}

/** CIELAB of a `#rgb`/`#rrggbb` colour (D65); null for anything else. */
function lab(color: string): [number, number, number] | null {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim())?.[1];
  if (!hex) return null;
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(full.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

/** Below this chroma a colour reads as grey/white: Hellgrau 0, Creme 4.8, Mint 9.7. */
const NEUTRAL_CHROMA = 6;

/**
 * How alike two grounds look, 0–1: mostly the hue (the greens belong
 * together, from Dunkeltanne to Mint), then the lightness. Neutrals match
 * neutrals; a neutral never shares a hue with a colour.
 */
export function colorSimilarity(a: string, b: string): number {
  const la = lab(a);
  const lb = lab(b);
  if (!la || !lb) return 0.5;
  const lightness = 1 - Math.abs(la[0] - lb[0]) / 100;
  const neutralA = Math.hypot(la[1], la[2]) < NEUTRAL_CHROMA;
  const neutralB = Math.hypot(lb[1], lb[2]) < NEUTRAL_CHROMA;
  let hue: number;
  if (neutralA || neutralB) {
    hue = neutralA && neutralB ? 1 : 0;
  } else {
    const delta = Math.abs(Math.atan2(la[2], la[1]) - Math.atan2(lb[2], lb[1])) * (180 / Math.PI);
    hue = 1 - Math.min(delta, 360 - delta) / 180;
  }
  return 0.6 * hue + 0.4 * lightness;
}

function score(design: Profile, vorlage: Profile): number {
  const color = design.color && vorlage.color ? colorSimilarity(design.color, vorlage.color) : 0.5;
  const photo = 1 - Math.abs(design.photo - vorlage.photo);
  const pages = 1 / (1 + Math.abs(design.pages - vorlage.pages));
  return 0.45 * color + 0.45 * photo + 0.1 * pages + themaScore(design.thema, vorlage.thema);
}

/**
 * The theme outweighs everything else: a Pride design lists the Pride
 * Vorlagen first, the other theme last; a plain design puts themed ones
 * behind its own kind without hiding them.
 */
function themaScore(design: SharepicThema | null, vorlage: SharepicThema | null): number {
  if (!vorlage) return 0;
  if (!design) return -0.3;
  return design === vorlage ? 1 : -1;
}

/** The Vorlagen most like the design first; equal ones keep the catalogue order. */
export function rankVorlagen<T extends VorlageLike>(
  vorlagen: readonly T[],
  pages: readonly PageLike[]
): T[] {
  const design = deckProfile(pages);
  return vorlagen
    .map((vorlage, index) => ({ vorlage, index, score: score(design, vorlageProfile(vorlage)) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.vorlage);
}

/** A Seite in a grid, with its place among the slides of its Vorlage. */
export interface SeiteTile {
  seite: SharepicSeite;
  n: number;
  of: number;
}

/**
 * The Seiten of the format, as the „Vorlagen" tab lists them. The slides of
 * one Vorlage stay together in their order and are ranked as one, the ones
 * most like the design first; groups of closing slides only go last.
 */
export function seitenFor(
  seiten: readonly SharepicSeite[],
  format: SharepicFormat,
  pages: readonly PageLike[],
  empty: boolean
): SeiteTile[] {
  const groups = new Map<string, SharepicSeite[]>();
  for (const seite of seiten) {
    if (!seite.formats.includes(format)) continue;
    const key = seite.quelle ? `vorlage:${seite.quelle.vorlage}` : `seite:${seite.id}`;
    const group = groups.get(key);
    if (group) group.push(seite);
    else groups.set(key, [seite]);
  }
  const entries = [...groups.values()].map((group) => {
    group.sort((a, b) => (a.quelle?.seite ?? 0) - (b.quelle?.seite ?? 0));
    return { group, spec: { format, thema: group[0]!.thema, slides: group.map((s) => s.slide) } };
  });
  const ranked = empty ? entries : rankVorlagen(entries, pages);
  const closing = ({ group }: (typeof entries)[number]) =>
    group.every((s) => s.rolle === 'schluss');
  return [...ranked.filter((e) => !closing(e)), ...ranked.filter(closing)].flatMap(({ group }) =>
    group.map((seite, i) => ({ seite, n: i + 1, of: group.length }))
  );
}

/** A slide's words, markup and case aside — two slides that say the same. */
const wordsOf = (items: unknown): string =>
  JSON.stringify(items ?? null)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/** The slides the design shows as composed: a copy of a Vorlage carries its slides on its pages. */
function shownSlides(pages: readonly PageLike[]): Set<string> {
  const shown = new Set<string>();
  for (const { state } of pages) {
    const source = state[SHAREPIC_SOURCE_KEY] as { slide?: { slides?: unknown } } | undefined;
    const slides = source?.slide?.slides;
    if (!Array.isArray(slides)) continue;
    for (const slide of slides) shown.add(wordsOf((slide as { items?: unknown }).items));
  }
  return shown;
}

/**
 * The Seiten the page picker offers for one page: the format's, each judged
 * on its own against the design (theme, ground colour, photo) — one page has
 * to fit, not a whole Vorlage. Without `titles` the title slides stay out:
 * a design that has its beginning needs a middle or an end. A Seite the
 * design already shows stays out too: a copy of a Vorlage would otherwise be
 * offered its own slides first, they look most like it.
 */
export function suggestSeiten(
  seiten: readonly SharepicSeite[],
  format: SharepicFormat,
  pages: readonly PageLike[],
  { count, titles }: { count: number; titles: boolean }
): SharepicSeite[] {
  const shown = shownSlides(pages);
  const fitting = seiten
    .filter(
      (seite) =>
        seite.formats.includes(format) &&
        (titles || seite.rolle !== 'titel') &&
        !shown.has(wordsOf(seite.slide.items))
    )
    .map((seite) => ({ seite, spec: { format, thema: seite.thema, slides: [seite.slide] } }));
  return rankVorlagen(fitting, pages)
    .slice(0, count)
    .map((entry) => entry.seite);
}
