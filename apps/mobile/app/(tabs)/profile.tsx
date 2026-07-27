import { useAuth } from '@gruenerator/shared/hooks';
import { getSettingsEntry } from '@gruenerator/shared/settings';
import { useAuthStore } from '@gruenerator/shared/stores';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View, ActivityIndicator, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, ProfileAvatar } from '../../components/common';
import {
  SettingsGroup,
  SettingsRow,
  SettingsScreen,
  SettingsPickerSheet,
  useSurfaceStyles,
  type PickerOption,
} from '../../components/settings';
import { useTheme } from '../../hooks/useTheme';
import { logout } from '../../services/auth';
import { fetchRoles } from '../../services/roles';
import { usePreferencesStore, type ThemeMode } from '../../stores/preferencesStore';
import { spacing, colors, borderRadius, typography, BODY_FONT } from '../../theme';
import { route } from '../../types/routes';

type Locale = 'de-DE' | 'de-AT';

const THEME_OPTIONS: readonly PickerOption<ThemeMode>[] = [
  {
    value: 'system',
    label: 'Automatisch',
    description: 'Folgt dem System',
    icon: 'contrast-outline',
  },
  { value: 'light', label: 'Hell', icon: 'sunny-outline' },
  { value: 'dark', label: 'Dunkel', icon: 'moon-outline' },
];

const THEME_LABELS: Record<ThemeMode, string> = {
  system: 'Automatisch',
  light: 'Hell',
  dark: 'Dunkel',
};

const LOCALE_OPTIONS: readonly PickerOption<Locale>[] = [
  { value: 'de-DE', label: 'Deutschland', icon: 'flag-outline' },
  { value: 'de-AT', label: 'Österreich', icon: 'flag-outline' },
];

const LOCALE_LABELS: Record<Locale, string> = {
  'de-DE': 'Deutschland',
  'de-AT': 'Österreich',
};

/** `null` while nothing is open; otherwise the picker being shown. */
type OpenPicker = 'theme' | 'locale' | null;

/**
 * The settings surface: state first, editing second.
 *
 * Every row carries its current value as a subtitle so the screen reads without
 * being tapped — the deliberate difference to web, whose dialog is a place you
 * go to *change* things. Mobile is where you check what is set; the heavy
 * management surfaces (Briefköpfe, Texte anlernen, Websites, Wolke,
 * Erinnerungen, das Anlegen von Rollen und Konnektoren) stay on the desktop.
 *
 * Row wording comes from the shared settings catalog, so a rename on web renames
 * it here too.
 */
