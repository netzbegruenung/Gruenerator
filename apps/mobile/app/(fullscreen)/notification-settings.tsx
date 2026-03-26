import { Ionicons } from '@expo/vector-icons';
import { getGlobalApiClient } from '@gruenerator/shared/api';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  SectionList,
  StyleSheet,
  useColorScheme,
  Switch,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing, borderRadius, lightTheme, darkTheme } from '../../theme';

interface ChannelPreferences {
  email: boolean;
  push: boolean;
  in_app: boolean;
}

type Channel = 'in_app' | 'email' | 'push';

const CHANNEL_ORDER: Channel[] = ['in_app', 'email', 'push'];

const CHANNEL_META: Record<Channel, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  in_app: { label: 'App', icon: 'notifications-outline' },
  email:  { label: 'Mail', icon: 'mail-outline' },
  push:   { label: 'Push', icon: 'phone-portrait-outline' },
};

const NOTIFICATION_TYPES: Record<string, { label: string; description: string; icon: keyof typeof Ionicons.glyphMap }> = {
  document_shared:             { label: 'Geteilte Dokumente', description: 'Bei geteilten Dokumenten', icon: 'document-text-outline' },
  document_permission_changed: { label: 'Berechtigungsänderungen', description: 'Bei Berechtigungsänderung', icon: 'shield-outline' },
  document_access_revoked:     { label: 'Zugriff entfernt', description: 'Wenn Zugriff entfernt wird', icon: 'lock-closed-outline' },
  board_updates:               { label: 'Board-Aufgaben', description: 'Bei Aufgaben-Updates', icon: 'grid-outline' },
  group_activity:              { label: 'Gruppenaktivität', description: 'Aktivität in Gruppen', icon: 'people-outline' },
  group_member_joined:         { label: 'Neue Mitglieder', description: 'Neue Gruppenmitglieder', icon: 'person-add-outline' },
  group_role_changed:          { label: 'Rollenänderung', description: 'Bei Rollenänderung', icon: 'swap-horizontal-outline' },
  group_content_shared:        { label: 'Geteilte Inhalte', description: 'Geteilte Gruppeninhalte', icon: 'share-outline' },
  group_deleted:               { label: 'Gruppe aufgelöst', description: 'Wenn Gruppe aufgelöst wird', icon: 'trash-outline' },
  wolke_setup:                 { label: 'Wolke verbunden', description: 'Bei Wolke-Einrichtung', icon: 'cloud-outline' },
};

const GROUPS = [
  { key: 'documents', title: 'Dokumente', types: ['document_shared', 'document_permission_changed', 'document_access_revoked'] },
  { key: 'board', title: 'Board', types: ['board_updates'] },
  { key: 'groups', title: 'Gruppen', types: ['group_activity', 'group_member_joined', 'group_role_changed', 'group_content_shared', 'group_deleted'] },
  { key: 'system', title: 'System', types: ['wolke_setup'] },
];

export default function NotificationSettingsScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const router = useRouter();

  const [preferences, setPreferences] = useState<Record<string, ChannelPreferences>>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const client = getGlobalApiClient();
        const res = await client.get('/auth/profile/notification-preferences');
        setPreferences(res.data?.preferences ?? {});
      } catch {
        // fall back to empty — toggles will default to on
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const handleToggle = useCallback(async (category: string, channel: Channel, value: boolean) => {
    setPreferences((prev) => ({
      ...prev,
      [category]: { ...prev[category], [channel]: value },
    }));

    try {
      const client = getGlobalApiClient();
      await client.patch('/auth/profile/notification-preferences', {
        category,
        channels: { [channel]: value },
      });
    } catch {
      setPreferences((prev) => ({
        ...prev,
        [category]: { ...prev[category], [channel]: !value },
      }));
    }
  }, []);

  const sections = GROUPS.map((group) => ({
    title: group.title,
    data: group.types.map((type) => ({
      key: type,
      ...NOTIFICATION_TYPES[type],
      channels: preferences[type] ?? { email: true, push: true, in_app: true },
    })),
  }));

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary[600]} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Benachrichtigungen</Text>
        <View style={styles.backButton} />
      </View>

      <View style={[styles.channelHeader, { borderBottomColor: theme.border }]}>
        <View style={styles.labelColumn} />
        {CHANNEL_ORDER.map((ch) => (
          <View key={ch} style={styles.channelColumn}>
            <Ionicons name={CHANNEL_META[ch].icon} size={14} color={theme.textSecondary} />
            <Text style={[styles.channelLabel, { color: theme.textSecondary }]}>
              {CHANNEL_META[ch].label}
            </Text>
          </View>
        ))}
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.key}
        renderSectionHeader={({ section }) => (
          <View style={[styles.sectionHeader, { backgroundColor: theme.surface }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>{section.title}</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <View style={[styles.row, { borderBottomColor: theme.border }]}>
            <View style={styles.labelColumn}>
              <Ionicons name={item.icon} size={18} color={theme.textSecondary} style={styles.rowIcon} />
              <View style={styles.labelText}>
                <Text style={[styles.rowLabel, { color: theme.text }]} numberOfLines={1}>
                  {item.label}
                </Text>
                <Text style={[styles.rowDescription, { color: theme.textSecondary }]} numberOfLines={1}>
                  {item.description}
                </Text>
              </View>
            </View>
            {CHANNEL_ORDER.map((ch) => (
              <View key={ch} style={styles.channelColumn}>
                <Switch
                  value={item.channels[ch]}
                  onValueChange={(val) => handleToggle(item.key, ch, val)}
                  trackColor={{ false: theme.border, true: colors.primary[500] }}
                  thumbColor="#fff"
                  style={styles.switch}
                />
              </View>
            ))}
          </View>
        )}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.listContent}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  channelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.xsmall,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  channelColumn: {
    width: 54,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  channelLabel: {
    fontSize: 10,
    fontWeight: '500',
  },
  labelColumn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
  },
  sectionHeader: {
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.xsmall,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowIcon: {
    marginRight: spacing.xsmall,
  },
  labelText: {
    flex: 1,
  },
  rowLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  rowDescription: {
    fontSize: 11,
    marginTop: 1,
  },
  switch: {
    transform: [{ scaleX: 0.75 }, { scaleY: 0.75 }],
  },
  listContent: {
    paddingBottom: spacing.xlarge,
  },
});
