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
const PRIMITIVES = path.resolve(HIER, '../primitives');

// Transformer, die kein Element-Transformer sind. Anzahl je Datei.
const AUSNAHMEN: Record<string, { anzahl: number; grund: string }> = {
  // Der Zuschneide-Transformer (rotateEnabled={false}) dreht nie; Snaps wären sinnlos.
  'UserImagePrimitive.tsx': { anzahl: 1, grund: 'Crop-Transformer ohne Rotation' },
};

const dateien = readdirSync(PRIMITIVES).filter((f) => f.endsWith('.tsx'));

describe('Element-Transformer', () => {
  for (const datei of dateien) {
    const quelle = readFileSync(path.join(PRIMITIVES, datei), 'utf8');
    const transformer = (quelle.match(/<Transformer\b/g) ?? []).length;
    if (transformer === 0) continue;

    it(`${datei} spreadet ELEMENT_TRANSFORMER und spiegelt nicht über Griffe`, () => {
      const erwartet = transformer - (AUSNAHMEN[datei]?.anzahl ?? 0);
      const spreads = (quelle.match(/\{\.\.\.ELEMENT_TRANSFORMER\}/g) ?? []).length;
      expect(spreads).toBe(erwartet);
      expect(quelle).not.toMatch(/rotationSnaps=\{\[/);
      expect(quelle).not.toMatch(/flipEnabled=\{transformConfig\?\.flipEnabled/);
      // Die Griffe stylt ELEMENT_TRANSFORMER (Touch-Rand, Seite des Drehgriffs);
      // ein eigenes anchorStyleFunc gibt es nur an den Ausnahmen.
      const eigene = (quelle.match(/anchorStyleFunc=\{/g) ?? []).length;
      expect(eigene).toBe(AUSNAHMEN[datei]?.anzahl ?? 0);
    });
  }
});
