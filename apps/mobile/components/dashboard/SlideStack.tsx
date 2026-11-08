import * as Haptics from 'expo-haptics';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { SlideDots } from './SlideDots';
import { useAutoAdvance } from './useAutoAdvance';

/** So lange steht eine Folie, bevor die nächste kommt (Entwurf: 6 s). */
export const SLIDE_INTERVAL_MS = 6000;

/** Ab so viel waagerechter Bewegung gilt eine Berührung als Wischen … */
const SWIPE_MIN_PX = 40;
/** … oder ab dieser Geschwindigkeit (px/s). */
const SWIPE_MIN_VELOCITY = 500;

const FADE = { duration: 280, easing: Easing.bezier(0.23, 1, 0.32, 1) };

export interface Slide {
  key: string;
  /** Name der Folie für Vorlesesoftware und ihren Punkt. */
  label: string;
  /** Was nach einem Wechsel von Hand angesagt wird; Vorgabe: „<label>, 2 von 4“. */
  announce?: string;
  content: ReactNode;
}

/**
 * Eine Folie. `memo`: beim Wechsel ändern sich nur `hidden` der alten und der neuen
 * Folie — die Inhalte (gleiche Elemente) rendern nicht neu. Die Überblendung läuft auf
 * dem UI-Thread, aus `activeSV`; React erfährt vom Wechsel nur den fertigen Zustand.
 */
const SlideLayer = memo(function SlideLayer({
  index,
  activeSV,
  hidden,
  onMeasure,
  testID,
  children,
}: {
  index: number;
  activeSV: SharedValue<number>;
  hidden: boolean;
  onMeasure: (index: number, height: number) => void;
  testID: string;
  children: ReactNode;
}) {
  const fade = useAnimatedStyle(() => ({
    opacity: withTiming(activeSV.get() === index ? 1 : 0, FADE),
  }));
  return (
    <Animated.View
      testID={testID}
      onLayout={(e) => onMeasure(index, e.nativeEvent.layout.height)}
      // Die erste Folie bestimmt die Breite und hält die Karte offen; die übrigen liegen darüber.
      style={[index === 0 ? null : styles.overlay, fade]}
      // Eine unsichtbare Folie nimmt weder Berührungen noch Screenreader-Fokus.
      pointerEvents={hidden ? 'none' : 'auto'}
      accessibilityElementsHidden={hidden}
      importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
    >
      {children}
    </Animated.View>
  );
});

/**
 * Folien in einer Karte: wischen oder Punkte wählen. Ohne `intervalMs` nur von Hand
 * (Trends, Umfragen), mit `intervalMs` wechselt sie durch (Schlagzeilen, siehe
 * {@link useAutoAdvance}). Eine einzelne Folie steht ohne Punkte da.
 *
 * Der Folienstand liegt hier, nicht im Aufrufer: ein Wechsel rendert nur diese
 * Komponente und die Punkte, nie den Screen. Senkrechtes Ziehen bleibt Scrollen.
 * `renderControls` setzt etwas rechts neben die Punkte (der Pause-Knopf).
 */
export function SlideStack({
  slides,
  intervalMs = null,
  renderControls,
  footerStyle,
  style,
}: {
  slides: Slide[];
  intervalMs?: number | null;
  renderControls?: (c: { playing: boolean; togglePlaying: () => void }) => ReactNode;
  footerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
}) {
  const count = slides.length;
  const ctl = useAutoAdvance(count, intervalMs);
  const { active, select, step, hold, release } = ctl;
  const carousel = count > 1;

  const activeSV = useSharedValue(active);
  useEffect(() => {
    activeSV.set(active);
  }, [active, activeSV]);

  // Wechsel von Hand: genau eine Rückmeldung, nie beim Durchwechseln.
  const selectByHand = useCallback(
    (index: number) => {
      void Haptics.selectionAsync();
      select(index);
    },
    [select]
  );
  const swipe = useCallback(
    (direction: 1 | -1) => {
      void Haptics.selectionAsync();
      step(direction);
    },
    [step]
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(carousel)
        .activeOffsetX([-10, 10])
        .failOffsetY([-10, 10])
        .onBegin(() => {
          'worklet';
          scheduleOnRN(hold);
        })
        .onEnd((e, success) => {
          'worklet';
          if (!success) return;
          const far = Math.abs(e.translationX) >= SWIPE_MIN_PX;
          const fast = Math.abs(e.velocityX) >= SWIPE_MIN_VELOCITY;
          if (far || fast) scheduleOnRN(swipe, e.translationX < 0 ? 1 : -1);
        })
        .onFinalize(() => {
          'worklet';
          scheduleOnRN(release);
        }),
    [carousel, hold, release, swipe]
  );

  // Die Karte behält die Höhe der höchsten Folie, damit sie beim Wechsel nicht springt.
  const heights = useRef<number[]>([]);
  const [tallest, setTallest] = useState(0);
  const onMeasure = useCallback((index: number, height: number) => {
    heights.current[index] = height;
    setTallest(Math.max(0, ...heights.current));
  }, []);

  const announceIndex = ctl.announced;
  const announceText =
    announceIndex === null || !slides[announceIndex]
      ? null
      : (slides[announceIndex].announce ??
        `${slides[announceIndex].label}, ${announceIndex + 1} von ${count}`);
  useEffect(() => {
    if (announceText) AccessibilityInfo.announceForAccessibility(announceText);
  }, [announceText]);

  const labels = useMemo(() => slides.map((s) => s.label), [slides]);

  return (
    <View style={[styles.root, style]}>
      <GestureDetector gesture={pan}>
        <View style={{ minHeight: tallest }}>
          {slides.map((slide, i) => (
            <SlideLayer
              key={slide.key}
              index={i}
              activeSV={activeSV}
              hidden={i !== active}
              onMeasure={onMeasure}
              testID={`slide-${slide.key}`}
            >
              {slide.content}
            </SlideLayer>
          ))}
        </View>
      </GestureDetector>
      {carousel ? (
        <View style={[styles.footer, footerStyle]}>
          <SlideDots labels={labels} active={active} onSelect={selectByHand} />
          {ctl.canPlay
            ? renderControls?.({ playing: ctl.playing, togglePlaying: ctl.togglePlaying })
            : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { minHeight: 0 },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0 },
  footer: { flexDirection: 'row', alignItems: 'center' },
});
