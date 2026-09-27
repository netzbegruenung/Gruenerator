import { useEffect, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { useReduceMotion } from '../../hooks/useAccessibilityPreferences';
import { darkTheme, lightTheme, spacing, borderRadius, BODY_FONT } from '../../theme';
import { LegalNotice } from '../auth/LegalNotice';

const HEADLINE = 'Bereit für KI, die die Welt nicht brennen sehen will?';

/**
 * The first thing a new user sees: the claim, one button, and the notices.
 *
 * Deliberately not a page of the carousel. A carousel page comes with dots, a
 * "Weiter" in the footer and a "Überspringen" in the corner — three ways out of
 * a screen whose whole job is to have one way in. It is also the only screen
 * that carries the legal notices, which have no business sliding past under a
 * pair of dots.
 *
 * Claim, button and notices arrive in sequence rather than at once, over the
 * colour band that is still rising behind them (that part is
 * `onboarding.tsx`'s, because the band outlives this screen). The staging is
 * the whole difference between a screen that appears and one that opens; it is
 * short (about a second all told) and it plays once.
 *
 * No mark of any kind. The band is unmistakably ours, and a sunflower over it
 * only competes with the one sentence this screen exists to deliver.
 */
export function OnboardingIntro({ onStart }: { onStart: () => void }) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const reduceMotion = useReduceMotion();

  // One clock for the cascade; each piece reads it with its own delay.
  const enter = useSharedValue(0);
  useEffect(() => {
    enter.value = reduceMotion ? 1 : withTiming(1, { duration: 1500, easing: Easing.linear });
  }, [enter, reduceMotion]);

  return (
    <View style={styles.root}>
      <View style={styles.hero}>
        <Staged progress={enter} at={0} lift={22}>
          <Text style={[styles.headline, { color: theme.text }]}>{HEADLINE}</Text>
        </Staged>

        <Staged progress={enter} at={0.22} lift={22}>
          <Pressable
            testID="onboarding-start"
            onPress={onStart}
            style={({ pressed }) => [styles.pill, { opacity: pressed ? 0.92 : 1 }]}
            accessibilityRole="button"
          >
            <Text style={styles.pillText}>Beginnen</Text>
          </Pressable>
        </Staged>
      </View>

      <View style={styles.notice}>
        <Staged progress={enter} at={0.42} lift={10}>
          <LegalNotice color={theme.textSecondary} />
        </Staged>
      </View>
    </View>
  );
}

/**
 * One step of the cascade: fades and lifts into place over the fifth of the
 * clock that starts at `at`.
 *
 * A shared clock with offsets rather than a `withDelay` per piece, because the
 * pieces have to keep their order even when the screen mounts mid-animation —
 * and because reduce-motion then needs to short-circuit exactly one value.
 */
function Staged({
  progress,
  at,
  lift,
  children,
}: {
  progress: SharedValue<number>;
  /** Where in the clock (0…1) this piece starts. */
  at: number;
  /** How far below its resting place it begins, in points. */
  lift: number;
  children: ReactNode;
}) {
  const style = useAnimatedStyle(() => {
    const t = Math.min(1, Math.max(0, (progress.value - at) / 0.4));
    // Ease the piece itself; the clock is linear so the offsets stay honest.
    const eased = 1 - Math.pow(1 - t, 3);
    return { opacity: eased, transform: [{ translateY: (1 - eased) * lift }] };
  });
  return <Animated.View style={[styles.staged, style]}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: spacing.large,
  },
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.medium,
  },
  // Taken out of the flow on purpose. In the flow it is a sibling of `hero`,
  // so `hero` ends where the notices begin and centring inside it puts the
  // claim about 50pt above the middle of the screen — visibly high, and the
  // taller the notices the higher it goes.
  notice: {
    position: 'absolute',
    // Not 0: an absolutely placed child is laid out against the border box
    // here, so it would otherwise lose the root's own horizontal padding and
    // sit wider than everything above it.
    left: spacing.large,
    right: spacing.large,
    bottom: spacing.medium,
  },
  staged: {
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  headline: {
    fontFamily: 'Raleway_700Bold',
    fontSize: 30,
    lineHeight: 38,
    letterSpacing: -0.5,
    textAlign: 'center',
    maxWidth: 340,
  },
  pill: {
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    width: '100%',
    maxWidth: 320,
    minHeight: 56,
    paddingHorizontal: spacing.large,
    borderRadius: borderRadius.full,
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 6,
    marginTop: spacing.medium,
  },
  pillText: {
    fontFamily: BODY_FONT,
    fontSize: 17,
    fontWeight: '700',
    color: '#111111',
  },
});
