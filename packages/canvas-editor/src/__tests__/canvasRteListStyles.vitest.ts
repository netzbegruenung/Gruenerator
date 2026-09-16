import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

/**
 * Die Kurzform `list-style` setzt jede Langform, die sie nicht nennt, auf
 * deren Anfangswert zurück — auch `list-style-position`. Genau das stand hier:
 *
 *   .canvas-rte__content ul, ol { list-style-position: inside }
 *   .canvas-rte__content ul     { list-style: disc }      ← wieder `outside`
 *
 * Wirkung im Browser (gemessen, nicht vermutet): `getComputedStyle(ul)
 * .listStylePosition` kam als `outside` zurück, und weil `padding-left` auf 0
 * stand, malte der Browser den Punkt LINKS NEBEN das Feld statt hinein.
 *
 * Kein jsdom-Test sieht das: cssstyle löst die Kurzform gar nicht erst auf,
 * ein `getComputedStyle` dort bestätigte fröhlich das Gegenteil. Deshalb
 * bewacht dieser Test die Quelle.
 */
const HIER = path.dirname(fileURLToPath(import.meta.url));
const CSS = path.resolve(HIER, '../canvas-editor.css');

/** Alle Regelblöcke, deren Selektor eine Liste im Editor-Inhalt trifft. */
function listenRegeln(css: string): string[] {
  return [...css.matchAll(/([^{}]*\.canvas-rte__content\s+(?:ul|ol)[^{}]*)\{([^}]*)\}/g)].map(
    (treffer) => treffer[2]!
  );
}

describe('Aufzählungen im Rich-Text-Feld', () => {
  const css = readFileSync(CSS, 'utf8');
  const regeln = listenRegeln(css);

  it('werden überhaupt gestaltet', () => {
    // Ohne diese Zusicherung wäre der Test ab dem nächsten Umbau blind.
    expect(regeln.length).toBeGreaterThanOrEqual(3);
  });

  it('setzen den Markertyp mit der Langform, nicht mit der Kurzform', () => {
    const mitKurzform = regeln.filter((block) => /(^|[;\s])list-style\s*:/.test(block));

    expect(
      mitKurzform,
      `list-style-position wird zurückgesetzt in: ${mitKurzform.join(' | ')}`
    ).toEqual([]);
    expect(regeln.some((block) => /list-style-type\s*:/.test(block))).toBe(true);
  });

  it('tragen den gemessenen Einzug des Overlays als Polsterung', () => {
    // Der Marker sitzt bei `outside` in der Polsterung — also INNERHALB des
    // Feldes, sobald diese nicht 0 ist. Die Breite reicht `CanvasTextOverlay`
    // herein; sie ist dieselbe, mit der `layoutRichTextBlock` umbricht.
    expect(
      regeln.some((block) => /padding-left:\s*var\(--canvas-rte-list-indent/.test(block))
    ).toBe(true);
  });
});
