import {
  clampPerson,
  gridLines,
  MIN_STICKER,
  personSize,
  placementRect,
  PROFILBILD_SIZE,
  rescalePlacement,
  rotatedBounds,
  snapPerson,
  snapSticker,
} from '@gruenerator/shared/profilbild';
import { describe, expect, it, vi } from 'vitest';

import * as gestureMath from '../../hooks/profilbild/gestureMath';
import { roundModel } from '../../hooks/profilbild/gestureMath';

import {
  applyLive,
  createProfilbildGestureController,
  idleMachine,
  NO_GUIDES,
  nextStickerUid,
  stepGesture,
  type GestureContext,
  type Guides,
  type LiveElement,
} from './profilbildGestures';
import { initialModel, type ProfilbildModel } from './sceneModel';

// View and canvas coordinates coincide at this size.
const VIEW = PROFILBILD_SIZE;
const STICKER = { x: 200, y: 200 };
const PERSON_SRC = { width: 100, height: 100 };

function setup(selected: string | null = null) {
  const model: ProfilbildModel = {
    ...initialModel(PERSON_SRC, false),
    stickers: [
      {
        uid: 's1',
        id: 'teamgruen',
        src: 'sonnenblume',
        ...STICKER,
        width: 100,
        height: 100,
        rotation: 0,
      },
    ],
  };
  const ctx: GestureContext = {
    stickers: model.stickers,
    person: model.person,
    personSrc: PERSON_SRC,
    selected,
    viewSize: VIEW,
  };
  // Plain cells stand in for the shared values; the worklets stub runs every
  // RN-thread hop synchronously, so each one is counted.
  const cells = {
    ctx: { value: ctx as GestureContext | null },
    machine: { value: idleMachine() },
    live: { value: null as LiveElement | null },
    guides: { value: NO_GUIDES as Guides },
  };
  const io = { select: vi.fn(), start: vi.fn(), commit: vi.fn(), haptic: vi.fn() };
  const controller = createProfilbildGestureController(cells, io);
  // What the editor does with a commit: apply it to its latest model.
  const committed = () => {
    const el = io.commit.mock.calls.at(-1)?.[0] as LiveElement | null;
    return el ? roundModel(applyLive(model, el)) : null;
  };
  const rnCalls = () =>
    io.select.mock.calls.length +
    io.start.mock.calls.length +
    io.commit.mock.calls.length +
    io.haptic.mock.calls.length;
  return { io, cells, model, controller, h: controller.handlers, committed, rnCalls };
}

const liveSticker = (live: LiveElement | null) => (live?.kind === 'sticker' ? live.sticker : null);

