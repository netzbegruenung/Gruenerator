/**
 * The op path on the freeform canvas (the template every minted sharepic
 * opens in): the model must SEE every element with its geometry, and
 * update-element must reach texts — otherwise "Verschieb den Text nach oben"
 * and "Schrift größer" have nothing to act on.
 */
import { getCanvasFormatOrDefault } from '@ggraphic/editor/formats/index';
import { describe, expect, it, vi } from 'vitest';

import { createFreeformFullConfig, type FreeformState } from '../configs/freeform_full.config';

import { applyOperation, type RotateElement } from '@ggraphic/editor/ai/applyOperation';

const SEED = {
  backgroundMode: 'color',
  backgroundColor: '#005538',
  additionalTexts: [
    {
      id: 'txt-1',
      text: 'Mobilitätswende jetzt',
      type: 'header',
      x: 80,
      y: 900,
      width: 920,
      fontSize: 96,
      fontFamily: 'GrueneTypeNeue',
      fill: '#FFFFFF',
    },
  ],
  shapeInstances: [
    {
      id: 'shape-1',
      type: 'rect',
      x: 0,
      y: 1100,
      width: 1080,
      height: 250,
      fill: '#8ABD24',
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      opacity: 1,
    },
    // A composer plane, its gradient a vertical Tanne fade.
    {
      id: 'sc-bg',
      type: 'rect',
      x: 0,
      y: 0,
      width: 1080,
      height: 1350,
      fill: '#005538',
      fillGradient: {
        type: 'linear',
        angle: 90,
        stops: [
          { offset: 0, color: '#005538' },
          { offset: 1, color: '#002216' },
        ],
      },
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      opacity: 1,
    },
  ],
  pillBadgeInstances: [
    {
      id: 'pill-1',
      text: 'Wusstest du?',
      x: 80,
      y: 80,
      backgroundColor: '#FFD320',
      textColor: '#005538',
      fontSize: 40,
      fontFamily: 'PT Sans',
      fontStyle: 'bold',
      rotation: 0,
      scale: 1,
      opacity: 1,
      paddingX: 20,
      paddingY: 10,
      cornerRadius: 30,
    },
  ],
  circleBadgeInstances: [
    {
      id: 'circle-1',
      x: 900,
      y: 200,
      radius: 100,
      backgroundColor: '#E6007E',
      textColor: '#FFFFFF',
      rotation: 0,
      scale: 1,
      textLines: [{ text: '12.10.', yOffset: 0, fontFamily: 'PT Sans', fontSize: 40 }],
    },
  ],
  assetInstances: [
    {
      id: 'asset-1',
      assetId: 'sonnenblume-gelb',
      x: 50,
      y: 1200,
      scale: 1,
      rotation: 0,
      opacity: 1,
    },
  ],
  chartInstances: [
    {
      id: 'chart-1',
      x: 300,
      y: 400,
      width: 480,
      height: 320,
      scale: 1,
      rotation: 0,
      opacity: 1,
      chartType: 'bar',
      data: [],
      colors: ['#005538'],
      title: 'CO2',
      showLegend: false,
      showGrid: false,
      showValues: true,
    },
  ],
  userImageInstances: [
    {
      id: 'img-1',
      src: 'blob:x',
      fileName: 'portrait.jpg',
      x: 600,
      y: 500,
      width: 400,
      height: 500,
      rotation: 0,
      scale: 1,
      opacity: 1,
    },
  ],
  selectedIcons: ['icon-1'],
  iconStates: { 'icon-1': { x: 540, y: 300, scale: 1, rotation: 0, color: '#FFFFFF' } },
  layerOrder: ['shape-1', 'txt-1'],
};

const config = createFreeformFullConfig(getCanvasFormatOrDefault(null));

function freeform(seed: Record<string, unknown> = SEED) {
  let state = config.createInitialState(seed);
  const getState = () => state;
  const setState = (u: Partial<FreeformState> | ((prev: FreeformState) => FreeformState)) => {
    state = typeof u === 'function' ? u(state) : { ...state, ...u };
  };
  const noop = () => {};
  const actions = config.createActions(getState, setState, noop, noop, {});
  return {
    ai: config.ai!,
    actions,
    getState,
    width: config.canvas.width,
    height: config.canvas.height,
  };
}