export default function ProfileScreen() {
  const { user, isAuthenticated, isLoading, isLoggingOut } = useAuth();
  const themeMode = usePreferencesStore((s) => s.themeMode);
  const setThemeMode = usePreferencesStore((s) => s.setThemeMode);
  const updateLocale = useAuthStore((s) => s.updateLocale);
  const { card } = useSurfaceStyles();
  const theme = useTheme();

  const [picker, setPicker] = useState<OpenPicker>(null);
  const [roleCount, setRoleCount] = useState<number | null>(null);

  // Re-read on focus so a role changed on the web app shows up on return.
  useFocusEffect(
    useCallback(() => {
      if (!isAuthenticated) return;
      let active = true;
      void fetchRoles().then((roles) => {
        if (active) setRoleCount(roles.length);
      });
      return () => {
        active = false;
      };
    }, [isAuthenticated])
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.centeredScreen} edges={['top']}>
        <ActivityIndicator size="large" color={colors.primary[600]} />
      </SafeAreaView>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <SettingsScreen title="Einstellungen">
        <View style={styles.signedOut}>
          <Text style={styles.signedOutText}>Melde dich an, um dein Profil zu verwalten</Text>
          <Button onPress={() => router.push(route('/(auth)/login'))}>Anmelden</Button>
        </View>
      </SettingsScreen>
    );
  }

  const locale = (user.locale ?? 'de-DE') as Locale;

  return (
    <>
      <SettingsScreen title="Einstellungen">
        <Pressable
          onPress={() => router.push(route('/(focused)/settings/konto'))}
          style={({ pressed }) => [styles.account, card, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Konto"
        >
          <ProfileAvatar
            avatarRobotId={user.avatar_robot_id}
            displayName={user.display_name}
            email={user.email}
            size="medium"
          />
          <View style={styles.accountText}>
            <Text style={[styles.accountName, { color: theme.text }]} numberOfLines={1}>
              {user.display_name || 'Dein Konto'}
            </Text>
            <Text style={[styles.accountEmail, { color: theme.textSecondary }]} numberOfLines={1}>
              {user.email}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
        </Pressable>

        <SettingsGroup>
          <SettingsRow
            icon="contrast-outline"
            title={getSettingsEntry('allgemein.aussehen').title}
            value={THEME_LABELS[themeMode]}
            onPress={() => setPicker('theme')}
          />
          <SettingsRow
            icon="flag-outline"
            title={getSettingsEntry('allgemein.sprache').title}
            value={LOCALE_LABELS[locale]}
            onPress={() => setPicker('locale')}
            last
          />
        </SettingsGroup>

        <SettingsGroup>
          <SettingsRow
            icon="ribbon-outline"
            title={getSettingsEntry('personalisierung.rollen').title}
            value={
              roleCount === null
                ? 'Wird geladen…'
                : roleCount === 0
                  ? 'Keine Rollen'
                  : `${roleCount} ${roleCount === 1 ? 'Rolle' : 'Rollen'}`
            }
            onPress={() => router.push(route('/(focused)/settings/rollen'))}
            last
          />
        </SettingsGroup>

        <SettingsGroup>
          <SettingsRow
            icon="school-outline"
            title="Einführung erneut ansehen"
            onPress={() => router.push(route('/(auth)/onboarding'))}
            last
          />
        </SettingsGroup>

        <SettingsGroup>
          <SettingsRow
            icon="log-out-outline"
            title={isLoggingOut ? 'Wird abgemeldet…' : 'Abmelden'}
            destructive
            disabled={isLoggingOut}
            onPress={() => void logout()}
            last
          />
        </SettingsGroup>
      </SettingsScreen>

      <SettingsPickerSheet
        visible={picker === 'theme'}
        onClose={() => setPicker(null)}
        title={getSettingsEntry('allgemein.aussehen').title}
        hint={getSettingsEntry('allgemein.aussehen').description}
        options={THEME_OPTIONS}
        selected={themeMode}
        onSelect={(mode) => void setThemeMode(mode)}
      />

      <SettingsPickerSheet
        visible={picker === 'locale'}
        onClose={() => setPicker(null)}
        title={getSettingsEntry('allgemein.sprache').title}
        hint={getSettingsEntry('allgemein.sprache').description}
        options={LOCALE_OPTIONS}
        selected={locale}
        onSelect={(next) => {
          // Region is server-side state — it decides whether the user gets
          // Austrian or German wording and content — so it round-trips rather
          // than sitting in a local store.
          if (next === locale) return;
          void updateLocale(next).catch(() => {
            Alert.alert('Fehler', 'Region konnte nicht gespeichert werden.');
          });
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  centeredScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signedOut: {
    alignItems: 'center',
    gap: spacing.medium,
    paddingTop: spacing.xxlarge,
  },
  signedOutText: {
    ...typography.body,
    textAlign: 'center',
    color: colors.grey[500],
  },
  account: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    padding: spacing.medium,
    borderRadius: borderRadius.large,
    borderCurve: 'continuous',
  },
  accountText: {
    flex: 1,
    gap: 1,
  },
  accountName: {
    fontFamily: BODY_FONT,
    fontSize: 17,
    fontWeight: '600',
  },
  accountEmail: {
    fontFamily: BODY_FONT,
    fontSize: 14,
  },
  pressed: {
    opacity: 0.6,
  },
});
