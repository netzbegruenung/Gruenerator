import { CANVAS_COLORS } from '@gruenerator/shared/canvas-editor';
import { BRAND_COLORS } from '@gruenerator/shared/image-studio';
import { gridLines, PROFILBILD_SIZE, rotatedBounds } from '@gruenerator/shared/profilbild';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Canvas, DashPathEffect, Group, Line, Rect, vec } from '@shopify/react-native-skia';
import * as Haptics from 'expo-haptics';
import { useLayoutEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import {
  createProfilbildGestureController,
  NO_GUIDES,
  type Guides,
  type ProfilbildEditorProps,
} from './profilbildGestures';
import { ProfilbildScene } from './ProfilbildScene';
import { sceneScale, type ProfilbildModel, type SceneSticker } from './sceneModel';

const S = PROFILBILD_SIZE;
const GRID_COLOR = 'rgba(255,255,255,0.7)';
const GRID_UNDERLAY = 'rgba(0,85,56,0.35)';
const GUIDE_COLOR = BRAND_COLORS.GRASHALM;
const GUIDE_CASING = CANVAS_COLORS.TANNE;
const REMOVE_SIZE = 32;

export function ProfilbildEditor(props: ProfilbildEditorProps) {
  const { model, person, images, isAustria, viewSize, selected } = props;
  const [draft, setDraft] = useState<ProfilbildModel | null>(null);
  const [guides, setGuides] = useState<Guides>(NO_GUIDES);

  const [gestures] = useState(() => {
    const c = createProfilbildGestureController({
      setDraft,
      setGuides,
      haptic: () => void Haptics.selectionAsync(),
    });
    const h = c.handlers;
    const tap = Gesture.Tap()
      .runOnJS(true)
      .onEnd((e, success) => h.tapEnd(e, success));
    const pan = Gesture.Pan()
      .runOnJS(true)
      .onBegin(h.panBegin)
      .onStart(h.panStart)
      .onUpdate(h.panUpdate)
      .onEnd(h.end);
    const pinch = Gesture.Pinch()
      .runOnJS(true)
      .onStart(h.pinchStart)
      .onUpdate(h.pinchUpdate)
      .onEnd(h.end);
    const rotation = Gesture.Rotation()
      .runOnJS(true)
      .onStart(h.rotationStart)
      .onUpdate(h.rotationUpdate)
      .onEnd(h.end);
    return { sync: c.sync, gesture: Gesture.Race(Gesture.Simultaneous(pan, pinch, rotation), tap) };
  });
  useLayoutEffect(() => {
    gestures.sync(props, selected);
  });

  const shown = draft ?? model;
  const scale = sceneScale(viewSize);
  const stroke = 2 / scale;
  const gesturing = draft !== null;
  const sticker = shown.stickers.find((s) => s.uid === selected);

  const remove = () => {
    props.onChange({ ...model, stickers: model.stickers.filter((s) => s.uid !== selected) });
    props.onSelect(null);
  };

  return (
    <View style={{ width: viewSize, height: viewSize }}>
      <GestureDetector gesture={gestures.gesture}>
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
