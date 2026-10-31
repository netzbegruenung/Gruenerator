/**
 * Kleinteile, die Composer, Typtabelle und Deck-Stile gemeinsam brauchen. Eigene
 * Datei, damit `folienTypen` und `deckStile/` nicht über `slideDeck.ts`
 * importieren müssen (das selbst die Stile lädt).
 */

import { type SlideLayoutState } from './slideLayouts.js';

export const MAX_SLIDES = 30;
/** Die Fußzeile fasst gut 50 Zeichen. */
export const MAX_DECK_TITLE_CHARS = 50;

/**
 * Modelle escapen Zeilenumbrüche im Tool-JSON manchmal doppelt; ohne das stünde
 * „• Eins\n• Zwei" wörtlich auf der Folie (Live-Test 30.10.2026).
 */
export const unescapeLineBreaks = (s: string): string => s.replace(/\\n/g, '\n');

/** Ein Layout-Element samt seiner Id aus dem Zustand nehmen (Text, Form, Grafik …). */
export function removeElement(state: SlideLayoutState, id: string): void {
  state.additionalTexts = state.additionalTexts.filter((e) => e.id !== id);
  state.shapeInstances = state.shapeInstances.filter((e) => e.id !== id);
  state.assetInstances = state.assetInstances.filter((e) => e.id !== id);
  state.layerOrder = state.layerOrder.filter((e) => e !== id);
  state.lockedLayerIds = state.lockedLayerIds.filter((e) => e !== id);
}
