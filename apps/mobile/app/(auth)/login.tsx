import { useAuth } from '@gruenerator/shared/hooks';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Image as BrandImage } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  useColorScheme,
  ActivityIndicator,
  Linking,
  AccessibilityInfo,
  type ImageSourcePropType,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { login, type AuthSource } from '../../services/auth';
import { darkTheme, lightTheme, spacing, typography, colors, borderRadius } from '../../theme';

/* eslint-disable @typescript-eslint/no-require-imports */
const BRAND_LOGO = require('../../assets/images/sonnenblume.png') as ImageSourcePropType;

const HEADLINE = 'KI, die die Welt nicht brennen sehen will.';

type Country = 'de' | 'at';
const COUNTRY_LABEL: Record<Country, string> = { de: 'Deutschland', at: 'Österreich' };
const COUNTRY_SOURCE: Record<Country, AuthSource> = {
  de: 'gruenes-netz-login',
  at: 'gruene-oesterreich-login',
};
const other = (c: Country): Country => (c === 'de' ? 'at' : 'de');

/** Sunrise backdrop: a warm radial glow over the base, matching startpage-hero.css.
 *  The resting green-gold glow fades in once; opening the login crossfades a
 *  warmer yellow layer on top. */
function Sunrise({ isDark, warm }: { isDark: boolean; warm: SharedValue<number> }) {
  const warmStyle = useAnimatedStyle(() => ({ opacity: warm.value }));
  return (
    <>
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
      <Animated.View style={[StyleSheet.absoluteFill, warmStyle]} pointerEvents="none">
        <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
          <Defs>
            <RadialGradient id="sp-warm" cx="50%" cy="50%" r="90%">
              <Stop offset="0%" stopColor="#ffe14d" stopOpacity={1} />
              <Stop offset="14%" stopColor="#ffe98f" stopOpacity={1} />
              <Stop offset="55%" stopColor="#ffec00" stopOpacity={0.22} />
              <Stop offset="78%" stopColor="#ffec00" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#sp-warm)" />
        </Svg>
      </Animated.View>
    </>
  );
}

