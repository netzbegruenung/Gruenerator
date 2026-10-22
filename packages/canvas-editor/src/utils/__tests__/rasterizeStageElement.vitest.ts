import { describe, expect, it } from 'vitest';

import { rasterizeStageElement } from '../captureStage';

import type Konva from 'konva';

/** Nur was `rasterizeStageElement` vom Stage liest; Konva selbst braucht in Node `canvas`. */
function fakeStage(toDataURL: () => string) {
  const item = {
    getAttr: (key: string) => (key === 'canvasItemId' ? 'foto' : undefined),
    isVisible: () => true,
    getClientRect: () => ({ x: 50, y: 100, width: 200, height: 100 }),
    toDataURL,
  };
  const stage = {
    find: (selector: string) => (selector === '.canvas-item' ? [item] : []),
    scaleX: () => 0.5,
    draw: () => {},
  };
  // Grenzfall-Cast: der Test reicht ein Ersatzobjekt mit genau diesen Methoden herein.
  return stage as unknown as Konva.Stage;
}

describe('rasterizeStageElement', () => {
  it('returns the picture with its box in page px', () => {
    const result = rasterizeStageElement(
      fakeStage(() => 'data:image/png;base64,AAAA'),
      'foto'
    );
    expect(result).toEqual({
      dataUrl: 'data:image/png;base64,AAAA',
      box: { x: 100, y: 200, width: 400, height: 200 },
    });
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
