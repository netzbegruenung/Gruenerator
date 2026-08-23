import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Image as ProviderImage } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
  type ImageSourcePropType,
} from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { login } from '../../services/auth';
import {
  PROVIDER_SOURCE,
  deviceCountryProvider,
  orderedProviders,
  type LoginProviderId,
} from '../../services/loginProviders';
import { BODY_FONT, borderRadius, colors, spacing, typography } from '../../theme';

/* eslint-disable @typescript-eslint/no-require-imports */
const PROVIDER_LOGO: Partial<Record<LoginProviderId, ImageSourcePropType>> = {
  'gruenes-netz': require('../../assets/images/sonnenblume.png') as ImageSourcePropType,
  'gruene-oesterreich': require('../../assets/images/gruene-at-logo.png') as ImageSourcePropType,
  netzbegruenung: require('../../assets/images/nb-icon.png') as ImageSourcePropType,
  // `gruenerator` has no mark of its own — on web it falls back to an emoji,
  // and so does the row below.
};
/* eslint-enable @typescript-eslint/no-require-imports */

/**
 * The whole act of signing in: one button for the provider this device most
 * likely belongs to, and every other provider one disclosure below it.
 *
 * No country question. The old screen asked "Loggst du dich aus Deutschland
 * ein?" before showing anything, which put a decision in front of every single
 * user to serve the small minority for whom the guess is wrong — and the guess
 * is cheap to make (`deviceCountryProvider`) and free to undo. Same shape as
 * the web start page and `/login`, whose "Anderer Anbieter" toggle this is.
 *
 * Mounted twice: on the login screen and on the last onboarding slide. Both
 * need identical behaviour down to the error text, which is why this is a
 * component and not two copies.
 */
export function LoginPanel({
  /** Ran instead of the default `/(tabs)` replace, when there is tidying to do first. */
  onSuccess,
}: {
  onSuccess?: () => void;
}) {
  const theme = useTheme();
  const isDark = useColorScheme() === 'dark';

  // Resolved once. Nothing about the device's country changes while the screen
  // is up, and re-reading it per render would re-order the list under a finger.
  const [primary] = useState(deviceCountryProvider);
  const providers = orderedProviders(primary);
  const primaryTitle = providers[0]?.title;
  const [providersOpen, setProvidersOpen] = useState(false);
  const [pending, setPending] = useState<LoginProviderId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isLoading = pending !== null;

  const startLogin = (id: LoginProviderId) => {
    setPending(id);
    setError(null);
    void login(PROVIDER_SOURCE[id])
      .then((result) => {
        if (result.success) {
          if (onSuccess) onSuccess();
          else void router.replace('/(tabs)');
          return;
        }
        setError(result.error || 'Anmeldung fehlgeschlagen');
      })
      .catch((err: unknown) => {
        setError('Ein unerwarteter Fehler ist aufgetreten');
        console.error('[Login] Error:', err);
      })
      .finally(() => setPending(null));
  };

  return (
    <View style={styles.root}>
      {error !== null && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <Pressable
        testID="login-open"
        onPress={() => startLogin(primary)}
        disabled={isLoading}
        style={({ pressed }) => [
          styles.pill,
          { opacity: isLoading && pending !== primary ? 0.6 : pressed ? 0.92 : 1 },
        ]}
        accessibilityRole="button"
        // The button says only "Anmelden"; which account that means is the one
        // thing a screen reader user cannot see from the logo below it.
        accessibilityLabel={primaryTitle ? `Anmelden mit ${primaryTitle}` : 'Anmelden'}
      >
        {pending === primary ? (
          <ActivityIndicator color="#111111" />
        ) : (
          <>
            <Ionicons name="lock-closed" size={18} color="#111111" />
            <Text style={styles.pillText}>Login</Text>
          </>
        )}
      </Pressable>

      <Text style={[styles.hint, { color: theme.textSecondary }]}>
        Exklusiv für Grüne Mitglieder.
      </Text>

      <Pressable
        testID="login-providers-toggle"
        onPress={() => setProvidersOpen((open) => !open)}
        disabled={isLoading}
        style={styles.toggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: providersOpen }}
      >
        <Text style={[styles.toggleText, { color: theme.textSecondary }]}>
          {providersOpen ? 'Anbieter ausblenden' : 'Weitere Anbieter'}
        </Text>
        <Ionicons
          name={providersOpen ? 'chevron-up' : 'chevron-down'}
          size={14}
          color={theme.textSecondary}
        />
      </Pressable>

      {providersOpen && (
        <View style={styles.providerList}>
          {providers.map((provider) => {
            const logo = PROVIDER_LOGO[provider.id];
            return (
              <Pressable
                key={provider.id}
                testID={`login-provider-${provider.id}`}
                onPress={() => startLogin(provider.id)}
                disabled={isLoading}
                style={({ pressed }) => [
                  styles.provider,
                  {
                    backgroundColor: isDark ? colors.grey[900] : '#ffffff',
                    borderColor: provider.id === primary ? theme.textGreen : theme.border,
                    opacity: pressed ? 0.92 : 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: provider.id === primary }}
              >
                {pending === provider.id ? (
                  <ActivityIndicator size="small" color={theme.textSecondary} />
                ) : logo ? (
                  <ProviderImage source={logo} style={styles.providerLogo} contentFit="contain" />
                ) : (
                  <Text style={styles.providerFallback}>🌱</Text>
                )}
                <Text style={[styles.providerText, { color: theme.text }]} numberOfLines={1}>
                  {provider.title}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignSelf: 'stretch',
    alignItems: 'center',
    gap: spacing.small,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xsmall,
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
  },
  pillText: {
    fontFamily: BODY_FONT,
    fontSize: 17,
    fontWeight: '700',
    color: '#111111',
  },
  hint: {
    ...typography.bodySmall,
    opacity: 0.8,
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxsmall,
    paddingVertical: spacing.xsmall,
    paddingHorizontal: spacing.small,
  },
  toggleText: {
    fontFamily: BODY_FONT,
    fontSize: 14,
    fontWeight: '600',
  },
  providerList: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 320,
    gap: spacing.xsmall,
  },
  provider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    minHeight: 48,
    paddingHorizontal: spacing.medium,
    borderRadius: borderRadius.large,
    borderCurve: 'continuous',
    borderWidth: 1,
  },
  providerLogo: {
    width: 22,
    height: 22,
  },
  providerFallback: {
    fontSize: 18,
    width: 22,
    textAlign: 'center',
  },
  providerText: {
    flex: 1,
    fontFamily: BODY_FONT,
    fontSize: 15,
    fontWeight: '600',
  },
  errorBox: {
    backgroundColor: colors.semantic.error + '20',
    borderRadius: borderRadius.medium,
    padding: spacing.medium,
    alignSelf: 'center',
    width: '100%',
    maxWidth: 320,
  },
  errorText: {
    ...typography.body,
    color: colors.semantic.error,
    textAlign: 'center',
  },
});
