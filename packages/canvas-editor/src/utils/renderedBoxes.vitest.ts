import Konva from 'konva';
import { describe, expect, it } from 'vitest';

import { chartBox, frameBox, illustrationBox, shapeBox, userImageBox } from './renderedBoxes';
import { PATH_OFFSETS, PATH_VIEWBOX } from './shapeTransform';
import { boxFrame, createBoxFrame, frameBounds, snapByBounds, type SnapTarget } from './snapping';

import type { ChartInstance } from './chartUtils';
import type { FrameInstance } from './frameUtils';
import type { IllustrationInstance } from './illustrations/types';
import type { ShapeInstance } from './shapes';
import type { UserImageInstance } from './userImageUtils';
import type { RenderedBox } from '../hooks/useBoxSnap';

// Ziel mit linker Kante bei x = 600, weit weg von der Seitenmitte (540).
const EDGE: SnapTarget[] = [{ id: 'edge', x: 600, y: 900, width: 200, height: 200 }];

const frameOf = (b: RenderedBox) =>
  boxFrame(createBoxFrame(), b.x, b.y, b.width, b.height, b.rotation, b.pivot);

/** Rechte Kante der gedrehten Box 8 px vor 600: sie muss genau auf 600 landen. */
function snapsRightEdgeOnto600(box: RenderedBox) {
  const before = frameBounds(frameOf(box));
  const shifted = { ...box, x: box.x + (592 - (before.x + before.width)) };
  // Bühne so gross, dass die Seitenmitte (2000) nicht mitspielt.
  const result = snapByBounds(frameOf(shifted), EDGE, 4000, 4000);
  const after = frameBounds(frameOf({ ...shifted, x: result.x, y: result.y }));
  expect(result.snapH).toBe(true);
  expect(after.x + after.width).toBeCloseTo(600, 9);
  return before;
}

describe('gerenderte Box je Elementart, 90° gedreht', () => {
  it('Form (mittig): 100×50 wird 50 breit', () => {
    const shape = { x: 300, y: 300, width: 100, height: 50, scaleX: 1, scaleY: 1, rotation: 90 };
    expect(snapsRightEdgeOnto600(shapeBox(shape as ShapeInstance)).width).toBeCloseTo(50, 9);
  });

  it('Rahmen (mittig) mit Skala', () => {
    const frame = { x: 300, y: 300, width: 100, height: 50, scaleX: 2, scaleY: 2, rotation: 90 };
    expect(snapsRightEdgeOnto600(frameBox(frame as FrameInstance)).width).toBeCloseTo(100, 9);
  });

  it('Nutzerbild (oben links)', () => {
    const image = { x: 300, y: 300, width: 100, height: 50, scale: 1, rotation: 90 };
    const before = snapsRightEdgeOnto600(userImageBox(image as UserImageInstance));
    // Um die linke obere Ecke gedreht: die Box reicht von x − 50 bis x.
    expect(before.x).toBeCloseTo(250, 9);
    expect(before.width).toBeCloseTo(50, 9);
  });

  it('Diagramm (oben links) mit Skala', () => {
    const chart = { x: 300, y: 300, width: 100, height: 50, scale: 1.5, rotation: 90 };
    expect(snapsRightEdgeOnto600(chartBox(chart as ChartInstance)).width).toBeCloseTo(75, 9);
  });

  it('Illustration (mittig, quadratisch)', () => {
    const ill = { x: 300, y: 300, scale: 0.5, rotation: 90 };
    const box = illustrationBox(ill as IllustrationInstance);
    expect(box.pivot).toBe('centre');
    snapsRightEdgeOnto600({ ...box, rotation: 45 });
  });
});

describe('Pfad-Formen mit Ursprung ausserhalb der Mitte', () => {
  // So legt ShapePrimitive eine Pfad-Form an: 100er-Raster, Ursprung auf PATH_OFFSETS,
  // Skala = Grösse / 100, gespiegelt mit negativer Skala.
  const rendered = (type: 'mountain' | 'speech-round', flipY: boolean, rotation: number) => {
    const offset = PATH_OFFSETS[type];
    const node = new Konva.Rect({
      x: 300,
      y: 200,
      width: PATH_VIEWBOX,
      height: PATH_VIEWBOX,
      offsetX: offset.x,
      offsetY: offset.y,
      scaleX: 200 / PATH_VIEWBOX,
      scaleY: ((flipY ? -1 : 1) * 160) / PATH_VIEWBOX,
      rotation,
    });
    return node.getClientRect({ skipStroke: true, skipShadow: true });
  };

  it.each([
    ['mountain', false, 0],
    ['mountain', true, 0],
    ['speech-round', false, 30],
    ['speech-round', true, 90],
  ] as const)('%s, gespiegelt %s, %s°: Snap-Box = gezeichnete Box', (type, flipY, rotation) => {
    const shape = { type, x: 300, y: 200, width: 200, height: 160, scaleX: 1, scaleY: 1, rotation, flipY };
    const box = frameBounds(frameOf(shapeBox(shape as ShapeInstance)));
    const want = rendered(type, flipY, rotation);
    expect(box.x).toBeCloseTo(want.x, 6);
    expect(box.y).toBeCloseTo(want.y, 6);
    expect(box.width).toBeCloseTo(want.width, 6);
    expect(box.height).toBeCloseTo(want.height, 6);
  });
});
