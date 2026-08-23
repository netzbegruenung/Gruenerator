import { Image as BrandImage } from 'expo-image';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
  type ImageSourcePropType,
} from 'react-native';

import { darkTheme, lightTheme, spacing, borderRadius, BODY_FONT } from '../../theme';
import { LegalNotice } from '../auth/LegalNotice';

/* eslint-disable @typescript-eslint/no-require-imports */
const BRAND_LOGO = require('../../assets/images/sonnenblume.png') as ImageSourcePropType;

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
 * The background is not painted here. `onboarding.tsx` lays the mesh under both
 * phases so that tapping "Beginnen" changes what is on the colour, not the
 * colour itself.
 */
export function OnboardingIntro({ onStart }: { onStart: () => void }) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  return (
    <View style={styles.root}>
      <View style={styles.hero}>
        <BrandImage source={BRAND_LOGO} style={styles.logo} contentFit="contain" />
        <Text style={[styles.headline, { color: theme.text }]}>{HEADLINE}</Text>
        <Pressable
          testID="onboarding-start"
          onPress={onStart}
          style={({ pressed }) => [styles.pill, { opacity: pressed ? 0.92 : 1 }]}
          accessibilityRole="button"
        >
          <Text style={styles.pillText}>Beginnen</Text>
        </Pressable>
      </View>

      <LegalNotice color={theme.textSecondary} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: spacing.large,
    paddingBottom: spacing.medium,
    gap: spacing.large,
  },
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.large,
  },
  logo: {
    width: 72,
    height: 72,
  },
  headline: {
    fontFamily: 'Raleway_700Bold',
    fontSize: 30,
    lineHeight: 38,
    letterSpacing: -0.4,
    textAlign: 'center',
    maxWidth: 340,
  },
  pill: {
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    width: '100%',
    maxWidth: 320,
    minHeight: 54,
    paddingHorizontal: spacing.large,
    borderRadius: borderRadius.full,
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 20,
    elevation: 5,
    marginTop: spacing.small,
  },
  pillText: {
    fontFamily: BODY_FONT,
    fontSize: 17,
    fontWeight: '700',
    color: '#111111',
  },
});
