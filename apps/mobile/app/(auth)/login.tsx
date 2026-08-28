import { Image as BrandImage } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
  type ImageSourcePropType,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { LegalNotice } from '../../components/auth/LegalNotice';
import { LoginPanel } from '../../components/auth/LoginPanel';
import { darkTheme, lightTheme, spacing, typography } from '../../theme';

/* eslint-disable @typescript-eslint/no-require-imports */
const BRAND_LOGO = require('../../assets/images/sonnenblume.png') as ImageSourcePropType;

const HEADLINE = 'KI, die die Welt nicht brennen sehen will.';

/**
 * Sunrise backdrop: a warm green-gold glow over the base, matching
 * startpage-hero.css. Fades in once and then rests.
 *
 * There used to be a second, much warmer yellow layer on top, crossfaded in
 * when the country question opened. The question is gone (see {@link
 * LoginPanel}) and with it the state that layer marked — a flourish for a
 * moment that no longer happens is just a brighter screen.
 */
function Sunrise({ isDark }: { isDark: boolean }) {
  return (
    <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
      <Defs>
        <RadialGradient id="sp-rest" cx="50%" cy="50%" r="62%">
          <Stop offset="0%" stopColor="#e9d696" stopOpacity={isDark ? 0.1 : 0.5} />
          <Stop offset="42%" stopColor="#e9d696" stopOpacity={isDark ? 0.035 : 0.18} />
          <Stop offset="74%" stopColor="#e9d696" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#sp-rest)" />
    </Svg>
  );
}

/**
 * Freischalt-Griff für den Grünerator-Login (siehe `GATED_PROVIDERS` in
 * `services/loginProviders.ts`).
 *
 * Fünf Tipper auf die Sonnenblume, jeder höchstens {@link TAP_WINDOW_MS} nach
 * dem vorigen. Das Zeitfenster ist der eigentliche Schutz: fünf Tipper ohne
 * Frist sammeln sich irgendwann von allein an, fünf Tipper in vier Sekunden
 * nicht.
 *
 * Der Griff steht in den App-Review-Notes bei Apple — eine Funktion, die nur
 * wir kennen, verstößt gegen deren Guideline 2.3.1. Er sitzt hier und nicht in
 * `LoginPanel`, weil das Logo hier lebt; die Anmeldefläche auf der letzten
 * Onboarding-Folie trägt ihn deshalb nicht, und das ist gewollt: ein Weg, den
 * man beschreiben kann, ist einer.
 */
const TAPS_TO_REVEAL = 5;
const TAP_WINDOW_MS = 4000;

export default function LoginScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const theme = isDark ? darkTheme : lightTheme;

  const [gatedRevealed, setGatedRevealed] = useState(false);
  const taps = useRef(0);
  const lastTapAt = useRef(0);

  const onLogoPress = () => {
    if (gatedRevealed) return;
    const now = Date.now();
    taps.current = now - lastTapAt.current > TAP_WINDOW_MS ? 1 : taps.current + 1;
    lastTapAt.current = now;
    if (taps.current < TAPS_TO_REVEAL) return;
    setGatedRevealed(true);
    AccessibilityInfo.announceForAccessibility('Weitere Anmeldeanbieter freigeschaltet.');
  };

  // Play-once entrance (respecting reduce-motion).
  const enter = useSharedValue(0);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduce) => {
        enter.value = reduce
          ? 1
          : withTiming(1, { duration: 1200, easing: Easing.out(Easing.cubic) });
      })
      .catch(() => {
        enter.value = withTiming(1, { duration: 1200, easing: Easing.out(Easing.cubic) });
      });
  }, [enter]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: enter.value }));
  const contentStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateY: (1 - enter.value) * 20 }],
  }));

  return (
    <View style={[styles.root, { backgroundColor: isDark ? theme.background : '#fefcf5' }]}>
      <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]} pointerEvents="none">
        <Sunrise isDark={isDark} />
      </Animated.View>

      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <Animated.View style={[styles.hero, contentStyle]}>
          {/* `accessible={false}`: der Griff ist eine Zeigegeste, kein
              Bedienelement. Ein Knopf ohne Beschriftung im Bedienbaum wäre ein
              echter Mangel; das Logo bleibt schmückend, wie es war. */}
          <Pressable onPress={onLogoPress} accessible={false} testID="login-logo">
            <BrandImage source={BRAND_LOGO} style={styles.logo} contentFit="contain" />
          </Pressable>

          <Text style={[styles.headline, { color: theme.text }]}>{HEADLINE}</Text>

          <LoginPanel showGatedProviders={gatedRevealed} />
        </Animated.View>

        <View style={styles.footer}>
          <LegalNotice color={theme.textSecondary} />
          <Pressable onPress={() => router.back()} style={styles.cancel} accessibilityRole="button">
            <Text style={[styles.cancelText, { color: theme.textSecondary }]}>Abbrechen</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  safe: {
    flex: 1,
    paddingHorizontal: spacing.large,
  },
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.large,
  },
  logo: {
    width: 64,
    height: 64,
    marginBottom: spacing.small,
  },
  headline: {
    fontFamily: 'Raleway_700Bold',
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -0.4,
    textAlign: 'center',
    maxWidth: 320,
  },
  footer: {
    paddingBottom: spacing.medium,
    gap: spacing.small,
  },
  cancel: {
    alignSelf: 'center',
    padding: spacing.small,
  },
  cancelText: {
    ...typography.body,
  },
});
