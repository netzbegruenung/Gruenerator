// SPDX-License-Identifier: MPL-2.0
import { describe, expect, it } from 'vitest';

import { rasterizeStageElement } from '@ggraphic/editor/utils/captureStage';

import type Konva from 'konva';

/** Nur was `rasterizeStageElement` vom Stage liest; Konva selbst braucht in Node `canvas`. */
/**
 * Element bei Seiten-px (100, 200, 400 × 200) auf einem Stage mit Zoom 0,5 und
 * Verschiebung (30, -40): absolut liegt es bei (80, 60, 200 × 100).
 */
function fakeStage(toDataURL: (config: Record<string, unknown>) => string) {
  const stage = {
    find: (selector: string) => (selector === '.canvas-item' ? [item] : []),
    scaleX: () => 0.5,
    x: () => 30,
    y: () => -40,
    draw: () => {},
  };
  const item = {
    getAttr: (key: string) => (key === 'canvasItemId' ? 'foto' : undefined),
    isVisible: () => true,
    getClientRect: (config?: { relativeTo?: unknown }) =>
      config?.relativeTo === stage
        ? { x: 100, y: 200, width: 400, height: 200 }
        : { x: 80, y: 60, width: 200, height: 100 },
    toDataURL,
  };
  // Grenzfall-Cast: der Test reicht ein Ersatzobjekt mit genau diesen Methoden herein.
  return stage as unknown as Konva.Stage;
}

describe('rasterizeStageElement', () => {
  it('returns the picture with its box in page px on a zoomed, panned stage', () => {
    let cut: Record<string, unknown> | null = null;
    const result = rasterizeStageElement(
      fakeStage((config) => {
        cut = config;
        return 'blob:fixture-image';
      }),
      'foto'
    );
    expect(result).toEqual({
      dataUrl: 'blob:fixture-image',
      box: { x: 100, y: 200, width: 400, height: 200 },
    });
    // geschnitten wird in Stage-Koordinaten, gerendert mit 2 × Seiten-px
    expect(cut).toMatchObject({ x: 80, y: 60, width: 200, height: 100, pixelRatio: 4 });
  });

  it('returns null for an id no group carries', () => {
    expect(
      rasterizeStageElement(
        fakeStage(() => 'x'),
        'weg'
      )
    ).toBeNull();
  });

  it('returns null instead of throwing on a tainted canvas', () => {
    const tainted = fakeStage(() => {
      throw new DOMException('The canvas has been tainted', 'SecurityError');
    });
    expect(rasterizeStageElement(tainted, 'foto')).toBeNull();
  });
});
