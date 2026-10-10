import { CANVAS_COLORS } from '@gruenerator/shared/canvas-editor';
import { BRAND_COLORS } from '@gruenerator/shared/image-studio';
import {
  gridLines,
  MIN_STICKER,
  PROFILBILD_SIZE,
  placementRect,
  rescalePlacement,
  rotatedBounds,
  snapSticker,
  type PersonPlacement,
  type ProfilbildAssetSrc,
  type SnapResult,
} from '@gruenerator/shared/profilbild';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import {
  Canvas,
  DashPathEffect,
  Group,
  Line,
  Rect,
  vec,
  type SkImage,
} from '@shopify/react-native-skia';
import * as Haptics from 'expo-haptics';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import {
  dragPerson,
  hitSticker,
  pinchScale,
  roundModel,
  snapThreshold,
  viewToCanvas,
} from '../../hooks/profilbild/gestureMath';

import { ProfilbildScene } from './ProfilbildScene';
import { sceneScale, type ProfilbildModel, type SceneSticker } from './sceneModel';

interface ProfilbildEditorProps {
  model: ProfilbildModel;
  onChange(model: ProfilbildModel): void;
  person: SkImage;
  images: Record<ProfilbildAssetSrc, SkImage>;
  isAustria: boolean;
  viewSize: number;
}

type Target = { kind: 'person'; start: PersonPlacement } | { kind: 'sticker'; start: SceneSticker };

interface Guides {
  x: number | null;
  y: number | null;
}

interface Point {
  x: number;
  y: number;
}

const S = PROFILBILD_SIZE;
const NO_GUIDES: Guides = { x: null, y: null };
const GRID_COLOR = 'rgba(255,255,255,0.7)';
const GRID_UNDERLAY = 'rgba(0,85,56,0.35)';
const GUIDE_COLOR = BRAND_COLORS.GRASHALM;
const GUIDE_CASING = CANVAS_COLORS.TANNE;
const REMOVE_SIZE = 32;

