/**
 * Deck-Stile: ein Stil macht aus einer typisierten Folie (`FolieSpec`) den
 * Seitenzustand der Canvas-Seite. Die Slot-Element-Ids gelten in allen Stilen
 * gleich (`folienTypen.ts`); der Stil entscheidet nur über Aussehen und Raster.
 * Welcher Stil eine Seite gebaut hat, steht in `state.deckStil`.
 */

import { type FolieSpec, type FolienTypId } from '../folienTypen.js';
import { type SlideLayoutState } from '../slideLayouts.js';

import { buildCd, CD_BOXES } from './cd.js';
import { type DeckStilCtx } from './shared.js';

export { type DeckStilCtx } from './shared.js';

export const DECK_STILE = [
  { id: 'cd', label: 'Grünes CD' },
  { id: 'ruhig', label: 'Ruhig' },
  { id: 'band', label: 'Band' },
  { id: 'kacheln', label: 'Kacheln' },
  { id: 'aussage', label: 'Aussage' },
] as const;

export type DeckStilId = (typeof DECK_STILE)[number]['id'];

export const DECK_STIL_IDS = DECK_STILE.map((s) => s.id) as [DeckStilId, ...DeckStilId[]];

export interface DeckStilBox {
  maxHeight: number;
  minScale: number;
}

export function buildFolie(stil: DeckStilId, folie: FolieSpec, ctx: DeckStilCtx): SlideLayoutState {
  switch (stil) {
    case 'cd':
      return buildCd(folie, ctx);
    // 3b: ruhig, band, kacheln und aussage kommen mit der nächsten Lieferung.
    case 'ruhig':
    case 'band':
    case 'kacheln':
    case 'aussage':
      throw new Error('stil not built yet');
  }
}

/**
 * Die Textboxen, in die Aufgabe 4 zu langen Text hineinschrumpft: Element-Id →
 * höchste Höhe in Folien-px und kleinster Maßstab (Überschriften 0,6).
 */
export function deckStilBoxes(stil: DeckStilId, typ: FolienTypId): Record<string, DeckStilBox> {
  switch (stil) {
    case 'cd':
      return CD_BOXES[typ];
    // 3b
    case 'ruhig':
    case 'band':
    case 'kacheln':
    case 'aussage':
      throw new Error('stil not built yet');
  }
}
