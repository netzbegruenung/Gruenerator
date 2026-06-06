import { getAllRobotIds, getRobotAvatarUrl } from '@gruenerator/shared/avatar';
import { useAuth } from '@gruenerator/shared/hooks';
import { useAuthStore } from '@gruenerator/shared/stores';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  useColorScheme,
  ActivityIndicator,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, ProfileAvatar } from '../../components/common';
import { BottomSheet } from '../../components/common/BottomSheet';
import { AppSettingsSection } from '../../components/profile/AppSettingsSection';
import { RolesSection } from '../../components/profile/RolesSection';
import { logout } from '../../services/auth';
import { lightTheme, darkTheme, typography, spacing, colors, borderRadius } from '../../theme';

// Robot avatar 10 ("Wolki") is unlocked via a Wolke connection, which isn't
// available on mobile — so the picker offers 1–9.
const PICKABLE_ROBOT_IDS = getAllRobotIds().filter((id) => id !== 10);

function AvatarPickerSheet({
  visible,
  currentId,
  onClose,
  onSelect,
}: {
  visible: boolean;
  currentId?: string;
  onClose: () => void;
  onSelect: (id: number) => void;
}) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  return (
    <BottomSheet visible={visible} onClose={onClose} maxHeight="60%">
      <Text style={[styles.sheetTitle, { color: theme.text }]}>Avatar wählen</Text>
      <View style={styles.avatarGrid}>
        {PICKABLE_ROBOT_IDS.map((id) => {
          const selected = String(id) === currentId;
          return (
            <Pressable
              key={id}
              onPress={() => onSelect(id)}
              style={[
                styles.avatarOption,
                {
                  borderColor: selected ? colors.primary[600] : 'transparent',
                  backgroundColor: theme.surface,
                },
              ]}
            >
              <Image
                source={{ uri: getRobotAvatarUrl(id) }}
                style={styles.avatarImage}
                contentFit="cover"
                cachePolicy="memory-disk"
                recyclingKey={String(id)}
              />
            </Pressable>
          );
        })}
      </View>
    </BottomSheet>
  );
}