export function ProfilbildEditor(props: ProfilbildEditorProps) {
  const { model, person, images, isAustria, viewSize } = props;
  const [draft, setDraft] = useState<ProfilbildModel | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [guides, setGuides] = useState<Guides>(NO_GUIDES);

  const ctx = useRef({ props, selected });
  useLayoutEffect(() => {
    ctx.current = { props, selected };
  });
  const target = useRef<Target | null>(null);
  const live = useRef({ dx: 0, dy: 0, scale: 1, rotation: 0 });
  const active = useRef(0);
  const downAt = useRef<Point>({ x: 0, y: 0 });
  const latest = useRef<ProfilbildModel | null>(null);
  const lastGuides = useRef<Guides>(NO_GUIDES);

  const gesture = useMemo(() => {
    const toCanvas = (p: Point) => {
      const size = ctx.current.props.viewSize;
      return { x: viewToCanvas(p.x, size), y: viewToCanvas(p.y, size) };
    };
    const srcOf = (img: SkImage) => ({ width: img.width(), height: img.height() });

    const begin = (at: Point) => {
      if (active.current++ > 0) return;
      live.current = { dx: 0, dy: 0, scale: 1, rotation: 0 };
      const { props: p, selected: sel } = ctx.current;
      const sticker = p.model.stickers.find((s) => s.uid === sel);
      if (sticker) {
        target.current = { kind: 'sticker', start: sticker };
        return;
      }
      const rect = placementRect(srcOf(p.person), p.model.person);
      const c = toCanvas(at);
      const inside =
        c.x >= rect.x && c.x <= rect.x + rect.width && c.y >= rect.y && c.y <= rect.y + rect.height;
      target.current = inside ? { kind: 'person', start: p.model.person } : null;
    };

    const showGuides = (snap: SnapResult) => {
      const prev = lastGuides.current;
      if ((prev.x === null && snap.guideX !== null) || (prev.y === null && snap.guideY !== null)) {
        void Haptics.selectionAsync();
      }
      if (prev.x === snap.guideX && prev.y === snap.guideY) return;
      lastGuides.current = { x: snap.guideX, y: snap.guideY };
      setGuides(lastGuides.current);
    };

    const update = () => {
      const t = target.current;
      if (!t) return;
      const { model: m, person: img, viewSize: size } = ctx.current.props;
      const g = live.current;
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
      latest.current = next;
      setDraft(next);
    };

    const end = () => {
      active.current = Math.max(0, active.current - 1);
      if (active.current > 0) return;
      const next = latest.current;
      target.current = null;
      latest.current = null;
      lastGuides.current = NO_GUIDES;
      setGuides(NO_GUIDES);
      setDraft(null);
      if (next) ctx.current.props.onChange(roundModel(next));
    };

    const tap = Gesture.Tap()
      .runOnJS(true)
      .onEnd((e, success) => {
        if (!success) return;
        const c = toCanvas(e);
        setSelected(hitSticker(ctx.current.props.model.stickers, c.x, c.y));
      });
    const pan = Gesture.Pan()
      .runOnJS(true)
      .onBegin((e) => {
        downAt.current = { x: e.x, y: e.y };
      })
      .onStart(() => begin(downAt.current))
      .onUpdate((e) => {
        live.current.dx = e.translationX;
        live.current.dy = e.translationY;
        update();
      })
      .onEnd(end);
    const pinch = Gesture.Pinch()
      .runOnJS(true)
      .onStart((e) => begin({ x: e.focalX, y: e.focalY }))
      .onUpdate((e) => {
        live.current.scale = e.scale;
        update();
      })
      .onEnd(end);
    const rotation = Gesture.Rotation()
      .runOnJS(true)
      .onStart((e) => begin({ x: e.anchorX, y: e.anchorY }))
      .onUpdate((e) => {
        live.current.rotation = e.rotation;
        update();
      })
      .onEnd(end);
    return Gesture.Race(Gesture.Simultaneous(pan, pinch, rotation), tap);
  }, []);

  const shown = draft ?? model;
  const scale = sceneScale(viewSize);
  const stroke = 2 / scale;
  const gesturing = draft !== null;
  const sticker = shown.stickers.find((s) => s.uid === selected);

  const remove = () => {
    props.onChange({ ...model, stickers: model.stickers.filter((s) => s.uid !== selected) });
    setSelected(null);
  };

  return (
    <View style={{ width: viewSize, height: viewSize }}>
      <GestureDetector gesture={gesture}>
        <Canvas style={{ width: viewSize, height: viewSize }}>
          <Group transform={[{ scale }]}>
            <ProfilbildScene model={shown} person={person} images={images} isAustria={isAustria} />
            {gesturing
              ? gridLines(S).flatMap((p) => [
                  guides.x === p ? null : (
                    <GridLine key={`v${p}`} p1={vec(p, 0)} p2={vec(p, S)} stroke={stroke} />
                  ),
                  guides.y === p ? null : (
                    <GridLine key={`h${p}`} p1={vec(0, p)} p2={vec(S, p)} stroke={stroke} />
                  ),
                ])
              : null}
            {gesturing && guides.x !== null ? (
              <Guide p1={vec(guides.x, 0)} p2={vec(guides.x, S)} stroke={stroke} />
            ) : null}
            {gesturing && guides.y !== null ? (
              guides.y === S ? (
                <Guide
                  p1={vec(0, S - stroke * 1.5)}
                  p2={vec(S, S - stroke * 1.5)}
                  stroke={stroke * 2}
                />
              ) : (
                <Guide p1={vec(0, guides.y)} p2={vec(S, guides.y)} stroke={stroke} />
              )
            ) : null}
            {sticker ? (
              <Group
                transform={[
                  { translateX: sticker.x },
                  { translateY: sticker.y },
                  { rotate: (sticker.rotation * Math.PI) / 180 },
                ]}
              >
                <Rect
                  x={-sticker.width / 2}
                  y={-sticker.height / 2}
                  width={sticker.width}
                  height={sticker.height}
                  style="stroke"
                  strokeWidth={stroke}
                  color={GUIDE_COLOR}
                />
              </Group>
            ) : null}
          </Group>
        </Canvas>
      </GestureDetector>
      {sticker && !gesturing ? (
        <RemoveButton sticker={sticker} scale={scale} viewSize={viewSize} onPress={remove} />
      ) : null}
    </View>
  );
}

function RemoveButton({
  sticker,
  scale,
  viewSize,
  onPress,
}: {
  sticker: SceneSticker;
  scale: number;
  viewSize: number;
  onPress(): void;
}) {
  const b = rotatedBounds(sticker);
  const clamp = (v: number) => Math.min(Math.max(v, 0), viewSize - REMOVE_SIZE);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Sticker entfernen"
      hitSlop={8}
      onPress={onPress}
      style={[
        styles.remove,
        {
          left: clamp((b.x + b.width) * scale - REMOVE_SIZE / 2),
          top: clamp(b.y * scale - REMOVE_SIZE / 2),
        },
      ]}
    >
      <Ionicons name="close" size={20} color={GUIDE_CASING} />
    </Pressable>
  );
}

interface LineProps {
  p1: ReturnType<typeof vec>;
  p2: ReturnType<typeof vec>;
  stroke: number;
}

function Guide({ p1, p2, stroke }: LineProps) {
  return (
    <>
      <Line p1={p1} p2={p2} color={GUIDE_CASING} strokeWidth={stroke * 3} opacity={0.85} />
      <Line p1={p1} p2={p2} color={GUIDE_COLOR} strokeWidth={stroke * 1.5} />
    </>
  );
}

function GridLine({ p1, p2, stroke }: LineProps) {
  return (
    <>
      <Line p1={p1} p2={p2} color={GRID_UNDERLAY} strokeWidth={stroke * 2.5} />
      <Line p1={p1} p2={p2} color={GRID_COLOR} strokeWidth={stroke}>
        <DashPathEffect intervals={[12, 10]} />
      </Line>
    </>
  );
}

const styles = StyleSheet.create({
  remove: {
    position: 'absolute',
    width: REMOVE_SIZE,
    height: REMOVE_SIZE,
    borderRadius: REMOVE_SIZE / 2,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
