/**
 * Gemeinsame Teile der Deck-Stile: Fußzeile, Störer, Listen, Hervorhebung
 * und das Befüllen der Slots nach Element-Id.
 */

import {
  getBrandPack,
  getBrandTheme,
  HELLGRUEN_GLOW,
  SHAREPIC_COLOR_HEX,
  type BrandLocale,
} from '../../brand/grueneBrand.js';
import { folienSlotsOf, type FolieSpec } from '../folienTypen.js';
import { removeElement } from '../slideDeckBasics.js';
import { slideKit, type SlideBuilder } from '../slideLayouts.js';

import { type DeckStilId } from './index.js';

export interface DeckStilCtx {
  locale: BrandLocale;
  date: Date;
  /** Nummer der Folie, unten rechts. */
  pageNumber: number;
  /** Titel des Decks, in der Fußzeile. */
  title: string;
  /** Null-basierte Position im Deck; steuert den Grundwechsel in `aussage`. */
  index: number;
}

const { W, M, FOOTER, STOERER } = slideKit;

export function footer(b: SlideBuilder, ctx: DeckStilCtx) {
  const date = new Intl.DateTimeFormat(ctx.locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(ctx.date);
  b.text('folie-datum', date, M, FOOTER.y, 600, FOOTER.size);
  b.text('folie-titel', ctx.title, 864, FOOTER.y, 600, FOOTER.size);
  b.text('folie-seitenzahl', String(ctx.pageNumber), W - M - 200, FOOTER.y, 200, FOOTER.size, {
    align: 'right',
  });
}

/**
 * Der Störer wie im CD-Layout: `folie-stoerer` ist der Kreis, `folie-stoerer-text`
 * der Text (Slot-Id). Ohne Text entfallen beide.
 */
export function stoerer(b: SlideBuilder, text: string, cx: number, cy: number, fill: string) {
  const value = text.trim();
  if (value === '') {
    removeElement(b.state, 'folie-stoerer');
    removeElement(b.state, 'folie-stoerer-text');
    return;
  }
  const d = STOERER.diameter;
  b.shape('folie-stoerer', 'circle', cx, cy, d, d, fill);
  const lines = Math.min(3, Math.max(1, Math.ceil(value.length / 9)));
  b.text(
    'folie-stoerer-text',
    value,
    cx - d * 0.43,
    cy - (lines * STOERER.size) / 2,
    d * 0.86,
    STOERER.size,
    {
      family: b.ink.headline,
      fill: SHAREPIC_COLOR_HEX.weiss,
      align: 'center',
      lineHeight: 1,
    }
  );
}

/** Magenta, in `aussage` Grasgrün: der Aufrufer nennt die Farbe. */
export const STOERER_MAGENTA = slideKit.STOERER_FILL.magenta;

interface ListOptions {
  x: number;
  y: number;
  width: number;
  size: number;
  /** Abstand von Punkt zu Punkt (Oberkante zu Oberkante). */
  pitch: number;
  prefix?: string;
}

/** Eine Spalte `folie-punkt-1` … `folie-punkt-n`, je Punkt ein Textelement. */
export function renderList(b: SlideBuilder, items: readonly string[], o: ListOptions) {
  items.forEach((item, i) => {
    b.text(
      `folie-punkt-${i + 1}`,
      `${o.prefix ?? '• '}${item}`,
      o.x,
      o.y + i * o.pitch,
      o.width,
      o.size,
      {
        lineHeight: 1.25,
      }
    );
  });
}

export function renameElement(b: SlideBuilder, from: string, to: string) {
  const el = b.state.additionalTexts.find((t) => t.id === from);
  if (el) el.id = to;
  b.state.layerOrder = b.state.layerOrder.map((id) => (id === from ? to : id));
}

export function textOf(b: SlideBuilder, id: string) {
  const el = b.state.additionalTexts.find((t) => t.id === id);
  if (!el) throw new Error(`element ${id} fehlt`);
  return el;
}

/** Die Punkte einer Liste aus dem Spec; fehlt der Slot, ist sie leer. */
export function listItems(folie: FolieSpec, name: string): string[] {
  const given: Record<string, string | string[] | undefined> = folie.slots;
  const v = given[name];
  return Array.isArray(v) ? v.map((s) => s.trim()).filter((s) => s !== '') : [];
}

/**
 * Schreibt die Textslots in ihre Elemente (`==Wort==` → Akzent) und nimmt
 * Elemente nicht gegebener Slots mit samt `layerOrder`-Eintrag heraus.
 * Listen bauen die Stile selbst (`renderList`).
 */
export function applySlots(b: SlideBuilder, folie: FolieSpec) {
  const given: Record<string, string | string[] | undefined> = folie.slots;
  for (const [name, slot] of Object.entries(folienSlotsOf(folie.typ))) {
    if (slot.kind !== 'text') continue;
    const value = given[name];
    if (typeof value !== 'string' || value.trim() === '') {
      if (!slot.keepDefault) removeElement(b.state, slot.elementId);
      continue;
    }
    const target = b.state.additionalTexts.find((t) => t.id === slot.elementId);
    if (!target) continue;
    target.text = value.trim();
    if (b.ink.accent && !target.accent) target.accent = b.ink.accent;
  }
}

// ============================================================================
// FARBEN, SCHRIFTGRÖSSEN UND KLEINTEILE DER VIER NEUEN STILE
// ============================================================================

export type Ink = ReturnType<typeof slideKit.inkFor>;

/** Die Töne der Entwürfe (Tanne, Dunkeltanne, Lime, Grasgrün, Klee, Sand) je Land. */
export interface Tones {
  tanne: string;
  dunkel: string;
  /** Akzent auf dunklem Grund: DE Lime, AT Gelb. */
  lime: string;
  /** Flächen in Grasgrün: AT Hellgrün. */
  gras: string;
  /** Grasgrün als Schriftfarbe auf Dunkel: AT Gelb, weil Hellgrün dort nur etwa 2,5:1 hält. */
  grasText: string;
  /** Mittleres Grün für hervorgehobene Kacheln. */
  klee: string;
  /** Helle Fläche: DE Sand, AT Weiß. */
  sand: string;
}

export function tonesOf(locale: BrandLocale): Tones {
  const pack = getBrandPack(locale);
  if (locale === 'de-AT') {
    return {
      tanne: pack.colors.primary,
      // Das Brandpack kennt kein dunkleres Grün; die dunkelste Stufe der Hellgrün-Glut ist es.
      dunkel: HELLGRUEN_GLOW[2],
      lime: pack.colors.accent,
      gras: pack.colors.secondary,
      grasText: pack.colors.accent,
      klee: HELLGRUEN_GLOW[0],
      sand: pack.colors.surface,
    };
  }
  return {
    tanne: pack.colors.primary,
    dunkel: SHAREPIC_COLOR_HEX.dunkeltanne,
    lime: '#BEFF60',
    gras: pack.colors.attention,
    grasText: pack.colors.attention,
    klee: pack.colors.accent,
    sand: pack.colors.surface,
  };
}

/** Schriftarten und Logo-Fassung nach `inkFor`, Grund und Akzent nach dem Entwurf. */
export function stilInk(locale: BrandLocale, light: boolean, ground: string): Ink {
  const base = slideKit.inkFor(locale, light ? 'hell' : 'dunkel');
  const theme = getBrandTheme(locale);
  return {
    ...base,
    ground,
    accent: { fill: light ? theme.colors.accentOnLight : tonesOf(locale).lime },
  };
}

/** Gotham Ultra läuft breiter als GrueneTypeNeue: große Überschriften sind in AT kleiner. */
export function fs(locale: BrandLocale, size: number) {
  return locale === 'de-AT' ? Math.round(size * 0.85) : size;
}

/** Eine Überschrift mit eigener Farbe und engem Zeilenabstand (die Entwürfe setzen .96–1). */
export function head(
  b: SlideBuilder,
  id: string,
  x: number,
  y: number,
  width: number,
  size: number,
  fill?: string,
  value = ''
) {
  b.text(id, value, x, y, width, size, {
    type: 'header',
    family: b.ink.headline,
    lineHeight: 1,
    ...(fill ? { fill } : {}),
  });
}

/** `#rrggbb` mit Deckkraft als `rgba(...)`, für Linien aus dem Textton. */
export function rgba(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/** Der Störertext des Specs (titel, liste); leer, wenn keiner gegeben ist. */
export function stoererOf(folie: FolieSpec): string {
  const given: Record<string, string | string[] | undefined> = folie.slots;
  const v = given['stoerer'];
  return typeof v === 'string' ? v.trim() : '';
}

/** Das Logo der Schlussfolie wie im CD: DE Wortmarke 390 breit, AT Logo mit Claim 260 breit. */
export function logoOben(b: SlideBuilder, locale: BrandLocale, x: number, assetId: string) {
  if (locale === 'de-AT') b.asset('folie-logo', assetId, x + 130, 174, 260);
  else b.asset('folie-logo', assetId, x + 195, 164, 390);
}

/** Slots füllen, Fußzeile, Stil-Kennung und Notizen: das Ende jedes Stil-Builders. */
export function finishFolie(b: SlideBuilder, folie: FolieSpec, ctx: DeckStilCtx, stil: DeckStilId) {
  applySlots(b, folie);
  footer(b, ctx);
  b.state.deckStil = stil;
  b.state.notes = folie.notes?.trim() ?? '';
  return b.state;
}
