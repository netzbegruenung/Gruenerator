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

  it('ein horizontal gespiegelter Knoten bevorzugt trotzdem sichtbar oben', () => {
    // Konva zerlegt scaleX < 0 als Drehung 180°: die Box-Oberkante liegt unten.
    const { tr } = setup({ x: 300, y: 300, scaleX: -1 });
    expect(chooseRotaterAngle(tr, 'above')).toBe(180);
  });
});

describe('elementAnchorStyleFunc', () => {
  it('wählt beim Anhängen sichtbar unten (Canva-Muster), auch gespiegelt', () => {
    const { node, tr } = setup({ x: 300, y: 300, scaleX: -1 });
    expect(tr.rotateAnchorAngle()).toBe(0);
    const box = node.getClientRect();
    expect(rotater(tr).y).toBeGreaterThan(box.y + box.height);
  });

  it('setzt die Seite beim Anhängen an den Knoten', () => {
    const { tr } = setup({ x: 300, y: 70 });
    expect(ELEMENT_TRANSFORMER.anchorStyleFunc).toBe(elementAnchorStyleFunc);
    expect(tr.rotateAnchorAngle()).toBe(180);
    expect(rotater(tr).y).toBeLessThanOrEqual(600);
  });

  it('wechselt sie nicht mitten im Zug, aber danach', () => {
    const { node, tr } = setup({ x: 300, y: 300 });
    expect(tr.rotateAnchorAngle()).toBe(180);
    (tr as unknown as { _transforming: boolean })._transforming = true;
    node.y(530);
    tr.update();
    expect(tr.rotateAnchorAngle()).toBe(180);
    (tr as unknown as { _transforming: boolean })._transforming = false;
    tr.update();
    expect(tr.rotateAnchorAngle()).toBe(0);
  });

  it('folgt beim Verschieben (Konvas update auf dragmove)', () => {
    const { node, tr } = setup({ x: 300, y: 300 });
    node.y(530);
    tr.fire('dragmove');
    expect(tr.rotateAnchorAngle()).toBe(0);
  });
});

describe('rotaterRects', () => {
  it('liefert den sichtbaren Drehgriff jedes Transformers, für die Pille', () => {
    const { tr } = setup({ x: 300, y: 300 });
    const [rect] = rotaterRects(tr.getStage()!);
    expect(rect).toBeDefined();
    expect(rect!.y).toBeGreaterThan(350);
  });

  it('nicht bei gesperrtem Element', () => {
    const { tr } = setup({ x: 300, y: 300 });
    tr.rotateEnabled(false);
    expect(rotaterRects(tr.getStage()!)).toEqual([]);
  });
});

describe('Griff-Optik (Canva-Muster)', () => {
  const anchor = (tr: Konva.Transformer, name: string) => tr.findOne<Konva.Rect>(`.${name}`)!;
  const startRotate = (tr: Konva.Transformer, shiftKey = false) => {
    const t = tr as unknown as { _transforming: boolean; _movingAnchorName: string | null };
    t._transforming = true;
    t._movingAnchorName = 'rotater';
    tr.fire('transformstart', { evt: { shiftKey } });
  };

  it('Ecken sind Kreise, Seiten Pillen, der Drehgriff ein größerer Kreis', () => {
    const { tr } = setup({ x: 300, y: 300 });
    tr.enabledAnchors(['top-left', 'middle-right', 'bottom-center']);
    tr.update();
    const corner = anchor(tr, 'top-left');
    expect(corner.cornerRadius()).toBe(corner.width() / 2);
    const side = anchor(tr, 'middle-right');
    expect(side.height()).toBeGreaterThan(side.width());
    const bottom = anchor(tr, 'bottom-center');
    expect(bottom.width()).toBeGreaterThan(bottom.height());
    expect(anchor(tr, 'rotater').width()).toBeGreaterThan(corner.width());
    expect(tr.rotateLineVisible()).toBe(false);
  });

  it('beim Drehen: Drehgriff gefüllt, Größengriffe weg; danach wieder da', () => {
    const { tr } = setup({ x: 300, y: 300 });
    startRotate(tr);
    expect(anchor(tr, 'rotater').fill()).not.toBe('white');
    expect(anchor(tr, 'top-left').visible()).toBe(false);
    (tr as unknown as { _transforming: boolean })._transforming = false;
    tr.fire('transformend', {});
    expect(anchor(tr, 'rotater').fill()).toBe('white');
    expect(anchor(tr, 'top-left').visible()).toBe(true);
  });

  it('Shift rastet in 15°-Schritten, ohne Shift wieder 45°', () => {
    const { tr } = setup({ x: 300, y: 300 });
    startRotate(tr, true);
    expect(tr.rotationSnaps()).toContain(15);
    tr.fire('transform', { evt: { shiftKey: false } });
    expect(tr.rotationSnaps()).not.toContain(15);
    tr.fire('transform', { evt: { shiftKey: true } });
    (tr as unknown as { _transforming: boolean })._transforming = false;
    tr.fire('transformend', {});
    expect(tr.rotationSnaps()).not.toContain(15);
  });
});
