import { useAuthStore } from '@gruenerator/shared/stores';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { type ComponentType, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, useColorScheme } from 'react-native';
import PagerView, {
  type PagerViewOnPageScrollEvent,
  type PagerViewOnPageSelectedEvent,
} from 'react-native-pager-view';
import { useSharedValue } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '../../components/common';
import { ChatIllustration } from '../../components/onboarding/illustrations/ChatIllustration';
import { DocsIllustration } from '../../components/onboarding/illustrations/DocsIllustration';
import { NotebookIllustration } from '../../components/onboarding/illustrations/NotebookIllustration';
import { ToolsIllustration } from '../../components/onboarding/illustrations/ToolsIllustration';
import { WelcomeIllustration } from '../../components/onboarding/illustrations/WelcomeIllustration';
import { OnboardingDots } from '../../components/onboarding/OnboardingDots';
import { OnboardingSlide } from '../../components/onboarding/OnboardingSlide';
import { useOnboardingStore } from '../../stores/onboardingStore';
import { colors, spacing, lightTheme, darkTheme } from '../../theme';

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

export default function OnboardingScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const user = useAuthStore((s) => s.user);
  const completeOnboarding = useOnboardingStore((s) => s.completeOnboarding);

  const pagerRef = useRef<PagerView>(null);
  const [index, setIndex] = useState(0);
  // Continuous page position (index + scroll offset) so the dots track the swipe
  // gesture smoothly rather than snapping on page change.
  const progress = useSharedValue(0);

  const isLast = index === SLIDES.length - 1;

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

  const handleNext = () => {
    if (isLast) {
      finish();
    } else {
      pagerRef.current?.setPage(index + 1);
    }
  };

  const ctaLabel = isLast ? (user ? 'Fertig' : 'Anmelden') : 'Weiter';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <LinearGradient
        colors={
          colorScheme === 'dark'
            ? [colors.grey[950], colors.grey[950]]
            : [colors.white, 'rgba(95, 133, 117, 0.05)']
        }
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
      />

      <View style={styles.skipRow}>
        {!isLast && (
          <Pressable onPress={finish} hitSlop={8}>
            <Text style={[styles.skipText, { color: theme.textSecondary }]}>Überspringen</Text>
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
      </PagerView>

      <View style={styles.footer}>
        <OnboardingDots count={SLIDES.length} progress={progress} />
        <Button onPress={handleNext} style={styles.cta}>
          {ctaLabel}
        </Button>
      </View>
    </SafeAreaView>
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
});
