import { CANVAS_COLORS } from '@gruenerator/shared/canvas-editor';
import { BRAND_COLORS } from '@gruenerator/shared/image-studio';
import { gridLines, PROFILBILD_SIZE, rotatedBounds } from '@gruenerator/shared/profilbild';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Canvas, DashPathEffect, Group, Line, Rect, vec } from '@shopify/react-native-skia';
import * as Haptics from 'expo-haptics';
import { useLayoutEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { makeMutable, useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { scheduleOnUI } from 'react-native-worklets';

import { roundModel } from '../../hooks/profilbild/gestureMath';

import {
  applyLive,
  createProfilbildGestureController,
  idleMachine,
  NO_GUIDES,
  type GestureContext,
  type Guides,
  type LiveElement,
  type ProfilbildEditorProps,
} from './profilbildGestures';
import { ProfilbildScene, useLiveStickerBox } from './ProfilbildScene';
import { sceneScale, type SceneSticker } from './sceneModel';

const S = PROFILBILD_SIZE;
const GRID_COLOR = 'rgba(255,255,255,0.7)';
const GRID_UNDERLAY = 'rgba(0,85,56,0.35)';
const GUIDE_COLOR = BRAND_COLORS.GRASHALM;
const GUIDE_CASING = CANVAS_COLORS.TANNE;
const REMOVE_SIZE = 32;

type Live = SharedValue<LiveElement | null>;

export function ProfilbildEditor(props: ProfilbildEditorProps) {
  const { model, person, images, isAustria, viewSize, selected } = props;
  const [gesturing, setGesturing] = useState(false);

  const [gestures] = useState(() => {
    // The RN-thread side of the gestures: the latest props, and whether a
    // commit is waiting to be on screen before the live element can go.
    let latest: ProfilbildEditorProps | null = null;
    let settlePending = false;
    const live = makeMutable<LiveElement | null>(null);
    const guides = makeMutable<Guides>(NO_GUIDES);
    const c = createProfilbildGestureController(
      {
        ctx: makeMutable<GestureContext | null>(null),
        machine: makeMutable(idleMachine()),
        live,
        guides,
      },
      {
        select: (uid) => latest?.onSelect(uid),
        start: () => setGesturing(true),
        commit: (el) => {
          setGesturing(false);
          if (!el || !latest) return;
          settlePending = true;
          latest.onChange(roundModel(applyLive(latest.model, el)));
        },
        haptic: () => void Haptics.selectionAsync(),
      }
    );
    const h = c.handlers;
    const tap = Gesture.Tap().onEnd(h.tapEnd);
    const pan = Gesture.Pan()
      .onBegin(h.panBegin)
      .onStart(h.panStart)
      .onUpdate(h.panUpdate)
      .onEnd(h.end);
    const pinch = Gesture.Pinch().onStart(h.pinchStart).onUpdate(h.pinchUpdate).onEnd(h.end);
    const rotation = Gesture.Rotation()
      .onStart(h.rotationStart)
      .onUpdate(h.rotationUpdate)
      .onEnd(h.end);
    return {
      live,
      guides,
      gesture: Gesture.Race(Gesture.Simultaneous(pan, pinch, rotation), tap),
      sync(p: ProfilbildEditorProps) {
        latest = p;
        c.sync({
          stickers: p.model.stickers,
          person: p.model.person,
          personSrc: { width: p.person.width(), height: p.person.height() },
          selected: p.selected,
          viewSize: p.viewSize,
        });
        // The committed model is on screen from this render on; the live element can go.
        if (settlePending) {
          settlePending = false;
          scheduleOnUI(c.settle);
        }
      },
    };
  });
  useLayoutEffect(() => {
    gestures.sync(props);
  });
  const { live, guides } = gestures;

  const scale = sceneScale(viewSize);
  const stroke = 2 / scale;
  const sticker = model.stickers.find((s) => s.uid === selected);

  const remove = () => {
    props.onChange({ ...model, stickers: model.stickers.filter((s) => s.uid !== selected) });
    props.onSelect(null);
  };

  return (
    <View style={{ width: viewSize, height: viewSize }}>
      <GestureDetector gesture={gestures.gesture}>
        <Canvas style={{ width: viewSize, height: viewSize }}>
          <Group transform={[{ scale }]}>
            <ProfilbildScene
              model={model}
              person={person}
              images={images}
              isAustria={isAustria}
              live={live}
            />
            {gridLines(S).flatMap((p) => [
              <GridLine key={`v${p}`} axis="x" p={p} stroke={stroke} live={live} guides={guides} />,
              <GridLine key={`h${p}`} axis="y" p={p} stroke={stroke} live={live} guides={guides} />,
            ])}
            <Guide axis="x" stroke={stroke} live={live} guides={guides} />
            <Guide axis="y" stroke={stroke} live={live} guides={guides} />
            {sticker ? (
              <SelectionOutline key={sticker.uid} sticker={sticker} stroke={stroke} live={live} />
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

function SelectionOutline({
  sticker,
  stroke,
  live,
}: {
  sticker: SceneSticker;
  stroke: number;
  live: Live;
}) {
  const { transform, rect } = useLiveStickerBox(sticker, live);
  return (
    <Group transform={transform}>
      <Rect rect={rect} style="stroke" strokeWidth={stroke} color={GUIDE_COLOR} />
    </Group>
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

interface OverlayProps {
  axis: 'x' | 'y';
  stroke: number;
  live: Live;
  guides: SharedValue<Guides>;
}

/** The snap guide on one axis, shown while a gesture holds an element on it. */
function Guide({ axis, stroke, live, guides }: OverlayProps) {
  const line = useDerivedValue(() => {
    const g = guides.value[axis];
    const visible = live.value !== null && g !== null;
    if (axis === 'x') {
      const x = g ?? 0;
      return { p1: { x, y: 0 }, p2: { x, y: S }, width: stroke, visible };
    }
    // The bottom guide sits just inside the canvas edge, drawn thicker.
    const bottom = g === S;
    const y = bottom ? S - stroke * 1.5 : (g ?? 0);
    return { p1: { x: 0, y }, p2: { x: S, y }, width: bottom ? stroke * 2 : stroke, visible };
  });
  const p1 = useDerivedValue(() => line.value.p1);
  const p2 = useDerivedValue(() => line.value.p2);
  const casing = useDerivedValue(() => line.value.width * 3);
  const core = useDerivedValue(() => line.value.width * 1.5);
  const opacity = useDerivedValue(() => (line.value.visible ? 1 : 0));
  return (
    <Group opacity={opacity}>
      <Line p1={p1} p2={p2} color={GUIDE_CASING} strokeWidth={casing} opacity={0.85} />
      <Line p1={p1} p2={p2} color={GUIDE_COLOR} strokeWidth={core} />
    </Group>
  );
}

/** A thirds/centre grid line, shown while a gesture runs unless the guide covers it. */
function GridLine({ axis, p, stroke, live, guides }: OverlayProps & { p: number }) {
  const opacity = useDerivedValue(() => (live.value !== null && guides.value[axis] !== p ? 1 : 0));
  const p1 = axis === 'x' ? vec(p, 0) : vec(0, p);
  const p2 = axis === 'x' ? vec(p, S) : vec(S, p);
  return (
    <Group opacity={opacity}>
      <Line p1={p1} p2={p2} color={GRID_UNDERLAY} strokeWidth={stroke * 2.5} />
      <Line p1={p1} p2={p2} color={GRID_COLOR} strokeWidth={stroke}>
        <DashPathEffect intervals={[12, 10]} />
      </Line>
    </Group>
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