export default function ProfileScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const { user, isAuthenticated, isLoading, isLoggingOut } = useAuth();
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const updateAvatar = useAuthStore((s) => s.updateAvatar);
  const updateLocale = useAuthStore((s) => s.updateLocale);

  const [displayName, setDisplayName] = useState(user?.display_name ?? '');
  const [avatarSheetVisible, setAvatarSheetVisible] = useState(false);

  const handleLogin = () => {
    router.push('/(auth)/login');
  };

  const handleNameBlur = () => {
    const trimmed = displayName.trim();
    if (trimmed && trimmed !== user?.display_name) {
      void updateProfile({ display_name: trimmed }).catch(() => {
        setDisplayName(user?.display_name ?? '');
        Alert.alert('Fehler', 'Name konnte nicht gespeichert werden.');
      });
    }
  };

  const handleSelectAvatar = (id: number) => {
    setAvatarSheetVisible(false);
    void updateAvatar(String(id)).catch(() => {
      Alert.alert('Fehler', 'Avatar konnte nicht gespeichert werden.');
    });
  };

  const handleSelectLocale = (locale: 'de-DE' | 'de-AT') => {
    if (locale === user?.locale) return;
    void updateLocale(locale).catch(() => {
      Alert.alert('Fehler', 'Region konnte nicht gespeichert werden.');
    });
  };

  if (isLoading) {
    return (
      <SafeAreaView
        style={[styles.container, styles.centered, { backgroundColor: theme.background }]}
        edges={['top']}
      >
        <ActivityIndicator size="large" color={colors.primary[600]} />
      </SafeAreaView>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.background }]}
        edges={['top']}
      >
        <View style={[styles.centered, { flex: 1, paddingTop: spacing.xxlarge }]}>
          <Text style={[styles.title, { color: theme.text }]}>Profil</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Melde dich an, um dein Profil zu verwalten
          </Text>
          <View style={styles.loginButton}>
            <Button onPress={handleLogin}>Anmelden</Button>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Top bar — logout */}
        <View style={styles.topBar}>
          <Pressable
            onPress={() => void logout()}
            disabled={isLoggingOut}
            hitSlop={8}
            accessibilityLabel="Abmelden"
            style={styles.logoutIcon}
          >
            {isLoggingOut ? (
              <ActivityIndicator size="small" color={theme.textSecondary} />
            ) : (
              <Ionicons name="log-out-outline" size={24} color={theme.textSecondary} />
            )}
          </Pressable>
        </View>

        {/* Identity header */}
        <View style={styles.header}>
          <Pressable onPress={() => setAvatarSheetVisible(true)} style={styles.avatarWrap}>
            <ProfileAvatar
              avatarRobotId={user.avatar_robot_id}
              displayName={user.display_name}
              email={user.email}
              size="large"
            />
            <View
              style={[
                styles.avatarEditBadge,
                { backgroundColor: colors.primary[600], borderColor: theme.background },
              ]}
            >
              <Ionicons name="pencil" size={12} color={colors.white} />
            </View>
          </Pressable>

          <TextInput
            value={displayName}
            onChangeText={setDisplayName}
            onBlur={handleNameBlur}
            placeholder="Dein Name"
            placeholderTextColor={theme.textSecondary}
            style={[styles.nameInput, { color: theme.text }]}
            returnKeyType="done"
          />
          <Text style={[styles.email, { color: theme.textSecondary }]}>{user.email}</Text>

          {/* Region / locale */}
          <View style={[styles.localeSwitch, { borderColor: theme.border }]}>
            {[
              { value: 'de-DE' as const, label: 'Deutschland' },
              { value: 'de-AT' as const, label: 'Österreich' },
            ].map((opt) => {
              const active = (user.locale ?? 'de-DE') === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => handleSelectLocale(opt.value)}
                  style={[
                    styles.localeOption,
                    { backgroundColor: active ? colors.primary[600] : 'transparent' },
                  ]}
                >
                  <Text
                    style={[
                      styles.localeText,
                      { color: active ? colors.white : theme.textSecondary },
                    ]}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Rollen */}
        <RolesSection />

        {/* App-Einstellungen */}
        <AppSettingsSection />
      </ScrollView>

      <AvatarPickerSheet
        visible={avatarSheetVisible}
        currentId={user.avatar_robot_id}
        onClose={() => setAvatarSheetVisible(false)}
        onSelect={handleSelectAvatar}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.medium,
  },
  title: {
    ...typography.h2,
    marginBottom: spacing.small,
  },
  subtitle: {
    ...typography.body,
    textAlign: 'center',
    marginBottom: spacing.large,
  },
  loginButton: {
    width: '100%',
    maxWidth: 300,
  },
  scrollContent: {
    paddingVertical: spacing.large,
    gap: spacing.large,
  },
  header: {
    alignItems: 'center',
    gap: spacing.small,
    paddingHorizontal: spacing.medium,
  },
  avatarWrap: {
    position: 'relative',
  },
  avatarEditBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameInput: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    minWidth: 200,
    paddingVertical: 2,
  },
  email: {
    fontSize: 14,
  },
  localeSwitch: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: borderRadius.pill,
    borderCurve: 'continuous',
    padding: 2,
    marginTop: spacing.xsmall,
  },
  localeOption: {
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.xsmall,
    borderRadius: borderRadius.pill,
    borderCurve: 'continuous',
  },
  localeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    paddingHorizontal: spacing.medium,
    paddingBottom: spacing.small,
  },
  avatarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.small,
    paddingHorizontal: spacing.medium,
  },
  avatarOption: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: 58,
    height: 58,
    borderRadius: 29,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.medium,
    marginBottom: -spacing.small,
  },
  logoutIcon: {
    padding: spacing.xxsmall,
  },
});
