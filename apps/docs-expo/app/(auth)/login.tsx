import { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  useColorScheme,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { lightTheme, darkTheme, typography, spacing, colors, borderRadius } from '../../theme';
import { login, type AuthSource } from '../../services/auth';

interface LoginProvider {
  enabled: boolean;
  source: AuthSource;
  title: string;
  description: string;
}

const LOGIN_PROVIDERS: Record<string, LoginProvider> = {
  gruenesNetz: {
    enabled: true,
    source: 'gruenes-netz-login',
    title: 'Grünes Netz',
    description: 'Für Mitglieder von BÜNDNIS 90/DIE GRÜNEN',
  },
  grueneOesterreich: {
    enabled: true,
    source: 'gruene-oesterreich-login',
    title: 'Die Grünen Österreich',
    description: 'Für Mitglieder der Grünen Österreich',
  },
  netzbegruenung: {
    enabled: true,
    source: 'netzbegruenung-login',
    title: 'Netzbegrünung',
    description: 'Für Mitglieder der Netzbegrünung',
  },
};

export default function LoginScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(false);
  const [loadingSource, setLoadingSource] = useState<AuthSource | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (source: AuthSource) => {
    setIsLoading(true);
    setLoadingSource(source);
    setError(null);

    try {
      const result = await login(source);

      if (result.success) {
        router.replace('/');
      } else {
        setError(result.error || 'Anmeldung fehlgeschlagen');
      }
    } catch {
      setError('Ein unerwarteter Fehler ist aufgetreten');
    } finally {
      setIsLoading(false);
      setLoadingSource(null);
    }
  };

  const handlePrivacyPress = () => {
    Linking.openURL('https://gruenerator.eu/datenschutz');
  };

  const renderLoginOption = (provider: LoginProvider) => {
    if (!provider.enabled) return null;

    const isButtonLoading = loadingSource === provider.source;

    return (
      <Pressable
        key={provider.source}
        style={({ pressed }) => [
          styles.loginOption,
          { borderColor: theme.border },
          { opacity: pressed || isLoading ? 0.7 : 1 },
        ]}
        onPress={() => handleLogin(provider.source)}
        disabled={isLoading}
      >
        <View style={styles.loginTextContent}>
          {isButtonLoading ? (
            <ActivityIndicator color={theme.text} />
          ) : (
            <>
              <Text style={[styles.loginTitle, { color: theme.text }]}>{provider.title}</Text>
              <Text style={[styles.loginDescription, { color: theme.textSecondary }]}>
                {provider.description}
              </Text>
            </>
          )}
        </View>
      </Pressable>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Text style={[styles.title, { color: theme.text }]}>Grünerator Docs</Text>
      <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
        Melde dich an, um auf deine Dokumente zuzugreifen
      </Text>

      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <View style={styles.loginOptionsContainer}>
        {Object.values(LOGIN_PROVIDERS).map(renderLoginOption)}
      </View>

      <View style={styles.legalContainer}>
        <Text style={[styles.legalText, { color: theme.textSecondary }]}>
          Mit der Anmeldung stimmst du unseren{' '}
          <Text style={styles.legalLink} onPress={handlePrivacyPress}>
            Nutzungsbedingungen und der Datenschutzerklärung
          </Text>{' '}
          zu.
        </Text>
      </View>
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
    marginBottom: spacing.large,
  },
  errorContainer: {
    backgroundColor: colors.semantic.error + '20',
    borderRadius: borderRadius.medium,
    padding: spacing.medium,
    marginBottom: spacing.large,
    width: '100%',
  },
  errorText: {
    ...typography.body,
    color: colors.semantic.error,
    textAlign: 'center',
  },
  loginOptionsContainer: {
    width: '100%',
    gap: spacing.small,
  },
  loginOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.medium,
    borderWidth: 1.5,
    borderRadius: borderRadius.medium,
    minHeight: 70,
  },
  loginTextContent: {
    flex: 1,
    justifyContent: 'center',
  },
  loginTitle: {
    ...typography.button,
    fontWeight: '600',
    marginBottom: spacing.xxsmall,
  },
  loginDescription: {
    ...typography.bodySmall,
    opacity: 0.8,
  },
  legalContainer: {
    marginTop: spacing.large,
    paddingHorizontal: spacing.medium,
  },
  legalText: {
    ...typography.caption,
    textAlign: 'center',
  },
  legalLink: {
    color: colors.primary[600],
    textDecorationLine: 'underline',
  },
});
