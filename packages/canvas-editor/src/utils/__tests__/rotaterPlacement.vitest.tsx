import Konva from 'konva';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  ELEMENT_TRANSFORMER,
  chooseRotaterAngle,
  elementAnchorStyleFunc,
  rotaterRects,
} from '../orientation';

beforeAll(() => {
  Konva.autoDrawEnabled = false;
});

let stage: Konva.Stage | null = null;
afterEach(() => {
  stage?.destroy();
  stage = null;
});

/** Bühne = Seite (600 × 600), ein Element mit Element-Transformer. */
function setup(attrs: Konva.RectConfig) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  stage = new Konva.Stage({ container, width: 600, height: 600 });
  const layer = new Konva.Layer();
  stage.add(layer);
  const node = new Konva.Rect({
    width: 100,
    height: 100,
    offsetX: 50,
    offsetY: 50,
    ...attrs,
  });
  const tr = new Konva.Transformer({ ...ELEMENT_TRANSFORMER, rotateEnabled: true });
  layer.add(node, tr);
  tr.nodes([node]);
  return { node, tr };
}

const rotater = (tr: Konva.Transformer) => tr.findOne('.rotater')!.getAbsolutePosition();

describe('Drehgriff: Seite je Lage', () => {
  it('am Desktop über dem Element', () => {
    const { tr } = setup({ x: 300, y: 300 });
    expect(chooseRotaterAngle(tr, 'above')).toBe(0);
  });

  it('am Touch-Gerät unter dem Element, damit die Pille darüber frei bleibt', () => {
    const { tr } = setup({ x: 300, y: 300 });
    expect(chooseRotaterAngle(tr, 'below')).toBe(180);
  });

  it('ein horizontal gespiegelter Knoten hat ihn trotzdem sichtbar oben', () => {
    // Konva zerlegt scaleX < 0 als Drehung 180°: die Box-Oberkante liegt unten.
    const { node, tr } = setup({ x: 300, y: 300, scaleX: -1 });
    const angle = chooseRotaterAngle(tr, 'above');
    tr.rotateAnchorAngle(angle);
    tr.update();
    expect(rotater(tr).y).toBeLessThan(node.getClientRect().y);
  });
});

describe('elementAnchorStyleFunc', () => {
  it('setzt die Seite beim Anhängen an den Knoten', () => {
    const { node, tr } = setup({ x: 300, y: 300, scaleX: -1 });
    expect(ELEMENT_TRANSFORMER.anchorStyleFunc).toBe(elementAnchorStyleFunc);
    expect(tr.rotateAnchorAngle()).toBe(180);
    expect(rotater(tr).y).toBeLessThan(node.getClientRect().y);
  });
});

describe('rotaterRects', () => {
  it('liefert den sichtbaren Drehgriff jedes Transformers, für die Pille', () => {
    const { tr } = setup({ x: 300, y: 300 });
    const [rect] = rotaterRects(tr.getStage()!);
    expect(rect).toBeDefined();
    expect(rect!.y + rect!.height).toBeLessThan(250);
  });

  it('nicht bei gesperrtem Element', () => {
    const { tr } = setup({ x: 300, y: 300 });
    tr.rotateEnabled(false);
    expect(rotaterRects(tr.getStage()!)).toEqual([]);
  });
});
