// SPDX-License-Identifier: MPL-2.0
import { describe, expect, it } from 'vitest';

import {
  boxFrame,
  calculateCenteredSnapPosition,
  calculateElementSnapPosition,
  createBoxFrame,
  createSnapHysteresis,
  frameBounds,
  snapByBounds,
  snapEdgesByBounds,
  type SnapTarget,
} from '@ggraphic/editor/utils/snapping';

const STAGE_W = 1080;
const STAGE_H = 1350;

const TARGETS: SnapTarget[] = [
  { id: 'a', x: 100, y: 120, width: 300.5, height: 80.25 },
  { id: 'b', x: 640.3, y: 700.7, width: 200, height: 333.3 },
  { id: 'c', x: 40, y: 1100, width: 1000, height: 60 },
];

const SIZES: Array<[number, number]> = [
  [120, 80],
  [333.33, 47.1],
  [17, 517.9],
];

// 20 × 20 Positionen über die ganze Fläche, bewusst mit Nachkommastellen.
const GRID: Array<[number, number]> = [];
for (let i = 0; i < 20; i++) {
  for (let j = 0; j < 20; j++) {
    GRID.push([i * 53.7 + 0.1, j * 67.3 + 0.35]);
  }
}

describe('snapByBounds — Golden bei 0°', () => {
  it('liefert für oben links verankerte Elemente genau das Ergebnis von calculateElementSnapPosition', () => {
    const frame = createBoxFrame();
    for (const [w, h] of SIZES) {
      const legacyH = createSnapHysteresis();
      const nextH = createSnapHysteresis();
      for (const [x, y] of GRID) {
        const legacy = calculateElementSnapPosition(x, y, w, h, TARGETS, STAGE_W, STAGE_H, legacyH);
        const next = snapEdgesByBounds(
          boxFrame(frame, x, y, w, h, 0, 'top-left'),
          TARGETS,
          STAGE_W,
          STAGE_H,
          nextH
        );
        expect(next).toEqual(legacy);
        expect(nextH).toEqual(legacyH);
      }
    }
  });

  it('liefert für mittig verankerte Elemente genau das Ergebnis von calculateCenteredSnapPosition', () => {
    const frame = createBoxFrame();
    for (const [w, h] of SIZES) {
      const legacyH = createSnapHysteresis();
      const nextH = createSnapHysteresis();
      for (const [x, y] of GRID) {
        const legacy = calculateCenteredSnapPosition(
          x,
          y,
          w,
          h,
          TARGETS,
          STAGE_W,
          STAGE_H,
          legacyH
        );
        const next = snapEdgesByBounds(
          boxFrame(frame, x, y, w, h, 0, 'centre'),
          TARGETS,
          STAGE_W,
          STAGE_H,
          nextH
        );
        expect(next).toEqual(legacy);
        expect(nextH).toEqual(legacyH);
      }
    }
  });

  it('snapByBounds weicht nur ab, wo ein gleicher Abstand einrastet', () => {
    const frame = createBoxFrame();
    let spaced = 0;
    for (const pivot of ['top-left', 'centre'] as const) {
      for (const [w, h] of SIZES) {
        const edgesH = createSnapHysteresis();
        const nextH = createSnapHysteresis();
        for (const [x, y] of GRID) {
          const edges = snapEdgesByBounds(
            boxFrame(frame, x, y, w, h, 0, pivot),
            TARGETS,
            STAGE_W,
            STAGE_H,
            edgesH
          );
          const next = snapByBounds(
            boxFrame(frame, x, y, w, h, 0, pivot),
            TARGETS,
            STAGE_W,
            STAGE_H,
            nextH
          );
          if (next.snapLines.some((l) => l.kind === 'gap')) spaced++;
          else expect(next).toEqual(edges);
          expect(nextH).toEqual(edgesH);
        }
      }
    }
    // Das Raster trifft gleiche Abstände, aber selten.
    expect(spaced).toBeGreaterThan(0);
    expect(spaced).toBeLessThan(GRID.length);
  });

  it('meldet bei 0° die alte Box', () => {
    expect(frameBounds(boxFrame(createBoxFrame(), 10.1, 20.2, 30.3, 40.4, 0, 'top-left'))).toEqual({
      x: 10.1,
      y: 20.2,
      width: 30.3,
      height: 40.4,
    });
    expect(frameBounds(boxFrame(createBoxFrame(), 100, 200, 30.3, 40.4, 0, 'centre'))).toEqual({
      x: 100 - 30.3 / 2,
      y: 200 - 40.4 / 2,
      width: 30.3,
      height: 40.4,
    });
  });
});

describe('snapByBounds — gedreht', () => {
  // Ziel mit linker Kante bei x = 600; weit weg von der Bühnenmitte (540).
  const edge: SnapTarget[] = [{ id: 'edge', x: 600, y: 900, width: 200, height: 200 }];

  it('rastet ein 90° gedrehtes 100×50 (oben links verankert) mit seiner 50 breiten Box ein', () => {
    // Um den Ursprung gedreht reicht die Box von x-50 bis x. Rechte Kante bei 590
    // liegt 10 px vor der Zielkante; ungedreht (x + 100 = 640) wäre es keine.
    const frame = boxFrame(createBoxFrame(), 590, 300, 100, 50, 90, 'top-left');
    const bounds = frameBounds(frame);
    expect(bounds.width).toBeCloseTo(50, 9);
    expect(bounds.height).toBeCloseTo(100, 9);

    const result = snapByBounds(frame, edge, STAGE_W, STAGE_H, createSnapHysteresis());
    expect(result.snapH).toBe(true);
    // Rechte Kante der gedrehten Box (= Knoten-x) landet auf 600.
    expect(result.x).toBeCloseTo(600, 9);
    expect(result.snapLines.find((l) => l.orientation === 'vertical')?.position).toBe(600);
  });

  it('rastet ein 90° gedrehtes 100×50 (mittig verankert) mit seiner 50 breiten Box ein', () => {
    // Box: cx-25 … cx+25. Linke Kante 610 → 10 px rechts der Zielkante 600.
    // Ungedreht wäre die linke Kante 585, also 15 px, und ginge auf 600 → cx = 650.
    const frame = boxFrame(createBoxFrame(), 635, 300, 100, 50, 90, 'centre');
    const result = snapByBounds(frame, edge, STAGE_W, STAGE_H, createSnapHysteresis());
    expect(result.snapH).toBe(true);
    expect(result.x).toBeCloseTo(625, 9);
  });

  it('nimmt bei gespiegelter (negativer) Skalierung die Beträge', () => {
    const frame = boxFrame(createBoxFrame(), 100, 100, 40, 20, 0, 'top-left');
    frame.scaleX = -1;
    // Gespiegelt um den Ursprung: die Box reicht von x-40 bis x.
    expect(frameBounds(frame)).toEqual({ x: 60, y: 100, width: 40, height: 20 });
  });
});
