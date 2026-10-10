/**
 * Zählt hoch, sobald ein Schriftschnitt fertig geladen ist.
 *
 * Konva misst beim Zeichnen und kann deshalb einfach neu gezeichnet werden,
 * wenn eine Schrift eintrifft — genau das tut `GenericCanvas` mit seinem
 * Zurücksetzen der Textknoten. Ein Textblock mit Auszeichnung wird dagegen auf
 * React-Seite vermessen (`layoutRichTextBlock` über `runMeasurer`) und das
 * Ergebnis gemerkt. Dessen Abhängigkeiten — Text, Breite, Schriftgrad — ändern
 * sich beim Nachladen nicht, also bliebe ein mit der Ersatzschrift berechneter
 * Umbruch für immer stehen, auch im Export.
 *
 * Der Zähler ist die fehlende Abhängigkeit. Er hängt an `loadingdone` (in WebKit
 * an `ready`, siehe unten), nicht an
 * einem einmaligen Tor: die Schnitte treffen einzeln ein, und jeder von ihnen
 * kann den Umbruch verschieben.
 *
 * Der Wert muss in die Messung HINEINGEREICHT werden (`runMeasurer(…, gen)`,
 * `calculateBalkenLayouts(…, gen)`), nicht bloß in der Deps-Liste eines
 * `useMemo` stehen: der React-Compiler (dom-Testlane und `vite build`) leitet
 * den Cache-Schlüssel aus dem ab, was der Körper liest, und streicht eine
 * Abhängigkeit, die nur in der Liste steht — auch `void gen` im Körper fällt
 * als toter Ausdruck weg. Gemessen am kompilierten Output, 18.09.2026.
 */
import { useSyncExternalStore } from 'react';

let generation = 0;
const listeners = new Set<() => void>();

function bump(): void {
  generation += 1;
  for (const notify of listeners) notify();
}

// Beim Import, nicht erst beim Abonnieren: `subscribe` läuft als passiver
// Effekt nach dem Zeichnen. Ein `loadingdone` im Fenster zwischen Rendern und
// Effekt fiele sonst aus, `generation` bliebe 0 — und genau dieses Ereignis
// ist das, weswegen es den Zähler gibt.
//
// WebKit (Safari, iOS-WebView) feuert `loading`, aber nie `loadingdone`;
// `ready` löst dort aber auf, sobald der Satz geladen ist (gemessen mit
// Playwright-WebKit, 10.10.2026, #4400). Ohne diesen Weg bliebe in Safari der
// mit der Ersatzschrift gemessene Umbruch stehen, sobald ein Schnitt nach der
// ersten Messung eintrifft. Wo `loadingdone` schon hochgezählt hat, zählt
// `ready` nicht noch einmal.
if (typeof document !== 'undefined' && document.fonts) {
  const fonts = document.fonts;
  const bumpWhenReady = () => {
    const seen = generation;
    void fonts.ready.then(() => {
      if (generation === seen) bump();
    });
  };
  fonts.addEventListener('loadingdone', bump);
  fonts.addEventListener('loading', bumpWhenReady);
  // Ein Laden, das vor dem Import begann (`preloadCanvasTemplate`), hat sein
  // `loading` schon gefeuert.
  if (fonts.status === 'loading') bumpWhenReady();
}

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

export function useFontGeneration(): number {
  return useSyncExternalStore(
    subscribe,
    () => generation,
    // Ohne DOM (Tests, SSR) lädt nichts nach.
    () => 0
  );
}