describe('createProfilbildGestureController', () => {
  it('moves the sticker in the live cell and commits the rounded model once on release', () => {
    const { io, cells, h, committed } = setup();

    h.panBegin(STICKER);
    h.panStart();
    expect(io.select).toHaveBeenCalledWith('s1');
    expect(io.start).toHaveBeenCalledTimes(1);
    h.panUpdate({ translationX: 10.4, translationY: 0 });

    expect(liveSticker(cells.live.value)).toMatchObject({ uid: 's1', x: 210.4, y: 200 });
    expect(io.commit).not.toHaveBeenCalled();

    h.end();
    expect(io.commit).toHaveBeenCalledTimes(1);
    expect(committed()?.stickers[0]).toMatchObject({ uid: 's1', x: 210, y: 200 });
  });

  it('crosses to the RN thread a fixed number of times per gesture, not once per frame', () => {
    // Before #4534 every frame called setDraft on the JS thread: 120 frames, 120 renders.
    const frames = (n: number) => {
      const { h, rnCalls } = setup();
      h.panBegin(STICKER);
      h.panStart();
      for (let i = 1; i <= n; i++) h.panUpdate({ translationX: i * 0.1, translationY: i * 0.1 });
      h.end();
      return rnCalls();
    };

    // select + start + commit, whatever the frame count.
    expect(frames(1)).toBe(3);
    expect(frames(120)).toBe(3);
  });

  it('commits once, at the last finger up, when pan and pinch run together', () => {
    const { io, cells, h, committed } = setup();

    h.panBegin(STICKER);
    h.panStart();
    h.pinchStart({ focalX: STICKER.x, focalY: STICKER.y });
    h.panUpdate({ translationX: 10, translationY: 0 });
    h.pinchUpdate({ scale: 1.5 });
    expect(liveSticker(cells.live.value)).toMatchObject({ x: 210, width: 150, height: 150 });

    h.end();
    expect(io.commit).not.toHaveBeenCalled();

    h.end();
    expect(io.commit).toHaveBeenCalledTimes(1);
    expect(committed()?.stickers[0]).toMatchObject({ x: 210, width: 150, height: 150 });
  });

  it('keeps a pinched sticker at the minimum size', () => {
    const { cells, h } = setup();

    h.pinchStart({ focalX: STICKER.x, focalY: STICKER.y });
    h.pinchUpdate({ scale: 0.01 });
    expect(liveSticker(cells.live.value)?.width).toBe(MIN_STICKER);
  });

  it('rotates the sticker by the gesture angle', () => {
    const { cells, h } = setup();

    h.rotationStart({ anchorX: STICKER.x, anchorY: STICKER.y });
    h.rotationUpdate({ rotation: Math.PI / 4 });
    expect(liveSticker(cells.live.value)?.rotation).toBeCloseTo(45);
  });

  it('drags the person when the gesture starts on it and deselects the sticker', () => {
    const { io, cells, model, h } = setup('s1');
    const rect = placementRect(PERSON_SRC, model.person);
    const at = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };

    h.panBegin(at);
    h.panStart();
    expect(io.select).toHaveBeenCalledWith(null);
    h.panUpdate({ translationX: -100, translationY: 0 });
    expect(cells.live.value).toEqual({
      kind: 'person',
      placement: { ...model.person, x: model.person.x - 100 },
    });
  });

  it('leaves the live cell alone when the gesture starts on empty space', () => {
    const { io, cells, h, rnCalls } = setup();

    h.panBegin({ x: 1000, y: 40 });
    h.panStart();
    h.panUpdate({ translationX: 10, translationY: 10 });
    expect(cells.live.value).toBeNull();
    h.end();
    expect(io.commit).toHaveBeenCalledWith(null);
    expect(rnCalls()).toBe(1);
  });

  it('deselects on a tap on empty space', () => {
    const { io, h } = setup('s1');

    h.tapEnd({ x: 1000, y: 40 }, true);
    expect(io.select).toHaveBeenCalledWith(null);
  });

  it('ticks once and shows the guide when a move snaps to the centre', () => {
    const { io, cells, h } = setup('s1');

    h.panBegin(STICKER);
    h.panStart();
    h.panUpdate({ translationX: PROFILBILD_SIZE / 2 - STICKER.x, translationY: 0 });
    expect(io.haptic).toHaveBeenCalledTimes(1);
    expect(cells.guides.value).toEqual({ x: PROFILBILD_SIZE / 2, y: null });
    const shown = cells.guides.value;

    h.panUpdate({ translationX: PROFILBILD_SIZE / 2 - STICKER.x + 1, translationY: 0 });
    expect(io.haptic).toHaveBeenCalledTimes(1);
    expect(cells.guides.value).toBe(shown);

    h.end();
    expect(cells.guides.value).toEqual(NO_GUIDES);
  });

  it('keeps the live element until settle, and settle leaves a new gesture alone', () => {
    const { cells, controller, h } = setup();

    h.panBegin(STICKER);
    h.panStart();
    h.panUpdate({ translationX: 10, translationY: 0 });
    h.end();
    // Still drawn from the live cell until the committed model has rendered.
    expect(cells.live.value).not.toBeNull();

    h.panBegin(STICKER);
    h.panStart();
    controller.settle();
    expect(cells.live.value).not.toBeNull();

    h.end();
    controller.settle();
    expect(cells.live.value).toBeNull();
  });

  it('commits nothing for a gesture that never moved, even before the last one settled', () => {
    const { io, cells, h } = setup();

    h.panBegin(STICKER);
    h.panStart();
    h.panUpdate({ translationX: 10, translationY: 0 });
    h.end();
    expect(io.commit).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'sticker' }));
    // The first commit has not rendered yet, so the live cell still holds it.
    expect(cells.live.value).not.toBeNull();

    h.panBegin(STICKER);
    h.end();
    expect(io.commit).toHaveBeenCalledTimes(2);
    expect(io.commit).toHaveBeenLastCalledWith(null);
  });
});

