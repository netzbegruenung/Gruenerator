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

  it('nahe der Oberkante wandert er nach unten (D3)', () => {
    const { tr } = setup({ x: 300, y: 70 });
    expect(chooseRotaterAngle(tr, 'above')).toBe(180);
  });

  it('nahe der Unterkante bleibt er auch am Touch-Gerät oben', () => {
    const { tr } = setup({ x: 300, y: 530 });
    expect(chooseRotaterAngle(tr, 'below')).toBe(0);
  });

  it('passt weder oben noch unten, steht er an der Seite', () => {
    const { tr } = setup({ x: 300, y: 300, height: 560, offsetY: 280 });
    expect([90, 270]).toContain(chooseRotaterAngle(tr, 'above'));
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

describe('Drehgriff: nur der sichtbare Teil der Bühne zählt', () => {
  /** Die Bühne liegt bei (0, 0) in einem Scroller, der bei y = clipBottom endet (dort beginnt die Leiste). */
  function clipStage(tr: Konva.Transformer, clipBottom: number) {
    const container = tr.getStage()!.container();
    const scroller = document.createElement('div');
    scroller.style.overflowY = 'auto';
    container.replaceWith(scroller);
    scroller.appendChild(container);
    const rect = (r: Partial<DOMRect>) => () => ({ x: 0, y: 0, left: 0, top: 0, ...r }) as DOMRect;
    container.getBoundingClientRect = rect({ width: 600, height: 600, right: 600, bottom: 600 });
    scroller.getBoundingClientRect = rect({
      width: 600,
      height: clipBottom,
      right: 600,
      bottom: clipBottom,
    });
  }

  it('ein Griff unter der Leiste gilt als nicht greifbar — er wandert nach oben', () => {
    // Element 250..350: unten läge der Griff bei ~380, der Scroller endet bei 370.
    const { tr } = setup({ x: 300, y: 300 });
    clipStage(tr, 370);
    expect(chooseRotaterAngle(tr, 'below')).toBe(0);
  });

  it('mit Platz über der Leiste bleibt er unten', () => {
    const { tr } = setup({ x: 300, y: 300 });
    clipStage(tr, 500);
    expect(chooseRotaterAngle(tr, 'below')).toBe(180);
  });
});

describe('elementAnchorStyleFunc', () => {
  it('wählt beim Anhängen sichtbar oben, auch gespiegelt', () => {
    const { node, tr } = setup({ x: 300, y: 300, scaleX: -1 });
    expect(tr.rotateAnchorAngle()).toBe(180);
    expect(rotater(tr).y).toBeLessThan(node.getClientRect().y);
  });

  it('setzt die Seite beim Anhängen an den Knoten', () => {
    const { tr } = setup({ x: 300, y: 70 });
    expect(ELEMENT_TRANSFORMER.anchorStyleFunc).toBe(elementAnchorStyleFunc);
    expect(tr.rotateAnchorAngle()).toBe(180);
    expect(rotater(tr).y).toBeLessThanOrEqual(600);
  });

  it('wechselt sie nicht mitten im Zug, aber danach', () => {
    const { node, tr } = setup({ x: 300, y: 300 });
    expect(tr.rotateAnchorAngle()).toBe(0);
    (tr as unknown as { _transforming: boolean })._transforming = true;
    node.y(70);
    tr.update();
    expect(tr.rotateAnchorAngle()).toBe(0);
    (tr as unknown as { _transforming: boolean })._transforming = false;
    tr.update();
    expect(tr.rotateAnchorAngle()).toBe(180);
  });

  it('folgt beim Verschieben (Konvas update auf dragmove)', () => {
    const { node, tr } = setup({ x: 300, y: 300 });
    node.y(70);
    tr.fire('dragmove');
    expect(tr.rotateAnchorAngle()).toBe(180);
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
