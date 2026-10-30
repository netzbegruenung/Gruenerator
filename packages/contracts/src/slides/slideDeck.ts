/**
 * Foliensatz der Chat-Präsentation: `composeSlideDeck` baut aus Folientypen
 * (`folienTypen.ts`) im gewählten Stil (`deckStile/`) die Canvas-Seiten,
 * `readFolie`/`readDeckStil` lesen sie zurück.
 */

import { type BrandLocale } from '../brand/grueneBrand.js';

import { buildFolie, deckStilBoxes, type DeckStilId, DECK_STIL_IDS } from './deckStile/index.js';
import { fitSlideTexts, type MeasureText } from './fitText.js';
import { type DeckSpec, type FolieSpec, folienSlotsOf, type FolienTypId } from './folienTypen.js';
import { slideLayoutConfigId, type SlideLayoutState } from './slideLayouts.js';

export interface ComposedSlidePage {
  id: string;
  configId: string;
  state: SlideLayoutState;
}

export interface ComposedSlideDeck {
  templateType: 'freeform' | 'freeform-at';
  pages: ComposedSlidePage[];
}

// ============================================================================
// FOLIENTYPEN IN EINEM STIL
// ============================================================================

export type ComposedDeck = ComposedSlideDeck & {
  /** Boxen, in die der Text auch bei kleinster Schrift nicht passt: `"<Foliennummer>:<Element-Id>"`. */
  overflow: string[];
};

/**
 * Baut die Seiten aus Folientypen im gewählten Stil. Jede Seite trägt den Stil
 * in `state.deckStil`. Mit `measure` wird zu langer Text in seine Box
 * geschrumpft (`fitSlideTexts`); was dann noch nicht passt, steht in `overflow`.
 */
export function composeSlideDeck(
  spec: DeckSpec,
  options: { locale: BrandLocale; date: Date; stil: DeckStilId; measure?: MeasureText | null }
): ComposedDeck {
  const templateType = slideLayoutConfigId(options.locale);
  const overflow: string[] = [];
  const pages = spec.slides.map((folie, index): ComposedSlidePage => {
    let state = buildFolie(options.stil, folie, {
      locale: options.locale,
      date: options.date,
      pageNumber: index + 1,
      title: spec.title,
      index,
    });
    if (options.measure) {
      const fitted = fitSlideTexts(state, deckStilBoxes(options.stil, folie.typ), options.measure);
      state = fitted.state;
      overflow.push(...fitted.overflow.map((id) => `${index + 1}:${id}`));
    }
    return { id: `seed-${index}`, configId: templateType, state };
  });
  return { templateType, pages, overflow };
}

// ============================================================================
// ZURÜCKLESEN
// ============================================================================

type TextEl = { id: string; text?: unknown };

function textsOf(state: Record<string, unknown>): Map<string, string> {
  const raw = state['additionalTexts'];
  const out = new Map<string, string>();
  if (!Array.isArray(raw)) return out;
  for (const t of raw as TextEl[]) {
    if (typeof t?.id === 'string' && typeof t.text === 'string') out.set(t.id, t.text);
  }
  return out;
}

function hasAsset(state: Record<string, unknown>, id: string): boolean {
  const raw = state['assetInstances'];
  return Array.isArray(raw) && (raw as TextEl[]).some((a) => a?.id === id);
}

function typOf(state: Record<string, unknown>, texts: Map<string, string>): FolienTypId | null {
  if (texts.has('folie-zahl')) return 'zahl';
  if (texts.has('folie-kernsatz')) return 'kernsatz';
  if (texts.has('folie-zitat')) return 'zitat';
  if (texts.has('folie-punkt-1')) return 'liste';
  if (texts.has('folie-spalte-1')) return 'text';
  if (hasAsset(state, 'folie-logo')) return 'danke';
  if (texts.has('folie-headline')) return 'titel';
  return null;
}

const DANKE_DEFAULT = 'Vielen Dank';
const BULLET = /^\s*[•·]\s*/;

/**
 * Liest eine Seite als Folie zurück: der Typ folgt den Element-Ids (in allen
 * Stilen gleich), die Slots sind die aktuellen Texte samt Inline-Marken. Alte
 * C/D-Seiten werden miterkannt (Textfolie → `text`, die zweite Spalte hängt
 * mit Zeilenumbruch an). Null, wenn die Seite keinem Typ gleicht.
 */
export function readFolie(state: Record<string, unknown>): FolieSpec | null {
  const texts = textsOf(state);
  const typ = typOf(state, texts);
  if (!typ) return null;

  const slots: Record<string, string | string[]> = {};
  for (const [name, slot] of Object.entries(folienSlotsOf(typ))) {
    if (slot.kind === 'list') {
      const items: string[] = [];
      for (let i = 1; i <= slot.maxItems; i++) {
        const value = texts.get(`${slot.elementIdPrefix}${i}`);
        const item = value?.replace(BULLET, '').trim();
        if (item) items.push(item);
      }
      if (items.length > 0) slots[name] = items;
      continue;
    }
    let value = texts.get(slot.elementId)?.trim();
    if (!value) continue;
    if (typ === 'text' && name === 'text') {
      const second = texts.get('folie-spalte-2')?.trim();
      if (second) value = `${value}\n${second}`;
    }
    // Der Standardtext der Schlussfolie ist kein Inhalt.
    if (typ === 'danke' && name === 'headline' && value === DANKE_DEFAULT) continue;
    slots[name] = value;
  }
  const notes = typeof state['notes'] === 'string' ? state['notes'].trim() : '';
  return { typ, slots, ...(notes ? { notes } : {}) } as FolieSpec;
}

/** Der gültige `deckStil` einer einzelnen Seite, sonst `null` (Seite aus der Zeit vor den Stilen). */
export function readPageStil(state: Record<string, unknown>): DeckStilId | null {
  const v = state['deckStil'];
  return typeof v === 'string' && (DECK_STIL_IDS as readonly string[]).includes(v)
    ? (v as DeckStilId)
    : null;
}

/**
 * Der Stil eines Decks: der erste gültige `deckStil` einer Seite, sonst der
 * der Canvas-Metadaten, sonst `'cd'` (Seiten aus der Zeit vor den Stilen).
 */
export function readDeckStil(
  pages: ReadonlyArray<{ state: Record<string, unknown> }>,
  canvasMeta?: Record<string, unknown> | null
): DeckStilId {
  const valid = (v: unknown): v is DeckStilId =>
    typeof v === 'string' && (DECK_STIL_IDS as readonly string[]).includes(v);
  for (const page of pages) {
    const v = page.state['deckStil'];
    if (valid(v)) return v;
  }
  const v = canvasMeta?.['deckStil'];
  return valid(v) ? v : 'cd';
}
