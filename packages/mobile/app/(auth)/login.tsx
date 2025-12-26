import { StyleSheet, Text, View, Pressable, useColorScheme } from 'react-native';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { lightTheme, darkTheme, typography, spacing, colors, borderRadius } from '../../theme';

// Enable web browser result handling for OAuth
WebBrowser.maybeCompleteAuthSession();

/**
 * Login screen
 * Handles Keycloak OIDC authentication
 */
export default function LoginScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  // TODO: Implement actual Keycloak auth with expo-auth-session
  const handleGrueneratorLogin = async () => {
    console.log('Login with Grünerator');
    // Will implement Keycloak OIDC flow
  };

  const handleGruenesNetzLogin = async () => {
    console.log('Login with Grünes Netz');
    // Will implement with kc_idp_hint=gruenes-netz
  };

  const handleNetzbegrünungLogin = async () => {
    console.log('Login with Netzbegrünung');
    // Will implement with kc_idp_hint=netzbegruenung
  };

  const handleClose = () => {
    router.back();
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Text style={[styles.title, { color: theme.text }]}>
        Willkommen beim Grünerator
      </Text>
      <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
        Melde dich an, um alle Funktionen zu nutzen
      </Text>

      <View style={styles.buttonContainer}>
        <Pressable
          style={({ pressed }) => [
            styles.button,
            styles.primaryButton,
            { opacity: pressed ? 0.8 : 1 },
          ]}
          onPress={handleGrueneratorLogin}
        >
          <Text style={styles.primaryButtonText}>Mit Grünerator anmelden</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.button,
            styles.secondaryButton,
            { borderColor: theme.border, opacity: pressed ? 0.8 : 1 },
          ]}
          onPress={handleGruenesNetzLogin}
        >
          <Text style={[styles.secondaryButtonText, { color: theme.text }]}>
            Grünes Netz
          </Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.button,
            styles.secondaryButton,
            { borderColor: theme.border, opacity: pressed ? 0.8 : 1 },
          ]}
          onPress={handleNetzbegrünungLogin}
        >
          <Text style={[styles.secondaryButtonText, { color: theme.text }]}>
            Netzbegrünung
          </Text>
        </Pressable>
      </View>

      <Pressable style={styles.cancelButton} onPress={handleClose}>
        <Text style={[styles.cancelButtonText, { color: theme.textSecondary }]}>
          Abbrechen
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.large,
  },
  title: {
    ...typography.h2,
    marginBottom: spacing.small,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.body,
    textAlign: 'center',
    marginBottom: spacing.xlarge,
  },
  buttonContainer: {
    width: '100%',
    gap: spacing.small,
  },
  button: {
    paddingVertical: spacing.medium,
    paddingHorizontal: spacing.large,
    borderRadius: borderRadius.medium,
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: colors.primary[600],
  },
  primaryButtonText: {
    ...typography.button,
    color: colors.white,
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
  },
  secondaryButtonText: {
    ...typography.button,
  },
  cancelButton: {
    marginTop: spacing.large,
    padding: spacing.small,
  },
  cancelButtonText: {
    ...typography.body,
  },
});
