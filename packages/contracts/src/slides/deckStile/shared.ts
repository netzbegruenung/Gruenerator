/**
 * Gemeinsame Teile der Deck-Stile: Fußzeile, Störer, Listen, Hervorhebung
 * und das Befüllen der Slots nach Element-Id.
 */

import { SHAREPIC_COLOR_HEX, type BrandLocale } from '../../brand/grueneBrand.js';
import { folienSlotsOf, type FolieSpec } from '../folienTypen.js';
import { removeElement } from '../slideDeck.js';
import { slideKit, type SlideBuilder } from '../slideLayouts.js';

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

/**
 * `**Wort**` wird zu `==Wort==`: der Editor zeichnet nur Letzteres in der
 * Akzentfarbe des Grunds (`accent` am Text). Linearer Scan ohne Regex — der
 * Text stammt aus Modellausgaben. Ein Marker öffnet nur vor einem
 * Nicht-Leerzeichen und schließt nur hinter einem; Ungepaartes bleibt literal.
 */
export function emphasis(text: string): string {
  const parts = text.split('**');
  if (parts.length < 3) return text;
  let out = parts[0]!;
  for (let i = 1; i < parts.length; i += 2) {
    const inner = parts[i]!;
    const after = parts[i + 1];
    if (after === undefined) {
      out += `**${inner}`;
    } else if (inner.trim() !== '' && inner === inner.trim()) {
      out += `==${inner}==${after}`;
    } else {
      out += `**${inner}**${after}`;
    }
  }
  return out;
}

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

/** Der Störer: ein Kreis mit kurzem Text; der Text trägt die Slot-Id `folie-stoerer`. */
export function stoerer(b: SlideBuilder, text: string, cx: number, cy: number, fill: string) {
  const d = STOERER.diameter;
  b.shape('folie-stoerer-kreis', 'circle', cx, cy, d, d, fill);
  const size = 40;
  const lines = Math.min(3, Math.max(1, Math.ceil(text.length / 9)));
  b.text('folie-stoerer', text, cx - d * 0.4, cy - (lines * size) / 2, d * 0.8, size, {
    family: b.ink.headline,
    fill: SHAREPIC_COLOR_HEX.weiss,
    align: 'center',
    lineHeight: 1,
  });
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
 * Schreibt die Textslots in ihre Elemente (`**Wort**` → Akzent) und nimmt
 * Elemente nicht gegebener Slots mit samt `layerOrder`-Eintrag heraus.
 * Listen bauen die Stile selbst (`renderList`).
 */
export function applySlots(b: SlideBuilder, folie: FolieSpec) {
  const given: Record<string, string | string[] | undefined> = folie.slots;
  for (const [name, slot] of Object.entries(folienSlotsOf(folie.typ))) {
    if (slot.kind !== 'text') continue;
    const value = given[name];
    if (typeof value !== 'string' || value.trim() === '') {
      removeElement(b.state, slot.elementId);
      continue;
    }
    const target = b.state.additionalTexts.find((t) => t.id === slot.elementId);
    if (!target) continue;
    target.text = emphasis(value.trim());
    if (b.ink.accent && !target.accent) target.accent = b.ink.accent;
  }
}
