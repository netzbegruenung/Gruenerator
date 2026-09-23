import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// ProseMirror rechnet nach jeder Transaktion aus, ob es zur Auswahl scrollen
// muss, und fragt dafür `getClientRects` auf Knoten und Bereichen. jsdom
// kennt beides nicht (es macht kein Layout) und wirft — nicht im Test,
// sondern in der Transaktion, also als unbehandelter Fehler neben einem sonst
// grünen Lauf. Ein leerer Rechteck-Satz heißt für ProseMirror „nicht
// sichtbar, nichts zu scrollen"; gemessen wird in diesen Tests ohnehin nichts.
const emptyRects = () => Object.assign([] as unknown as DOMRectList, { item: () => null });
const emptyRect = () => new DOMRect(0, 0, 0, 0);

Range.prototype.getClientRects ??= emptyRects;
Range.prototype.getBoundingClientRect ??= emptyRect;
Element.prototype.getClientRects ??= emptyRects;

// Konva baut beim Erzeugen einer Bühne sofort ein Canvas und greift auf
// dessen 2D-Kontext zu. jsdom liefert dafür `null` (es rastert nicht), Konva
// stirbt an `Cannot read properties of null (reading 'scale')` — noch bevor
// irgendein Test etwas prüfen kann. `@napi-rs/canvas` rastert wirklich und
// ist ohnehin schon Abhängigkeit dieses Pakets (Vorschaubilder, Breitenmessung
// in `textUtils`), also bekommt jsdom dessen Kontext.
//
// Absicht ist NICHT, Pixel zu prüfen — nur, dass Bühne, Knoten und ihre
// Ereignisse existieren. Genau daran hängt der Doppelklick-Test.
const napi = await import('@napi-rs/canvas');
const originalGetContext = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function getContext(
  this: HTMLCanvasElement,
  contextId: string,
  ...rest: unknown[]
) {
  if (contextId === '2d') {
    // Ein Kontext je Element, sonst verliert Konva seine Zeichenfläche
    // zwischen zwei Aufrufen.
    const cached = contexts.get(this);
    if (cached) return cached;
    const context = napi.createCanvas(this.width || 1, this.height || 1).getContext('2d');
    contexts.set(this, context);
    return context;
  }
  return (originalGetContext as (...args: unknown[]) => unknown).call(this, contextId, ...rest);
} as HTMLCanvasElement['getContext'];
const contexts = new WeakMap<HTMLCanvasElement, unknown>();

// jsdom macht kein Layout und kennt deshalb keinen ResizeObserver.
// `CanvasStage` misst damit seine Fläche; ohne ihn stirbt schon das Mounten.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

afterEach(cleanup);
