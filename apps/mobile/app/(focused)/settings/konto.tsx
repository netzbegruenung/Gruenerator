import { getAllRobotIds, getRobotAvatarUrl } from '@gruenerator/shared/avatar';
import { useAuth } from '@gruenerator/shared/hooks';
import { getSettingsEntry } from '@gruenerator/shared/settings';
import { useAuthStore } from '@gruenerator/shared/stores';
import { Image } from 'expo-image';
import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';

import { ProfileAvatar } from '../../../components/common';
import { BottomSheet } from '../../../components/common/BottomSheet';
import { SettingsGroup, SettingsRow, SettingsScreen } from '../../../components/settings';
import { useTheme } from '../../../hooks/useTheme';
import { spacing, colors, BODY_FONT } from '../../../theme';

// Robot avatar 10 ("Wolki") is unlocked via a Wolke connection, which isn't
// available on mobile — so the picker offers 1–9.
const PICKABLE_ROBOT_IDS = getAllRobotIds().filter((id) => id !== 10);

/**
 * The account surface: who you are signed in as, and the one thing here that is
 * actually yours to change — the Friend that represents you.
 *
 * Name, username and e-mail are deliberately read-only. They mirror the Grüner
 * Login, which is their source of truth; web has treated them that way since the
 * Konto tab was built, while mobile still offered a name field that wrote back a
 * value the next SSO refresh could overwrite.
 */
export default function KontoScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const updateAvatar = useAuthStore((s) => s.updateAvatar);
  const [pickerVisible, setPickerVisible] = useState(false);

  if (!user) return <SettingsScreen title="Konto" canGoBack />;

  const handleSelectAvatar = (id: number) => {
    setPickerVisible(false);
    void updateAvatar(String(id)).catch(() => {
      Alert.alert('Fehler', 'Avatar konnte nicht gespeichert werden.');
    });
  };

  return (
    <>
      <SettingsScreen title="Konto" canGoBack>
        <View style={styles.identity}>
          <Pressable onPress={() => setPickerVisible(true)} accessibilityLabel="Friend wählen">
            <ProfileAvatar
              avatarRobotId={user.avatar_robot_id}
              displayName={user.display_name}
              email={user.email}
              size="large"
            />
          </Pressable>
          <Text style={[styles.hint, { color: theme.textSecondary }]}>
            {getSettingsEntry('friends.avatar').description}
          </Text>
        </View>

        <SettingsGroup>
          <SettingsRow
            icon="happy-outline"
            title={getSettingsEntry('friends.avatar').title}
            value="Ändern"
            onPress={() => setPickerVisible(true)}
            last
          />
        </SettingsGroup>

        <Text style={[styles.sectionNote, { color: theme.textSecondary }]}>
          Diese Angaben kommen aus deinem Grünen Login und lassen sich dort ändern.
        </Text>

        <SettingsGroup>
          <SettingsRow
            icon="person-outline"
            title={getSettingsEntry('konto.anzeigename').title}
            value={user.display_name || '—'}
          />
          <SettingsRow
            icon="at-outline"
            title={getSettingsEntry('konto.benutzername').title}
            value={user.username || '—'}
          />
          <SettingsRow
            icon="mail-outline"
            title={getSettingsEntry('konto.email').title}
            value={user.email || '—'}
            last
          />
        </SettingsGroup>
      </SettingsScreen>

      <BottomSheet visible={pickerVisible} onClose={() => setPickerVisible(false)} maxHeight="60%">
        <Text style={[styles.sheetTitle, { color: theme.text }]}>
          {getSettingsEntry('friends.avatar').title}
        </Text>
        <View style={styles.avatarGrid}>
          {PICKABLE_ROBOT_IDS.map((id) => {
            const selected = String(id) === user.avatar_robot_id;
            return (
              <Pressable
                key={id}
                onPress={() => handleSelectAvatar(id)}
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
    </>
  );
}

const styles = StyleSheet.create({
  identity: {
    alignItems: 'center',
    gap: spacing.small,
    paddingTop: spacing.small,
  },
  hint: {
    fontFamily: BODY_FONT,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    paddingHorizontal: spacing.medium,
  },
  sectionNote: {
    fontFamily: BODY_FONT,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: -spacing.xsmall,
  },
  sheetTitle: {
    fontFamily: 'Raleway_700Bold',
    fontSize: 20,
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
});
