import { useAuthStore } from '@gruenerator/shared/stores';
import { router } from 'expo-router';
import { type ComponentType, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Dimensions, useColorScheme } from 'react-native';
import PagerView, {
  type PagerViewOnPageScrollEvent,
  type PagerViewOnPageSelectedEvent,
} from 'react-native-pager-view';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '../../components/common';
import { MeshSurface } from '../../components/common/MeshSurface';
import { ChatIllustration } from '../../components/onboarding/illustrations/ChatIllustration';
import { DocsIllustration } from '../../components/onboarding/illustrations/DocsIllustration';
import { NotebookIllustration } from '../../components/onboarding/illustrations/NotebookIllustration';
import { ToolsIllustration } from '../../components/onboarding/illustrations/ToolsIllustration';
import { WelcomeIllustration } from '../../components/onboarding/illustrations/WelcomeIllustration';
import { OnboardingDots } from '../../components/onboarding/OnboardingDots';
import { OnboardingFinale } from '../../components/onboarding/OnboardingFinale';
import { OnboardingIntro } from '../../components/onboarding/OnboardingIntro';
import { OnboardingSlide } from '../../components/onboarding/OnboardingSlide';
import { useReduceMotion } from '../../hooks/useAccessibilityPreferences';
import { useOnboardingStore } from '../../stores/onboardingStore';
import { spacing, lightTheme, darkTheme, BODY_FONT } from '../../theme';
import { REGENBOGEN_MESH } from '../../theme/chatBackgrounds';

interface Slide {
  title: string;
  subtitle: string;
  Illustration: ComponentType<{ color: string; size: number }>;
}

const SLIDES: Slide[] = [
  {
    title: 'Willkommen in der Grünerator App',
    subtitle:
      'Alles für deine grüne Arbeit – erstellen, recherchieren und organisieren, direkt auf deinem Smartphone.',
    Illustration: WelcomeIllustration,
  },
  {
    title: 'Frag den Grünerator',
    subtitle: 'Recherchiere, schreibe und brainstorme – alles im Chat.',
    Illustration: ChatIllustration,
  },
  {
    title: 'Wissen aus der Basis',
    subtitle: 'Durchsuche Notebooks und finde belegte Antworten für deine Arbeit.',
    Illustration: NotebookIllustration,
  },
  {
    title: 'Dokumente unterwegs bearbeiten',
    subtitle: 'Schreibe und überarbeite Texte – mit KI-Unterstützung direkt im Editor.',
    Illustration: DocsIllustration,
  },
  {
    title: 'Werkzeuge für deinen Alltag',
    subtitle: 'Reels, KI-Bilder, Scanner und mehr – an einem Ort.',
    Illustration: ToolsIllustration,
  },
];

/** The carousel's pages: the five above, plus the closing "Bereit?". */
const PAGE_COUNT = SLIDES.length + 1;

const SCREEN_HEIGHT = Dimensions.get('window').height;

/**
 * Two phases on one screen: an opening that asks nothing but "Beginnen", then
 * the carousel, ending on the sign-in.
 *
 * They share a mount, and that is the point — one band of colour is laid under
 * both, so the opening does not hand over to a second screen with its own
 * background. What changes when "Beginnen" is tapped is what stands on the
 * colour.
 *
 * The band rises into place on mount, exactly as `.sp-sunrise` does on the web
 * start page: 2.4s, the same easing, from a fifth of a screen lower and from
 * nothing. It lives here rather than in `OnboardingIntro` because it has to
 * outlive that screen — restarting the rise when the carousel appears would
 * read as the page reloading.
 */
