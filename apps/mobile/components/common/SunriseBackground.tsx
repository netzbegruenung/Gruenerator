import { resolveChatBackground } from '@gruenerator/shared/settings';
import { useAuthStore } from '@gruenerator/shared/stores';
import { useEffect, useState } from 'react';
import { Animated, StyleSheet, useColorScheme } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { useReduceMotion } from '../../hooks/useAccessibilityPreferences';
import { chatBackgroundColor, chatBackgroundMesh } from '../../theme/chatBackgrounds';

import { MeshSurface } from './MeshSurface';

/**
 * Mobile take on the web Chat tab's `.workplace-chat-sunrise` background
 * (apps/web/src/features/workplace/workplace-sunrise.css): a warm base with a soft
 * sand-gold (#E9D696) elliptical glow. Purely decorative, absolutely filled, behind
 * content. The glow rises + fades in on mount (honoring reduce-motion); the base is
 * static. Dark mode: transparent base + a much fainter glow.
 *
 * Shallower than the web original, on purpose. A phone is tall and narrow, so the
 * web ellipse faded out well above the bottom-pinned composer, leaving it on bare
 * cream — the yellow read as a patch in the middle rather than the tab's colour.
 * The glow now reaches past the bottom edge and bottoms out short of zero, so the
 * gradient still reads as one while the composer keeps warm ground under it.
 */
export function SunriseBackground() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  // Which preset is a server-side profile setting, shared with web; the colour
  // it maps to is mobile's own (see theme/chatBackgrounds.ts).
  const preset = resolveChatBackground(
    useAuthStore((s) => s.user?.chat_background),
    'mobile'
  );
  const glow = chatBackgroundColor(preset.key);
  const mesh = chatBackgroundMesh(preset.key);

  const [progress] = useState(() => new Animated.Value(0));
  // Combines the OS setting with the profile override, so "Animationen
  // reduzieren" in the app's settings reaches this too.
  const reduceMotion = useReduceMotion();

  useEffect(() => {
    if (reduceMotion) {
      progress.setValue(1);
      return;
    }
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 2400,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, reduceMotion]);

  const opacity = progress;
  // Rise: the glow settles upward into place (mirrors the web center-y 82% -> 52%).
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [70, 0] });

  const stops = isDark
    ? [
        { offset: '0', opacity: '0.06' },
        { offset: '0.45', opacity: '0.045' },
        { offset: '0.8', opacity: '0.03' },
        { offset: '1', opacity: '0.028' },
      ]
    : [
        { offset: '0', opacity: '0.24' },
        { offset: '0.45', opacity: '0.18' },
        { offset: '0.8', opacity: '0.13' },
        { offset: '1', opacity: '0.12' },
      ];

  // No rise for a mesh. The single-glow presets lift into place because they are
  // one shape moving; a composition of clouds pinned to their corners would
  // slide as a whole and read as the screen settling, not as light.
  if (mesh) {
    return (
      <Animated.View pointerEvents="none" style={styles.container}>
        <Animated.View style={[StyleSheet.absoluteFill, { opacity }]}>
          <MeshSurface mesh={mesh} id={`bg-${preset.key}`} />
        </Animated.View>
      </Animated.View>
    );
  }

  return (
    <Animated.View pointerEvents="none" style={styles.container}>
      {/* The warm base belongs to the `sunrise` preset. Any other choice would
          be tinted by it, and "Neutral" would not be neutral at all. */}
      {!isDark && preset.key === 'sunrise' && (
        <Animated.View style={[StyleSheet.absoluteFill, styles.creamBase]} />
      )}
      {glow && (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity, transform: [{ translateY }] }]}>
          <Svg width="100%" height="100%">
            <Defs>
              {/* Sized so the falloff actually completes on screen — stretch the
                  ellipse much past the edges and everything sits in its core, which
                  flattens the gradient into a single wash. */}
              <RadialGradient id="chatSunrise" cx="50%" cy="40%" rx="105%" ry="62%">
                {stops.map((s) => (
                  <Stop key={s.offset} offset={s.offset} stopColor={glow} stopOpacity={s.opacity} />
                ))}
              </RadialGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#chatSunrise)" />
          </Svg>
        </Animated.View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 0,
  },
  creamBase: {
    backgroundColor: '#fefcf5',
  },
});
