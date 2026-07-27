import { type ChatBackground } from '@gruenerator/contracts';
import { getAllRobotIds, getRobotAvatarUrl } from '@gruenerator/shared/avatar';
import { useAuth } from '@gruenerator/shared/hooks';
import { AT_EBENEN, DE_EBENEN, type UserRole } from '@gruenerator/shared/roles';
import {
  CHAT_BACKGROUND_PRESETS,
  getSettingsEntry,
  resolveChatBackground,
} from '@gruenerator/shared/settings';
import { useAuthStore } from '@gruenerator/shared/stores';
import { Ionicons, type IoniconsIconName } from '@react-native-vector-icons/ionicons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Alert,
  Platform,
} from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { logout } from '../../services/auth';
import { setChatBackground } from '../../services/chatBackground';
import { fetchRoles } from '../../services/roles';
import { usePreferencesStore, type ThemeMode } from '../../stores/preferencesStore';
import { useSettingsSheetStore, type SettingsDetail } from '../../stores/settingsSheetStore';
import { spacing, colors, borderRadius, BODY_FONT } from '../../theme';
import { chatBackgroundColor } from '../../theme/chatBackgrounds';
import { route } from '../../types/routes';
import { BottomSheet } from '../common/BottomSheet';
import { ListGroup, ListRow } from '../common/ListRow';

import { AppUpdateRow } from './AppUpdateRow';

/**
 * The settings surface, whole.
 *
 * One sheet that swaps its own content, rather than a screen plus a modal per
 * picker: mixing a route push with nested bottom sheets meant three different
 * animations to reach three settings that sit one under the other. The composer's
 * "+" menu solved the same problem the same way, which is why the two look and
 * behave alike.
 *
 * Mounted once at the root, driven by `useSettingsSheetStore`, so anything that
 * wants settings just opens it — no navigation, and no second copy on a screen
 * that happens to be focused.
 */

// Robot avatar 10 ("Wolki") is unlocked via a Wolke connection, which isn't
// available on mobile — so the picker offers 1–9.
const PICKABLE_ROBOT_IDS = getAllRobotIds().filter((id) => id !== 10);

type Locale = 'de-DE' | 'de-AT';

const DETAIL_TITLES: Record<SettingsDetail, string> = {
  friend: getSettingsEntry('friends.avatar').title,
  roles: getSettingsEntry('personalisierung.rollen').title,
  theme: getSettingsEntry('allgemein.aussehen').title,
  chatBackground: getSettingsEntry('allgemein.chatHintergrund').title,
  locale: getSettingsEntry('allgemein.sprache').title,
  accessibility: 'Barrierefreiheit',
};

const THEME_OPTIONS: readonly { value: ThemeMode; label: string; icon: IoniconsIconName }[] = [
  { value: 'system', label: 'Automatisch', icon: 'contrast-outline' },
  { value: 'light', label: 'Hell', icon: 'sunny-outline' },
  { value: 'dark', label: 'Dunkel', icon: 'moon-outline' },
];

const THEME_LABELS: Record<ThemeMode, string> = {
  system: 'Automatisch',
  light: 'Hell',
  dark: 'Dunkel',
};

const LOCALE_OPTIONS: readonly { value: Locale; label: string }[] = [
  { value: 'de-DE', label: 'Deutschland' },
  { value: 'de-AT', label: 'Österreich' },
];

const LOCALE_LABELS: Record<Locale, string> = {
  'de-DE': 'Deutschland',
  'de-AT': 'Österreich',
};

/**
 * Counts only the explicit overrides. The OS may be reducing motion on its own,
 * but claiming "1 aktiviert" for a switch the user never touched would be a lie
 * about their own settings.
 */
function accessibilitySummary(reduceMotion?: boolean, reduceTransparency?: boolean): string {
  const count = Number(reduceMotion ?? false) + Number(reduceTransparency ?? false);
  return count === 0 ? 'Folgt dem System' : `${count} aktiviert`;
}

/**
 * Android only, and not out of caution: on iOS the tab bar is a real UITabBar
 * and `BlurTargetView` compiles to a plain `View`, so the switch would have
 * nothing to turn off. A control that does nothing is worse than no control.
 */
