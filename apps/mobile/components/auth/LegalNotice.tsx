import { Linking, StyleSheet, Text } from 'react-native';

import { colors, spacing, typography } from '../../theme';

const TERMS_URL = 'https://gruenerator.eu/nutzungsbedingungen';
const PRIVACY_URL = 'https://gruenerator.eu/datenschutz';
const TRANSPARENCY_URL = 'https://gruenerator.eu/ki-transparenz';

/**
 * The three things a person has to be told before they sign in: what they are
 * agreeing to, what happens with their data, and how AI content is marked.
 *
 * Shown twice — once on the onboarding's opening screen, once on the login
 * screen — because the two are separate entry points and either can be the
 * first thing a person sees. One component so the wording cannot drift between
 * them; the web equivalents are `TRANSPARENCY_NOTICE` plus the hint in
 * `LoginPage`'s CTA.
 */
export function LegalNotice({ color }: { color: string }) {
  return (
    <Text style={[styles.text, { color }]}>
      Mit der Anmeldung stimmst du unseren{' '}
      <Text style={styles.link} onPress={() => void Linking.openURL(TERMS_URL)}>
        Nutzungsbedingungen
      </Text>{' '}
      und der{' '}
      <Text style={styles.link} onPress={() => void Linking.openURL(PRIVACY_URL)}>
        Datenschutzerklärung
      </Text>{' '}
      zu. Wie wir KI-Inhalte kennzeichnen, steht unter{' '}
      <Text style={styles.link} onPress={() => void Linking.openURL(TRANSPARENCY_URL)}>
        KI-Transparenz
      </Text>
      .
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    ...typography.caption,
    textAlign: 'center',
    paddingHorizontal: spacing.medium,
  },
  link: {
    color: colors.primary[600],
    textDecorationLine: 'underline',
  },
});