describe('stepGesture', () => {
  it('snaps a sticker to the bottom edge', () => {
    const start = {
      uid: 's',
      id: 'teamgruen' as const,
      src: 'sonnenblume',
      x: 540,
      y: 0,
      width: 100,
      height: 100,
      rotation: 0,
    };
    const g = { ...gestureMath.restGesture(), dy: PROFILBILD_SIZE - 50 - 5 };
    const { element, snap } = stepGesture({ kind: 'sticker', start }, g, PERSON_SRC, VIEW);
    expect(snap.guideY).toBe(PROFILBILD_SIZE);
    expect(element.kind === 'sticker' && element.sticker.y).toBe(PROFILBILD_SIZE - 50);
  });
});

describe('applyLive', () => {
  it('replaces only the moved sticker and keeps the rest of the model', () => {
    const { model } = setup();
    const other = { ...model.stickers[0], uid: 's2' };
    const base = { ...model, stickers: [...model.stickers, other] };
    const moved = { ...model.stickers[0], x: 999 };

    const next = applyLive(base, { kind: 'sticker', sticker: moved });
    expect(next.stickers).toEqual([moved, other]);
    expect(next.background).toBe(base.background);
  });
});

describe('UI-thread functions', () => {
  // Called from the gesture worklets. Without the directive the worklets
  // plugin leaves a function on the RN runtime, and calling it from the UI
  // thread throws — something no test here would otherwise notice.
  const onUiThread = {
    snapSticker,
    snapPerson,
    clampPerson,
    rotatedBounds,
    gridLines,
    placementRect,
    personSize,
    rescalePlacement,
    viewToCanvas: gestureMath.viewToCanvas,
    snapThreshold: gestureMath.snapThreshold,
    dragPerson: gestureMath.dragPerson,
    pinchScale: gestureMath.pinchScale,
    hitSticker: gestureMath.hitSticker,
    pickTarget: gestureMath.pickTarget,
    restGesture: gestureMath.restGesture,
    startPinch: gestureMath.startPinch,
    updatePinch: gestureMath.updatePinch,
    startRotation: gestureMath.startRotation,
    updateRotation: gestureMath.updateRotation,
    stepGesture,
    idleMachine,
  };

  it.each(Object.entries(onUiThread))('%s is a worklet', (_name, fn) => {
    expect(String(fn)).toMatch(/^[^{]*\{\s*["']worklet["'];/);
  });

  // The plugin captures only what the body reads: a default like
  // `size = PROFILBILD_SIZE` throws "Property doesn't exist" on the UI thread.
  it.each(Object.entries(onUiThread))('%s has no default parameters', (_name, fn) => {
    const signature = String(fn).slice(0, String(fn).indexOf('{'));
    expect(signature).not.toMatch(/=(?!>)/);
  });
});

describe('nextStickerUid', () => {
  it('numbers uids per app session', () => {
    const a = nextStickerUid('herz');
    const b = nextStickerUid('herz');
    expect(a).toMatch(/^herz-\d+$/);
    expect(Number(b.split('-')[1])).toBe(Number(a.split('-')[1]) + 1);
  });
});