const SHOWS_PERFORMANCE_MODE = Platform.OS === 'android';

export function SettingsSheet() {
  const theme = useTheme();
  const { user, isLoggingOut } = useAuth();

  const isOpen = useSettingsSheetStore((s) => s.isOpen);
  const detail = useSettingsSheetStore((s) => s.detail);
  const setDetail = useSettingsSheetStore((s) => s.setDetail);
  const close = useSettingsSheetStore((s) => s.close);

  const themeMode = usePreferencesStore((s) => s.themeMode);
  const setThemeMode = usePreferencesStore((s) => s.setThemeMode);
  const performanceMode = usePreferencesStore((s) => s.performanceMode);
  const setPerformanceMode = usePreferencesStore((s) => s.setPerformanceMode);
  const updateLocale = useAuthStore((s) => s.updateLocale);
  const updateAvatar = useAuthStore((s) => s.updateAvatar);
  const updateProfile = useAuthStore((s) => s.updateProfile);

  const [roles, setRoles] = useState<UserRole[] | null>(null);

  // Read on open, not on mount: the sheet lives for the whole session, so a
  // role changed on the web app would otherwise never be picked up.
  useEffect(() => {
    if (!isOpen || !user) return;
    let active = true;
    void fetchRoles().then((next) => {
      if (active) setRoles(next);
    });
    return () => {
      active = false;
    };
  }, [isOpen, user]);

  const leave = useCallback(
    (action: () => void) => {
      close();
      action();
    },
    [close]
  );

  if (!user) return null;

  const locale = (user.locale ?? 'de-DE') as Locale;
  const chatBackground = resolveChatBackground(user.chat_background);
  const hasRoles = roles !== null && roles.length > 0;
  const ebenen = locale === 'de-AT' ? AT_EBENEN : DE_EBENEN;

  const note = (text: string) => (
    <Text style={[styles.note, { color: theme.textSecondary }]}>{text}</Text>
  );

  const detailBody = (): ReactNode => {
    if (detail === 'theme') {
      return (
        <ListGroup>
          {THEME_OPTIONS.map((option, i) => (
            <ListRow
              key={option.value}
              icon={option.icon}
              title={option.label}
              selected={themeMode === option.value}
              last={i === THEME_OPTIONS.length - 1}
              onPress={() => {
                void setThemeMode(option.value);
                setDetail(null);
              }}
            />
          ))}
        </ListGroup>
      );
    }

    if (detail === 'locale') {
      return (
        <ListGroup>
          {LOCALE_OPTIONS.map((option, i) => (
            <ListRow
              key={option.value}
              icon="flag-outline"
              title={option.label}
              selected={locale === option.value}
              last={i === LOCALE_OPTIONS.length - 1}
              onPress={() => {
                if (option.value !== locale) {
                  void updateLocale(option.value).catch(() => {
                    Alert.alert('Fehler', 'Region konnte nicht gespeichert werden.');
                  });
                }
                setDetail(null);
              }}
            />
          ))}
        </ListGroup>
      );
    }

    if (detail === 'chatBackground') {
      return (
        <>
          {note(getSettingsEntry('allgemein.chatHintergrund').description ?? '')}
          <View style={styles.swatches}>
            {CHAT_BACKGROUND_PRESETS.map((preset) => {
              const color = chatBackgroundColor(preset.key);
              const active = preset.key === chatBackground.key;
              return (
                <Pressable
                  key={preset.key}
                  onPress={() => {
                    void setChatBackground(preset.key as ChatBackground).catch(() => {
                      Alert.alert('Fehler', 'Chat-Hintergrund konnte nicht gespeichert werden.');
                    });
                    setDetail(null);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={preset.label}
                  accessibilityState={{ selected: active }}
                  style={[
                    styles.swatch,
                    {
                      backgroundColor: color ?? 'transparent',
                      borderColor: active ? colors.primary[600] : theme.border,
                      borderWidth: active ? 2 : StyleSheet.hairlineWidth,
                    },
                  ]}
                >
                  {active && (
                    <Ionicons
                      name="checkmark"
                      size={18}
                      color={color ? colors.grey[900] : theme.text}
                    />
                  )}
                </Pressable>
              );
            })}
          </View>
          {note(`${chatBackground.label} — ${chatBackground.description}`)}
        </>
      );
    }

    if (detail === 'accessibility') {
      const toggle = (field: 'reduce_motion' | 'reduce_transparency') => (
        <Switch
          value={user[field] ?? false}
          onValueChange={(value) => {
            void updateProfile({ [field]: value }).catch(() => {
              Alert.alert('Fehler', 'Einstellung konnte nicht gespeichert werden.');
            });
          }}
          trackColor={{ true: colors.primary[600], false: colors.grey[300] }}
        />
      );
      return (
        <>
          {note(
            'Diese Schalter gelten zusätzlich zu den Einstellungen deines Systems — dort Aktiviertes bleibt aktiv, auch wenn hier nichts gesetzt ist.'
          )}
          <ListGroup>
            <ListRow
              icon="pulse-outline"
              title={getSettingsEntry('barrierefreiheit.animationen').title}
              value="Weniger Bewegung in Verläufen und Übergängen"
              accessory={toggle('reduce_motion')}
            />
            <ListRow
              icon="layers-outline"
              title={getSettingsEntry('barrierefreiheit.transparenz').title}
              value="Deckt durchscheinende Flächen wie die Tab-Leiste ab"
              accessory={toggle('reduce_transparency')}
              last
            />
          </ListGroup>
        </>
      );
    }

    if (detail === 'friend') {
      return (
        <>
          {note(getSettingsEntry('friends.avatar').description ?? '')}
          <View style={styles.grid}>
            {PICKABLE_ROBOT_IDS.map((id) => {
              const selected = String(id) === user.avatar_robot_id;
              return (
                <Pressable
                  key={id}
                  onPress={() => {
                    if (String(id) !== user.avatar_robot_id) {
                      void updateAvatar(String(id)).catch(() => {
                        Alert.alert('Fehler', 'Friend konnte nicht gespeichert werden.');
                      });
                    }
                    setDetail(null);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Friend ${id}`}
                  accessibilityState={{ selected }}
                  style={[
                    styles.option,
                    {
                      backgroundColor: theme.surface,
                      borderColor: selected ? colors.primary[600] : 'transparent',
                    },
                  ]}
                >
                  <Image
                    source={{ uri: getRobotAvatarUrl(id) }}
                    style={styles.optionImage}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    recyclingKey={String(id)}
                  />
                </Pressable>
              );
            })}
          </View>
          {note('Wolki gibt es nur mit einer verbundenen Wolke — das richtest du am Rechner ein.')}
        </>
      );
    }

    // roles
    return (
      <>
        {note(getSettingsEntry('personalisierung.rollen').description ?? '')}
        {hasRoles && (
          <ListGroup>
            {(roles ?? []).map((role, i) => {
              const ebene = ebenen.find((e) => e.id === role.ebene);
              const subtitle = [role.gliederung, role.bundesland, role.abgeordnete]
                .filter(Boolean)
                .join(' · ');
              return (
                <ListRow
                  // Roles carry no id and two can be identical. The list is
                  // read-only and never reordered, so the index is stable here.
                  // eslint-disable-next-line react/no-array-index-key
                  key={`${role.ebene}-${role.rolle}-${i}`}
                  icon={ebene ? 'ribbon-outline' : 'pin-outline'}
                  title={role.rolle}
                  value={subtitle || null}
                  last={i === (roles?.length ?? 0) - 1}
                />
              );
            })}
          </ListGroup>
        )}
      </>
    );
  };

  return (
    <BottomSheet visible={isOpen} onClose={close} backgroundColor={theme.background}>
      <View style={styles.header}>
        <Pressable
          onPress={() => (detail ? setDetail(null) : close())}
          hitSlop={10}
          style={styles.headerButton}
          accessibilityLabel={detail ? 'Zurück' : 'Schließen'}
        >
          <Ionicons name={detail ? 'chevron-back' : 'close'} size={24} color={theme.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
          {detail ? DETAIL_TITLES[detail] : 'Einstellungen'}
        </Text>
        <View style={styles.headerButton} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {detail ? (
          detailBody()
        ) : (
          <>
            {/* One continuous list. Splitting these rows into cards produced a
                stack of mostly single-row slabs whose gaps read as arbitrary. */}
            <ListGroup>
              <ListRow
                icon="happy-outline"
                title={getSettingsEntry('friends.avatar').title}
                onPress={() => setDetail('friend')}
              />
              {/* Hidden until there is something to read: roles can only be
                  created on web, so an empty row would advertise a pane that
                  shows nothing and offers no way to fill it. */}
              {hasRoles && (
                <ListRow
                  icon="ribbon-outline"
                  title={getSettingsEntry('personalisierung.rollen').title}
                  value={`${roles?.length} ${roles?.length === 1 ? 'Rolle' : 'Rollen'}`}
                  onPress={() => setDetail('roles')}
                />
              )}
              <ListRow
                icon="contrast-outline"
                title={getSettingsEntry('allgemein.aussehen').title}
                value={THEME_LABELS[themeMode]}
                onPress={() => setDetail('theme')}
              />
              <ListRow
                icon="color-palette-outline"
                title={getSettingsEntry('allgemein.chatHintergrund').title}
                value={chatBackground.label}
                onPress={() => setDetail('chatBackground')}
              />
              <ListRow
                icon="flag-outline"
                title={getSettingsEntry('allgemein.sprache').title}
                value={LOCALE_LABELS[locale]}
                onPress={() => setDetail('locale')}
              />
              <ListRow
                icon="accessibility-outline"
                title="Barrierefreiheit"
                value={accessibilitySummary(user.reduce_motion, user.reduce_transparency)}
                onPress={() => setDetail('accessibility')}
              />
              {SHOWS_PERFORMANCE_MODE && (
                <ListRow
                  icon="speedometer-outline"
                  title={getSettingsEntry('barrierefreiheit.leistung').title}
                  value={getSettingsEntry('barrierefreiheit.leistung').description}
                  valueLines={2}
                  accessory={
                    <Switch
                      value={performanceMode}
                      onValueChange={(value) => void setPerformanceMode(value)}
                      trackColor={{ true: colors.primary[600], false: colors.grey[300] }}
                    />
                  }
                />
              )}
              <ListRow
                icon="school-outline"
                title="Einführung erneut ansehen"
                onPress={() => leave(() => router.push(route('/(auth)/onboarding')))}
              />
              <AppUpdateRow />
            </ListGroup>

            {/* Plain text, not a card row: logging out is rare, it already sits
                in the profile menu, and as a red row it was the loudest thing on
                a surface that is mostly for reading. */}
            <Pressable
              onPress={() => leave(() => void logout())}
              disabled={isLoggingOut}
              style={({ pressed }) => [styles.logout, pressed && styles.pressed]}
              accessibilityRole="button"
            >
              <Text style={[styles.logoutText, { color: theme.textSecondary }]}>
                {isLoggingOut ? 'Wird abgemeldet…' : 'Abmelden'}
              </Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.medium,
    paddingBottom: spacing.medium,
  },
  headerButton: {
    width: 32,
    alignItems: 'flex-start',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: 'Raleway_700Bold',
    fontSize: 22,
  },
  content: {
    paddingHorizontal: spacing.medium,
    paddingBottom: spacing.large,
    gap: spacing.large,
  },
  note: {
    fontFamily: BODY_FONT,
    fontSize: 13,
    lineHeight: 18,
  },
  swatches: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.small,
  },
  swatch: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: spacing.medium,
  },
  option: {
    width: '30%',
    aspectRatio: 1,
    borderRadius: borderRadius.large,
    borderCurve: 'continuous',
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionImage: {
    width: '78%',
    height: '78%',
  },
  logout: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing.xsmall,
  },
  logoutText: {
    fontFamily: BODY_FONT,
    fontSize: 14,
  },
  pressed: {
    opacity: 0.6,
  },
});
