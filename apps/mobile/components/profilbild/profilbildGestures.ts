import {
  MIN_STICKER,
  PROFILBILD_SIZE,
  placementRect,
  rescalePlacement,
  snapSticker,
  type PersonPlacement,
  type Sized,
  type SnapResult,
} from '@gruenerator/shared/profilbild';
import { type SkImage } from '@shopify/react-native-skia';
import { scheduleOnRN } from 'react-native-worklets';

import {
  dragPerson,
  hitSticker,
  pickTarget,
  pinchScale,
  restGesture,
  snapThreshold,
  startPinch,
  startRotation,
  updatePinch,
  updateRotation,
  viewToCanvas,
  type LiveGesture,
} from '../../hooks/profilbild/gestureMath';

import { type ProfilbildModel, type SceneImages, type SceneSticker } from './sceneModel';

export interface ProfilbildEditorProps {
  model: ProfilbildModel;
  onChange(model: ProfilbildModel): void;
  person: SkImage;
  images: SceneImages;
  isAustria: boolean;
  viewSize: number;
  selected: string | null;
  onSelect(uid: string | null): void;
}

type Target = { kind: 'person'; start: PersonPlacement } | { kind: 'sticker'; start: SceneSticker };

export interface Guides {
  x: number | null;
  y: number | null;
}

interface Point {
  x: number;
  y: number;
}

/** The element a gesture is moving, as it stands this frame. */
export type LiveElement =
  { kind: 'person'; placement: PersonPlacement } | { kind: 'sticker'; sticker: SceneSticker };

/** What the gestures read from the editor's props, mirrored onto the UI thread after every render. */
export interface GestureContext {
  stickers: SceneSticker[];
  person: PersonPlacement;
  personSrc: Sized;
  selected: string | null;
  viewSize: number;
}

export interface GestureMachine {
  /** Gestures (pan, pinch, rotation) currently active; the first begins, the last commits. */
  active: number;
  downAt: Point;
  target: Target | null;
  gesture: LiveGesture;
}

/** A shared value, or a plain `{ value }` in tests. */
interface Cell<T> {
  value: T;
}

const S = PROFILBILD_SIZE;
export const NO_GUIDES: Guides = { x: null, y: null };

export function idleMachine(): GestureMachine {
  'worklet';
  return { active: 0, downAt: { x: 0, y: 0 }, target: null, gesture: restGesture() };
}

let stickerCounter = 0;

export function nextStickerUid(stickerId: string): string {
  stickerCounter += 1;
  return `${stickerId}-${stickerCounter}`;
}

/** Where the target stands for a gesture, snapped to the guides. */
export function stepGesture(
  t: Target,
  g: LiveGesture,
  personSrc: Sized,
  viewSize: number
): { element: LiveElement; snap: SnapResult } {
  'worklet';
  const dx = viewToCanvas(g.dx, viewSize);
  const dy = viewToCanvas(g.dy, viewSize);
  const threshold = snapThreshold(viewSize);
  if (t.kind === 'person') {
    const scaled = rescalePlacement(personSrc, t.start, pinchScale(t.start.scale, g.scale));
    const snap = dragPerson(placementRect(personSrc, scaled), dx, dy, threshold);
    return { element: { kind: 'person', placement: { ...scaled, x: snap.x, y: snap.y } }, snap };
  }
  const s = t.start;
  const factor = Math.max(g.scale, MIN_STICKER / Math.min(s.width, s.height));
  const box = {
    x: s.x + dx,
    y: s.y + dy,
    width: s.width * factor,
    height: s.height * factor,
    rotation: s.rotation + (g.rotation * 180) / Math.PI,
  };
  const snap = snapSticker(box, S, threshold);
  return { element: { kind: 'sticker', sticker: { ...s, ...box, x: snap.x, y: snap.y } }, snap };
}

/** The model with a gesture's result merged in. */
export function applyLive(model: ProfilbildModel, live: LiveElement): ProfilbildModel {
  if (live.kind === 'person') return { ...model, person: live.placement };
  const moved = live.sticker;
  return { ...model, stickers: model.stickers.map((s) => (s.uid === moved.uid ? moved : s)) };
}

/**
 * The editor's gesture state machine. Every handler is a worklet: RNGH runs
 * them on the UI thread, where they move the live element and the guides in
 * shared values that the Skia canvas draws directly — no React render per
 * frame. The RN thread hears about a gesture only at its edges (`select` and
 * `start` when it takes hold, `commit` once at the last finger up) and through
 * `haptic`, once each time a guide appears.
 *
 * The props the hit test needs arrive through `sync`, which the editor calls
 * after every render. The commit is applied on the RN thread to the
 * editor's latest model, so a change that landed mid-gesture is kept.
 */
