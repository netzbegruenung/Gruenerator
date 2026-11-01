import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

import { editorDist } from './editorDist';

/**
 * Jeder Element-Transformer trägt `ELEMENT_TRANSFORMER` (Rotations-Snaps und
 * `flipEnabled: false`, sonst spiegelt ein über die Gegenseite gezogener Griff
 * das Element). Das Verhalten ist an der Quelle bewacht, weil ein vergessener
 * Transformer erst im Browser auffällt.
 */
const HIER = path.dirname(fileURLToPath(import.meta.url));
// Primitives of the installed @ggraphic/editor (compiled JS) are held to the same rule.
const PRIMITIVE_DIRS = [path.resolve(HIER, '../primitives'), editorDist('primitives')];

// Transformer, die kein Element-Transformer sind. Anzahl je Datei.
const AUSNAHMEN: Record<string, { anzahl: number; grund: string }> = {
  // Der Zuschneide-Transformer (rotateEnabled={false}) dreht nie; Snaps wären sinnlos.
  'UserImagePrimitive.tsx': { anzahl: 1, grund: 'Crop-Transformer ohne Rotation' },
};

const dateien = PRIMITIVE_DIRS.flatMap((dir) =>
  readdirSync(dir)
    .filter((f) => f.endsWith('.tsx') || (f.endsWith('.js') && !f.endsWith('.d.js')))
    .map((datei) => ({ datei, voll: path.join(dir, datei) }))
);

describe('Element-Transformer', () => {
  it('findet die Primitive beider Pakete', () => {
    expect(dateien.some((d) => d.voll.includes('@ggraphic'))).toBe(true);
  });

  for (const { datei, voll } of dateien) {
    const quelle = readFileSync(voll, 'utf8');
    const ausnahme = AUSNAHMEN[datei.replace(/\.js$/, '.tsx')];
    // Source is JSX; the installed package is compiled `_jsx(Transformer, { … })`.
    const transformer = (
      quelle.match(datei.endsWith('.js') ? /_jsxs?\(Transformer,/g : /<Transformer\b/g) ?? []
    ).length;
    if (transformer === 0) continue;

    it(`${datei} spreadet ELEMENT_TRANSFORMER und spiegelt nicht über Griffe`, () => {
      const erwartet = transformer - (ausnahme?.anzahl ?? 0);
      const spreads = (
        quelle.match(/\{\.\.\.ELEMENT_TRANSFORMER\}|\.\.\.ELEMENT_TRANSFORMER\b(?!\})/g) ?? []
      ).length;
      expect(spreads).toBe(erwartet);
      expect(quelle).not.toMatch(/rotationSnaps=\{\[|rotationSnaps: \[/);
      // Die Griffe stylt ELEMENT_TRANSFORMER (Touch-Rand, Seite des Drehgriffs);
      // ein eigenes anchorStyleFunc gibt es nur an den Ausnahmen.
      const eigene = (quelle.match(/anchorStyleFunc=\{|anchorStyleFunc:/g) ?? []).length;
      expect(eigene).toBe(ausnahme?.anzahl ?? 0);
      // Die Optik (Farbe, Größe, Form) setzt ELEMENT_TRANSFORMER für alle gleich;
      // nur die Ausnahmen tragen eigene Werte.
      const optik = (
        quelle.match(/(anchorSize|anchorCornerRadius|anchorStroke|anchorFill|borderStroke)[=:]/g) ??
        []
      ).length;
      expect(optik > 0).toBe(!!ausnahme);
    });
  }
});