export default function LoginScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const theme = isDark ? darkTheme : lightTheme;
  const { locale } = useAuth();

  const [loginOpen, setLoginOpen] = useState(false);
  const [loadingSource, setLoadingSource] = useState<AuthSource | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isLoading = loadingSource !== null;

  // No reliable pre-login country signal (there is no user yet, so `locale` is
  // the de-DE default), so Deutschland is the primary option; both countries are
  // always one tap away via the picker. If a de-AT locale is ever known, honour it.
  const detected: Country = locale === 'de-AT' ? 'at' : 'de';

  // Play-once entrance + warm crossfade (respecting reduce-motion).
  const enter = useSharedValue(0);
  const warm = useSharedValue(0);
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
  useEffect(() => {
    warm.value = withTiming(loginOpen ? (isDark ? 0.4 : 1) : 0, { duration: 900 });
  }, [loginOpen, isDark, warm]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: enter.value }));
  const contentStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateY: (1 - enter.value) * 20 }],
  }));

  const startLogin = async (source: AuthSource) => {
    setLoadingSource(source);
    setError(null);
    try {
      const result = await login(source);
      if (result.success) {
        void router.replace('/(tabs)');
      } else {
        setError(result.error || 'Anmeldung fehlgeschlagen');
      }
    } catch (err) {
      setError('Ein unerwarteter Fehler ist aufgetreten');
      console.error('[Login] Error:', err);
    } finally {
      setLoadingSource(null);
    }
  };

  const headline = loginOpen ? `Loggst du dich aus ${COUNTRY_LABEL[detected]} ein?` : HEADLINE;

  return (
    <View style={[styles.root, { backgroundColor: isDark ? theme.background : '#fefcf5' }]}>
      <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]} pointerEvents="none">
        <Sunrise isDark={isDark} warm={warm} />
      </Animated.View>

      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <Animated.View style={[styles.hero, contentStyle]}>
          <BrandImage source={BRAND_LOGO} style={styles.logo} contentFit="contain" />

          <Text style={[styles.headline, { color: theme.text }]}>{headline}</Text>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {loginOpen ? (
            <View style={styles.cta}>
              <PillButton
                label={`Ja, ${COUNTRY_LABEL[detected]}`}
                loading={loadingSource === COUNTRY_SOURCE[detected]}
                disabled={isLoading}
                onPress={() => startLogin(COUNTRY_SOURCE[detected])}
              />
              <PillButton
                label={`Nein, ${COUNTRY_LABEL[other(detected)]}`}
                loading={loadingSource === COUNTRY_SOURCE[other(detected)]}
                disabled={isLoading}
                onPress={() => startLogin(COUNTRY_SOURCE[other(detected)])}
              />
              <Pressable
                onPress={() => startLogin('netzbegruenung-login')}
                disabled={isLoading}
                style={styles.ghost}
              >
                {loadingSource === 'netzbegruenung-login' ? (
                  <ActivityIndicator size="small" color={theme.textSecondary} />
                ) : (
                  <Ionicons name="lock-closed-outline" size={15} color={theme.textSecondary} />
                )}
                <Text style={[styles.ghostText, { color: theme.textSecondary }]}>
                  Netzbegrünung Login
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setLoginOpen(false)}
                disabled={isLoading}
                style={styles.back}
              >
                <Text style={[styles.backText, { color: theme.textSecondary }]}>Zurück</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.cta}>
              <PillButton
                label="Login"
                icon="lock-closed"
                disabled={isLoading}
                onPress={() => setLoginOpen(true)}
              />
              <Text style={[styles.hint, { color: theme.textSecondary }]}>
                Exklusiv für Grüne Mitglieder.
              </Text>
            </View>
          )}
        </Animated.View>

        <View style={styles.footer}>
          <Text style={[styles.legal, { color: theme.textSecondary }]}>
            Mit der Anmeldung stimmst du unseren{' '}
            <Text
              style={styles.legalLink}
              onPress={() => void Linking.openURL('https://gruenerator.eu/datenschutz')}
            >
              Nutzungsbedingungen und der Datenschutzerklärung
            </Text>{' '}
            zu.
          </Text>
          <Pressable onPress={() => router.back()} disabled={isLoading} style={styles.cancel}>
            <Text style={[styles.cancelText, { color: theme.textSecondary }]}>Abbrechen</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

/** White floating pill, echo of .sp-provider / .sp-login. */
function PillButton({
  label,
  icon,
  loading = false,
  disabled = false,
  onPress,
}: {
  label: string;
  icon?: 'lock-closed';
  loading?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.pill,
        { opacity: disabled && !loading ? 0.6 : pressed ? 0.92 : 1 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color="#111111" />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={18} color="#111111" /> : null}
          <Text style={styles.pillText}>{label}</Text>
        </>
      )}
    </Pressable>
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
  cta: {
    alignSelf: 'stretch',
    alignItems: 'center',
    gap: spacing.small,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xsmall,
    alignSelf: 'stretch',
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
    fontSize: 17,
    fontWeight: '700',
    color: '#111111',
  },
  hint: {
    ...typography.bodySmall,
    marginTop: spacing.xsmall,
    opacity: 0.8,
  },
  ghost: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
    paddingVertical: spacing.xsmall,
  },
  ghostText: {
    fontSize: 14,
    fontWeight: '600',
  },
  back: {
    paddingVertical: spacing.xsmall,
    paddingHorizontal: spacing.small,
  },
  backText: {
    fontSize: 14,
    fontWeight: '600',
    opacity: 0.8,
  },
  errorBox: {
    backgroundColor: colors.semantic.error + '20',
    borderRadius: borderRadius.medium,
    padding: spacing.medium,
    alignSelf: 'stretch',
    maxWidth: 320,
  },
  errorText: {
    ...typography.body,
    color: colors.semantic.error,
    textAlign: 'center',
  },
  footer: {
    paddingBottom: spacing.medium,
    gap: spacing.small,
  },
  legal: {
    ...typography.caption,
    textAlign: 'center',
    paddingHorizontal: spacing.medium,
  },
  legalLink: {
    color: colors.primary[600],
    textDecorationLine: 'underline',
  },
  cancel: {
    alignSelf: 'center',
    padding: spacing.small,
  },
  cancelText: {
    ...typography.body,
  },
});
