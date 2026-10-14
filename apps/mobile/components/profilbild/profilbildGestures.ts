import {
  MIN_STICKER,
  PROFILBILD_SIZE,
  placementRect,
  rescalePlacement,
  snapSticker,
  type PersonPlacement,
  type SnapResult,
} from '@gruenerator/shared/profilbild';
import { type SkImage } from '@shopify/react-native-skia';

import {
  dragPerson,
  hitSticker,
  pickTarget,
  pinchScale,
  restGesture,
  roundModel,
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

const S = PROFILBILD_SIZE;
export const NO_GUIDES: Guides = { x: null, y: null };

let stickerCounter = 0;

export function nextStickerUid(stickerId: string): string {
  stickerCounter += 1;
  return `${stickerId}-${stickerCounter}`;
}

/**
 * The editor's gesture state machine, outside React: RNGH calls these handlers
 * on the JS thread (`runOnJS(true)`), and the editor feeds in its latest props
 * through `sync` after every render.
 */
export function createProfilbildGestureController(io: {
  setDraft(m: ProfilbildModel | null): void;
  setGuides(g: Guides): void;
  haptic(): void;
}) {
  let ctx: { props: ProfilbildEditorProps; selected: string | null } | null = null;
  let target: Target | null = null;
  let live: LiveGesture = restGesture();
  let active = 0;
  let downAt: Point = { x: 0, y: 0 };
  let latest: ProfilbildModel | null = null;
  let lastGuides: Guides = NO_GUIDES;

  // Gestures only arrive once the editor has rendered, and it syncs on every render.
  const current = () => ctx!;

  const toCanvas = (p: Point) => {
    const size = current().props.viewSize;
    return { x: viewToCanvas(p.x, size), y: viewToCanvas(p.y, size) };
  };
  const srcOf = (img: SkImage) => ({ width: img.width(), height: img.height() });

  const begin = (at: Point) => {
    if (active++ > 0) return;
    live = restGesture();
    const { props: p, selected: sel } = current();
    const picked = pickTarget(
      p.model.stickers,
      sel,
      toCanvas(at),
      placementRect(srcOf(p.person), p.model.person)
    );
    if (picked?.kind === 'sticker') {
      const sticker = p.model.stickers.find((s) => s.uid === picked.uid);
      target = sticker ? { kind: 'sticker', start: sticker } : null;
      if (picked.uid !== sel) p.onSelect(picked.uid);
      return;
    }
    target = picked ? { kind: 'person', start: p.model.person } : null;
    if (sel) p.onSelect(null);
  };

  const showGuides = (snap: SnapResult) => {
    const prev = lastGuides;
    if ((prev.x === null && snap.guideX !== null) || (prev.y === null && snap.guideY !== null)) {
      io.haptic();
    }
    if (prev.x === snap.guideX && prev.y === snap.guideY) return;
    lastGuides = { x: snap.guideX, y: snap.guideY };
    io.setGuides(lastGuides);
  };

  const update = () => {
    const t = target;
    if (!t) return;
    const { model: m, person: img, viewSize: size } = current().props;
    const g = live;
    const dx = viewToCanvas(g.dx, size);
    const dy = viewToCanvas(g.dy, size);
    const threshold = snapThreshold(size);
    let next: ProfilbildModel;
    let snap: SnapResult;
    if (t.kind === 'person') {
      const src = srcOf(img);
      const scaled = rescalePlacement(src, t.start, pinchScale(t.start.scale, g.scale));
      snap = dragPerson(placementRect(src, scaled), dx, dy, threshold);
      next = { ...m, person: { ...scaled, x: snap.x, y: snap.y } };
    } else {
      const s = t.start;
      const factor = Math.max(g.scale, MIN_STICKER / Math.min(s.width, s.height));
      const box = {
        x: s.x + dx,
        y: s.y + dy,
        width: s.width * factor,
        height: s.height * factor,
        rotation: s.rotation + (g.rotation * 180) / Math.PI,
      };
      snap = snapSticker(box, S, threshold);
      const moved = { ...s, ...box, x: snap.x, y: snap.y };
      next = { ...m, stickers: m.stickers.map((o) => (o.uid === s.uid ? moved : o)) };
    }
    showGuides(snap);
    latest = next;
    io.setDraft(next);
  };

  const end = () => {
    active = Math.max(0, active - 1);
    if (active > 0) return;
    const next = latest;
    target = null;
    latest = null;
    lastGuides = NO_GUIDES;
    io.setGuides(NO_GUIDES);
    if (next) current().props.onChange(roundModel(next));
    io.setDraft(null);
  };

  return {
    sync(props: ProfilbildEditorProps, selected: string | null) {
      ctx = { props, selected };
    },
    handlers: {
      tapEnd(e: Point, success: boolean) {
        if (!success) return;
        const c = toCanvas(e);
        current().props.onSelect(hitSticker(current().props.model.stickers, c.x, c.y));
      },
      panBegin(e: Point) {
        downAt = { x: e.x, y: e.y };
      },
      panStart() {
        begin(downAt);
      },
      panUpdate(e: { translationX: number; translationY: number }) {
        live.dx = e.translationX;
        live.dy = e.translationY;
        update();
      },
      pinchStart(e: { focalX: number; focalY: number }) {
        begin({ x: e.focalX, y: e.focalY });
        live = startPinch(live);
      },
      pinchUpdate(e: { scale: number }) {
        live = updatePinch(live, e.scale);
        update();
      },
      rotationStart(e: { anchorX: number; anchorY: number }) {
        begin({ x: e.anchorX, y: e.anchorY });
        live = startRotation(live);
      },
      rotationUpdate(e: { rotation: number }) {
        live = updateRotation(live, e.rotation);
        update();
      },
      end,
    },
  };
}