describe('freeform op path', () => {
  it('snapshot lists the canvas size and every element kind with geometry', () => {
    const { ai, getState, width, height } = freeform();
    const snap = ai.describeForAi(getState());

    expect(snap.canvasSize).toEqual({ width, height });
    const byId = new Map(snap.elementsSummary.map((e) => [e.id, e]));
    expect([...byId.keys()].sort()).toEqual(
      [
        'asset-1',
        'chart-1',
        'circle-1',
        'icon-1',
        'img-1',
        'pill-1',
        'sc-bg',
        'shape-1',
        'txt-1',
      ].sort()
    );
    expect(byId.get('txt-1')).toMatchObject({ kind: 'text' });
    expect(byId.get('txt-1')!.label).toContain('Mobilitätswende jetzt');
    expect(byId.get('txt-1')!.label).toContain('x=80 y=900');
    expect(byId.get('txt-1')!.label).toContain('Schrift 96px');
    expect(byId.get('txt-1')!.label).toContain('#FFFFFF');
    expect(byId.get('shape-1')!.label).toContain('1080×250');
    expect(byId.get('chart-1')).toMatchObject({ kind: 'chart' });
    expect(byId.get('icon-1')).toMatchObject({ kind: 'icon' });
    expect(byId.get('icon-1')!.label).toContain('x=540 y=300');
    expect(byId.get('sc-bg')!.label).toContain('(Hintergrundfläche)');
    expect(byId.get('sc-bg')!.label).toContain('Verlauf');
    expect(byId.get('sc-bg')!.label).not.toContain('gesperrt');
    expect(byId.get('shape-1')!.label).not.toContain('Hintergrundfläche');
    // z-order: layerOrder first (shape behind the text), the rest on top.
    expect(byId.get('shape-1')!.label).toContain('Ebene 1/9');
    expect(byId.get('txt-1')!.label).toContain('Ebene 2/9');
  });

  it('update-element moves, recolours and resizes a text', () => {
    const { ai, actions, getState } = freeform();
    const result = applyOperation(
      {
        kind: 'update-element',
        elementId: 'txt-1',
        patch: { y: 200, color: '#005538', scale: 1.5 },
      },
      actions,
      getState,
      ai
    );

    expect(result).toEqual({ ok: true });
    expect(getState().additionalTexts[0]).toMatchObject({
      x: 80,
      y: 200,
      fill: '#005538',
      fontSize: 144,
    });
  });

  it('update-element recolouring a gradient text drops the gradient', () => {
    const gradient = {
      type: 'linear',
      angle: 90,
      stops: [
        { offset: 0, color: '#8ABD24' },
        { offset: 1, color: '#0BA1DD' },
      ],
    };
    const { ai, actions, getState } = freeform({
      ...SEED,
      additionalTexts: [{ ...SEED.additionalTexts[0], fillGradient: gradient }],
    });
    expect(getState().additionalTexts[0]).toMatchObject({ fillGradient: gradient });

    const result = applyOperation(
      { kind: 'update-element', elementId: 'txt-1', patch: { color: '#E6007E' } },
      actions,
      getState,
      ai
    );

    expect(result).toEqual({ ok: true });
    expect(getState().additionalTexts[0]).toMatchObject({ fill: '#E6007E', fillGradient: null });
  });

  it('remove-element reaches every listed kind and says when the id is unknown', () => {
    const { ai, actions, getState } = freeform();
    for (const id of ['txt-1', 'chart-1', 'icon-1', 'pill-1']) {
      expect(
        applyOperation({ kind: 'remove-element', elementId: id }, actions, getState, ai)
      ).toEqual({
        ok: true,
      });
    }
    const left = ai.describeForAi(getState()).elementsSummary.map((e) => e.id);
    expect(left).not.toContain('txt-1');
    expect(left).not.toContain('chart-1');
    expect(left).not.toContain('icon-1');
    expect(left).not.toContain('pill-1');

    expect(
      applyOperation({ kind: 'remove-element', elementId: 'nope' }, actions, getState, ai).ok
    ).toBe(false);
  });

  const update = (
    elementId: string,
    patch: { color?: string; scale?: number; x?: number },
    env = freeform()
  ) => ({
    result: applyOperation(
      { kind: 'update-element', elementId, patch },
      env.actions,
      env.getState,
      env.ai
    ),
    state: env.getState(),
  });

  it('update-element scales a shape through scaleX/scaleY and recolours its fill', () => {
    const { result, state } = update('shape-1', { scale: 2, color: '#FFD320' });
    expect(result).toEqual({ ok: true });
    const shape = state.shapeInstances.find((x) => x.id === 'shape-1')!;
    expect(shape).toMatchObject({ scaleX: 2, scaleY: 2, fill: '#FFD320' });
    expect(shape).not.toHaveProperty('scale');
    expect(shape).not.toHaveProperty('color');
  });

  it('update-element recolours a badge background', () => {
    const { result, state } = update('pill-1', { color: '#E6007E' });
    expect(result).toEqual({ ok: true });
    const pill = state.pillBadgeInstances[0];
    expect(pill.backgroundColor).toBe('#E6007E');
    expect(pill).not.toHaveProperty('color');
  });

  it('update-element refuses a field the kind cannot take', () => {
    const { result, state } = update('chart-1', { color: '#E6007E' });
    expect(result.ok).toBe(false);
    expect(state.chartInstances[0]).not.toHaveProperty('color');
  });

  it('update-element leaves a locked element in place but still recolours it', () => {
    const env = freeform({ ...SEED, lockedLayerIds: ['shape-1'] });
    for (const patch of [{ x: 10 }, { scale: 2 }, { rotation: 15 }, { y: 5, color: '#FFD320' }]) {
      expect(
        applyOperation(
          { kind: 'update-element', elementId: 'shape-1', patch },
          env.actions,
          env.getState,
          env.ai
        )
      ).toEqual({ ok: false, reason: 'element "shape-1" is locked' });
    }
    expect(env.getState().shapeInstances.find((x) => x.id === 'shape-1')).toMatchObject({
      x: 0,
      y: 1100,
      scaleX: 1,
      rotation: 0,
      fill: '#8ABD24',
    });

    expect(update('shape-1', { color: '#FFD320' }, env).result).toEqual({ ok: true });
    expect(env.getState().shapeInstances.find((x) => x.id === 'shape-1')!.fill).toBe('#FFD320');
  });

  describe('update-element rotation', () => {
    const rotate = (
      env: ReturnType<typeof freeform>,
      patch: Record<string, unknown>,
      door: RotateElement | undefined
    ) =>
      applyOperation(
        { kind: 'update-element', elementId: 'txt-1', patch },
        env.actions,
        env.getState,
        env.ai,
        door
      );

    it('turns through the rotate door, not as a raw field write', () => {
      const env = freeform();
      const door = vi.fn<RotateElement>(() => true);
      expect(rotate(env, { rotation: 20, color: '#E6007E' }, door)).toEqual({ ok: true });
      expect(door).toHaveBeenCalledWith('txt-1', 20);
      const text = env.getState().additionalTexts[0];
      expect(text.fill).toBe('#E6007E');
      // The door owns rotation (and the centre-keeping x/y); the patch doesn't write it.
      expect(text.rotation ?? 0).toBe(0);
    });

    it('refuses rotation without a mounted canvas', () => {
      const env = freeform();
      expect(rotate(env, { rotation: 20 }, undefined).ok).toBe(false);
      expect(env.getState().additionalTexts[0].rotation ?? 0).toBe(0);
    });

    it('writes nothing when another field is refused', () => {
      const env = freeform();
      const door = vi.fn<RotateElement>(() => true);
      const result = applyOperation(
        { kind: 'update-element', elementId: 'chart-1', patch: { rotation: 20, color: '#E6007E' } },
        env.actions,
        env.getState,
        env.ai,
        door
      );
      expect(result.ok).toBe(false);
      expect(door).not.toHaveBeenCalled();
    });

    it('fails when the door cannot turn the element', () => {
      const env = freeform();
      const door = vi.fn<RotateElement>(() => false);
      expect(rotate(env, { rotation: 20, color: '#E6007E' }, door).ok).toBe(false);
      expect(env.getState().additionalTexts[0].fill).toBe('#FFFFFF');
    });
  });

  it('snapshot reports a turned element', () => {
    const env = freeform({
      ...SEED,
      additionalTexts: [{ ...SEED.additionalTexts[0], rotation: -15.4 }],
    });
    const label = env.ai
      .describeForAi(env.getState())
      .elementsSummary.find((e) => e.id === 'txt-1')!.label;
    expect(label).toContain('gedreht -15°');
    expect(
      env.ai.describeForAi(freeform().getState()).elementsSummary.find((e) => e.id === 'txt-1')!
        .label
    ).not.toContain('gedreht');
  });

  it('edits composer background planes like any shape', () => {
    const env = freeform();
    expect(update('sc-bg', { x: 10 }, env).result.ok).toBe(true);
    expect(env.getState().shapeInstances.find((x) => x.id === 'sc-bg')).toMatchObject({ x: 10 });

    // A solid colour replaces the gradient, which would otherwise hide it.
    expect(update('sc-bg', { color: '#E6007E' }, env).result.ok).toBe(true);
    expect(env.getState().shapeInstances.find((x) => x.id === 'sc-bg')).toMatchObject({
      fill: '#E6007E',
      fillGradient: null,
    });

    expect(
      applyOperation(
        { kind: 'remove-element', elementId: 'sc-bg' },
        env.actions,
        env.getState,
        env.ai
      ).ok
    ).toBe(true);
    expect(env.getState().shapeInstances.find((x) => x.id === 'sc-bg')).toBeUndefined();
  });
});