export function createProfilbildGestureController(
  cells: {
    ctx: Cell<GestureContext | null>;
    machine: Cell<GestureMachine>;
    live: Cell<LiveElement | null>;
    guides: Cell<Guides>;
  },
  io: {
    select(uid: string | null): void;
    /** A gesture took hold of an element. */
    start(): void;
    /** The last finger is up; `live` is null when nothing moved. */
    commit(live: LiveElement | null): void;
    haptic(): void;
  }
) {
  const { ctx, machine, live, guides } = cells;
  const { select, start, commit, haptic } = io;

  const toCanvas = (p: Point, size: number): Point => {
    'worklet';
    return { x: viewToCanvas(p.x, size), y: viewToCanvas(p.y, size) };
  };

  const begin = (at: Point) => {
    'worklet';
    const m = machine.value;
    if (m.active > 0) {
      machine.value = { ...m, active: m.active + 1 };
      return;
    }
    const c = ctx.value;
    let target: Target | null = null;
    if (c) {
      const picked = pickTarget(
        c.stickers,
        c.selected,
        toCanvas(at, c.viewSize),
        placementRect(c.personSrc, c.person)
      );
      if (picked?.kind === 'sticker') {
        const sticker = c.stickers.find((s) => s.uid === picked.uid);
        target = sticker ? { kind: 'sticker', start: sticker } : null;
        if (picked.uid !== c.selected) scheduleOnRN(select, picked.uid);
      } else {
        target = picked ? { kind: 'person', start: c.person } : null;
        if (c.selected) scheduleOnRN(select, null);
      }
    }
    machine.value = { ...m, active: 1, target, gesture: restGesture() };
    if (target) scheduleOnRN(start);
  };

  const update = (gesture: LiveGesture) => {
    'worklet';
    const m = machine.value;
    machine.value = { ...m, gesture };
    const c = ctx.value;
    if (!m.target || !c) return;
    const { element, snap } = stepGesture(m.target, gesture, c.personSrc, c.viewSize);
    const prev = guides.value;
    if ((prev.x === null && snap.guideX !== null) || (prev.y === null && snap.guideY !== null)) {
      scheduleOnRN(haptic);
    }
    if (prev.x !== snap.guideX || prev.y !== snap.guideY) {
      guides.value = { x: snap.guideX, y: snap.guideY };
    }
    live.value = element;
  };

  const end = () => {
    'worklet';
    const m = machine.value;
    const active = Math.max(0, m.active - 1);
    if (active > 0) {
      machine.value = { ...m, active };
      return;
    }
    machine.value = idleMachine();
    guides.value = NO_GUIDES;
    // The live element stays on screen until the RN thread has rendered the
    // committed model and calls `settle`; clearing it here would flash the old
    // position for the frames in between.
    scheduleOnRN(commit, live.value);
  };

  return {
    /** Mirrors the editor's latest props onto the UI thread; called after every render. */
    sync(c: GestureContext) {
      ctx.value = c;
    },
    /** Drops the live element once the committed model is on screen, unless a new gesture has begun. */
    settle() {
      'worklet';
      if (machine.value.active === 0) live.value = null;
    },
    handlers: {
      tapEnd(e: Point, success: boolean) {
        'worklet';
        const c = ctx.value;
        if (!success || !c) return;
        const p = toCanvas(e, c.viewSize);
        scheduleOnRN(select, hitSticker(c.stickers, p.x, p.y));
      },
      panBegin(e: Point) {
        'worklet';
        machine.value = { ...machine.value, downAt: { x: e.x, y: e.y } };
      },
      panStart() {
        'worklet';
        begin(machine.value.downAt);
      },
      panUpdate(e: { translationX: number; translationY: number }) {
        'worklet';
        update({ ...machine.value.gesture, dx: e.translationX, dy: e.translationY });
      },
      pinchStart(e: { focalX: number; focalY: number }) {
        'worklet';
        begin({ x: e.focalX, y: e.focalY });
        machine.value = { ...machine.value, gesture: startPinch(machine.value.gesture) };
      },
      pinchUpdate(e: { scale: number }) {
        'worklet';
        update(updatePinch(machine.value.gesture, e.scale));
      },
      rotationStart(e: { anchorX: number; anchorY: number }) {
        'worklet';
        begin({ x: e.anchorX, y: e.anchorY });
        machine.value = { ...machine.value, gesture: startRotation(machine.value.gesture) };
      },
      rotationUpdate(e: { rotation: number }) {
        'worklet';
        update(updateRotation(machine.value.gesture, e.rotation));
      },
      end,
    },
  };
}
