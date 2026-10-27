import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

/**
 * Jeder Element-Transformer trägt `ELEMENT_TRANSFORMER` (Rotations-Snaps und
 * `flipEnabled: false`, sonst spiegelt ein über die Gegenseite gezogener Griff
 * das Element). Das Verhalten ist an der Quelle bewacht, weil ein vergessener
 * Transformer erst im Browser auffällt.
 */
const HIER = path.dirname(fileURLToPath(import.meta.url));
// Primitives that moved to @ggraphic/editor are held to the same rule.
const PRIMITIVE_DIRS = [
  path.resolve(HIER, '../primitives'),
  path.resolve(HIER, '../../../ggraphic-editor/src/primitives'),
];

// Transformer, die kein Element-Transformer sind. Anzahl je Datei.
const AUSNAHMEN: Record<string, { anzahl: number; grund: string }> = {
  // Der Zuschneide-Transformer (rotateEnabled={false}) dreht nie; Snaps wären sinnlos.
  'UserImagePrimitive.tsx': { anzahl: 1, grund: 'Crop-Transformer ohne Rotation' },
};

const dateien = PRIMITIVE_DIRS.flatMap((dir) =>
  readdirSync(dir)
    .filter((f) => f.endsWith('.tsx'))
    .map((datei) => ({ datei, voll: path.join(dir, datei) }))
);

describe('Element-Transformer', () => {
  it('findet die Primitive beider Pakete', () => {
    expect(dateien.some((d) => d.voll.includes('ggraphic-editor'))).toBe(true);
  });

  for (const { datei, voll } of dateien) {
    const quelle = readFileSync(voll, 'utf8');
    const transformer = (quelle.match(/<Transformer\b/g) ?? []).length;
    if (transformer === 0) continue;

    it(`${datei} spreadet ELEMENT_TRANSFORMER und spiegelt nicht über Griffe`, () => {
      const erwartet = transformer - (AUSNAHMEN[datei]?.anzahl ?? 0);
      const spreads = (quelle.match(/\{\.\.\.ELEMENT_TRANSFORMER\}/g) ?? []).length;
      expect(spreads).toBe(erwartet);
      expect(quelle).not.toMatch(/rotationSnaps=\{\[/);
      // Die Griffe stylt ELEMENT_TRANSFORMER (Touch-Rand, Seite des Drehgriffs);
      // ein eigenes anchorStyleFunc gibt es nur an den Ausnahmen.
      const eigene = (quelle.match(/anchorStyleFunc=\{/g) ?? []).length;
      expect(eigene).toBe(AUSNAHMEN[datei]?.anzahl ?? 0);
      // Die Optik (Farbe, Größe, Form) setzt ELEMENT_TRANSFORMER für alle gleich;
      // nur die Ausnahmen tragen eigene Werte.
      const optik = (
        quelle.match(/(anchorSize|anchorCornerRadius|anchorStroke|anchorFill|borderStroke)=/g) ?? []
      ).length;
      expect(optik > 0).toBe(!!AUSNAHMEN[datei]);
    });
  }
});
