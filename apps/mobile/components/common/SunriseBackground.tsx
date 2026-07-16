import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, useColorScheme } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

/**
 * Exact mobile port of the web Chat tab's `.workplace-chat-sunrise` background
 * (apps/web/src/features/workplace/workplace-sunrise.css): a warm cream base with a
 * soft sand-gold (#E9D696) elliptical glow centered slightly above middle. Purely
 * decorative, absolutely filled, behind content. The glow rises + fades in on mount
 * (honoring reduce-motion); the cream base is static. Dark mode: transparent base +
 * a much fainter glow.
 */
const GLOW = '233, 214, 150'; // #E9D696

export function SunriseBackground() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [progress] = useState(() => new Animated.Value(0));
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    return () => {
      mounted = false;
    };
  }, []);

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
        { offset: '0', opacity: '0.1' },
        { offset: '0.42', opacity: '0.035' },
        { offset: '0.74', opacity: '0' },
      ]
    : [
        { offset: '0', opacity: '0.5' },
        { offset: '0.4', opacity: '0.18' },
        { offset: '0.74', opacity: '0' },
      ];

  return (
    <Animated.View pointerEvents="none" style={styles.container}>
      {!isDark && <Animated.View style={[StyleSheet.absoluteFill, styles.creamBase]} />}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity, transform: [{ translateY }] }]}>
        <Svg width="100%" height="100%">
          <Defs>
            <RadialGradient id="chatSunrise" cx="50%" cy="52%" rx="88%" ry="58%">
              {stops.map((s) => (
                <Stop
                  key={s.offset}
                  offset={s.offset}
                  stopColor={`rgb(${GLOW})`}
                  stopOpacity={s.opacity}
                />
              ))}
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#chatSunrise)" />
        </Svg>
      </Animated.View>
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