export default function OnboardingScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const user = useAuthStore((s) => s.user);
  const completeOnboarding = useOnboardingStore((s) => s.completeOnboarding);

  const [started, setStarted] = useState(false);

  const rise = useSharedValue(0);
  const reduceMotion = useReduceMotion();
  useEffect(() => {
    rise.value = reduceMotion
      ? 1
      : withTiming(1, { duration: 2400, easing: Easing.bezier(0.22, 1, 0.36, 1) });
  }, [rise, reduceMotion]);
  const riseStyle = useAnimatedStyle(() => ({
    opacity: rise.value,
    // Web lifts the band's centre from 82 % to 52 % of the viewport; 30 % of a
    // phone's height is the same move.
    transform: [{ translateY: (1 - rise.value) * 0.3 * SCREEN_HEIGHT }],
  }));

  const pagerRef = useRef<PagerView>(null);
  const [index, setIndex] = useState(0);
  // Continuous page position (index + scroll offset) so the dots track the swipe
  // gesture smoothly rather than snapping on page change.
  const progress = useSharedValue(0);

  const isFinale = index === PAGE_COUNT - 1;

  const handleScroll = (e: PagerViewOnPageScrollEvent) => {
    progress.value = e.nativeEvent.position + e.nativeEvent.offset;
  };

  const handleSelected = (e: PagerViewOnPageSelectedEvent) => {
    setIndex(e.nativeEvent.position);
  };

  const finish = () => {
    completeOnboarding();
    // Replay from settings happens while authed → go home; first-launch → login.
    router.replace(user ? '/(tabs)' : '/(auth)/login');
  };

  // `finish` with the destination decided rather than read: it looks at `user`,
  // which is still the closure's `null` at the moment the sign-in returns —
  // the store has the session, this render does not yet. So the one case where
  // home is certain says so outright.
  const finishAfterLogin = () => {
    completeOnboarding();
    router.replace('/(tabs)');
  };

  const handleNext = () => {
    pagerRef.current?.setPage(index + 1);
  };

  return (
    <View style={styles.container}>
      <Animated.View style={[StyleSheet.absoluteFill, riseStyle]} pointerEvents="none">
        <MeshSurface mesh={REGENBOGEN_MESH} id="onboarding" />
      </Animated.View>

      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        {!started ? (
          <OnboardingIntro onStart={() => setStarted(true)} />
        ) : (
          <>
            <View style={styles.skipRow}>
              {!isFinale && (
                <Pressable
                  testID="onboarding-skip"
                  onPress={finish}
                  hitSlop={8}
                  accessibilityRole="button"
                >
                  <Text style={[styles.skipText, { color: theme.textSecondary }]}>
                    Überspringen
                  </Text>
                </Pressable>
              )}
            </View>

            <PagerView
              ref={pagerRef}
              style={styles.pager}
              initialPage={0}
              onPageScroll={handleScroll}
              onPageSelected={handleSelected}
            >
              {SLIDES.map((slide, i) => (
                <View key={slide.title} style={styles.page}>
                  <OnboardingSlide
                    index={i}
                    progress={progress}
                    Illustration={slide.Illustration}
                    title={slide.title}
                    subtitle={slide.subtitle}
                  />
                </View>
              ))}
              <View key="finale" style={styles.page}>
                <OnboardingFinale
                  index={SLIDES.length}
                  progress={progress}
                  signedIn={user !== null}
                  onDone={finishAfterLogin}
                />
              </View>
            </PagerView>

            <View style={styles.footer}>
              <OnboardingDots count={PAGE_COUNT} progress={progress} />
              {/* No button on the last page — it carries its own call to
                  action, and a second one under it would compete with the
                  sign-in. The slot keeps its height so the pager above does not
                  grow by a button's worth the moment that page settles. */}
              {isFinale ? (
                <View style={styles.ctaPlaceholder} />
              ) : (
                <Button onPress={handleNext} style={styles.cta}>
                  Weiter
                </Button>
              )}
            </View>
          </>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  skipRow: {
    height: 32,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: spacing.large,
  },
  skipText: {
    fontFamily: BODY_FONT,
    fontSize: 15,
    fontWeight: '600',
  },
  pager: {
    flex: 1,
  },
  page: {
    flex: 1,
  },
  footer: {
    paddingHorizontal: spacing.large,
    paddingTop: spacing.large,
    paddingBottom: spacing.medium,
    gap: spacing.large,
    alignItems: 'center',
  },
  cta: {
    alignSelf: 'stretch',
  },
  // `Button`'s own minHeight. Kept as a literal rather than imported, because
  // what has to match is the rendered height, not the token it happens to
  // come from.
  ctaPlaceholder: {
    height: 48,
  },
});
