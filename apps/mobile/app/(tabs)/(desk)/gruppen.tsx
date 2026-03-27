import { Ionicons } from '@expo/vector-icons';
import { getGlobalApiClient } from '@gruenerator/shared/api';
import { useFocusEffect } from 'expo-router';
import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  useColorScheme,
  ActivityIndicator,
  Pressable,
  RefreshControl,
} from 'react-native';

import { colors, spacing, typography, borderRadius, lightTheme, darkTheme } from '../../../theme';

interface GroupMember {
  user_id: string;
  display_name: string;
  role: string;
}

interface Group {
  id: string;
  name: string;
  description: string | null;
  member_count: number;
  content_count: number;
  role: string;
  members?: GroupMember[];
  created_at: string;
}

export default function GruppenScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const [groups, setGroups] = useState<Group[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchGroups = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    setError(null);

    try {
      const apiClient = getGlobalApiClient();
      const response = await apiClient.get('/auth/groups');
      setGroups(response.data.groups || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gruppen konnten nicht geladen werden');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchGroups();
    }, [fetchGroups])
  );

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    fetchGroups(true);
  }, [fetchGroups]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const roleLabel = (role: string) => {
    switch (role) {
      case 'owner':
        return 'Eigentümer*in';
      case 'admin':
        return 'Admin';
      case 'member':
        return 'Mitglied';
      default:
        return role;
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary[600]} />
        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Gruppen laden...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <Ionicons name="alert-circle" size={48} color={colors.semantic.error} />
        <Text style={[styles.errorText, { color: colors.semantic.error }]}>{error}</Text>
        <Pressable
          onPress={() => fetchGroups()}
          style={({ pressed }) => [
            styles.retryButton,
            { backgroundColor: pressed ? colors.primary[700] : colors.primary[600] },
          ]}
        >
          <Text style={styles.retryButtonText}>Erneut versuchen</Text>
        </Pressable>
      </View>
    );
  }

  if (groups.length === 0) {
    return (
      <ScrollView
        style={[styles.container, { backgroundColor: theme.background }]}
        contentContainerStyle={styles.centered}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
      >
        <Ionicons name="people-outline" size={48} color={theme.textSecondary} />
        <Text style={[styles.emptyTitle, { color: theme.text }]}>Keine Gruppen</Text>
        <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
          Erstelle oder tritt einer Gruppe bei,{'\n'}um Inhalte mit anderen zu teilen.
        </Text>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.scrollContent}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
    >
      {groups.map((group) => (
        <Pressable
          key={group.id}
          onPress={() => toggleExpand(group.id)}
          style={({ pressed }) => [
            styles.groupCard,
            {
              backgroundColor: pressed ? theme.surface : theme.card,
              borderColor: expandedId === group.id ? colors.primary[600] : theme.cardBorder,
            },
          ]}
        >
          <View style={styles.groupHeader}>
            <View style={[styles.groupIcon, { backgroundColor: colors.primary[600] + '15' }]}>
              <Ionicons name="people" size={24} color={colors.primary[600]} />
            </View>
            <View style={styles.groupInfo}>
              <Text style={[styles.groupName, { color: theme.text }]}>{group.name}</Text>
              <View style={styles.groupMeta}>
                <Text style={[styles.groupMetaText, { color: theme.textSecondary }]}>
                  {group.member_count} Mitglieder
                </Text>
                <Text style={[styles.groupMetaDot, { color: theme.textSecondary }]}>·</Text>
                <Text style={[styles.groupMetaText, { color: theme.textSecondary }]}>
                  {roleLabel(group.role)}
                </Text>
              </View>
            </View>
            <Ionicons
              name={expandedId === group.id ? 'chevron-up' : 'chevron-down'}
              size={20}
              color={theme.textSecondary}
            />
          </View>

          {group.description && (
            <Text
              style={[styles.groupDescription, { color: theme.textSecondary }]}
              numberOfLines={2}
            >
              {group.description}
            </Text>
          )}

          {expandedId === group.id && group.members && group.members.length > 0 && (
            <View style={[styles.membersList, { borderTopColor: theme.border }]}>
              <Text style={[styles.membersTitle, { color: theme.textSecondary }]}>Mitglieder</Text>
              {group.members.map((member) => (
                <View key={member.user_id} style={styles.memberRow}>
                  <Ionicons name="person-circle-outline" size={20} color={theme.textSecondary} />
                  <Text style={[styles.memberName, { color: theme.text }]}>
                    {member.display_name}
                  </Text>
                  <Text style={[styles.memberRole, { color: theme.textSecondary }]}>
                    {roleLabel(member.role)}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: spacing.medium, paddingBottom: spacing.xxlarge, gap: spacing.small },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xlarge,
    gap: spacing.medium,
  },
  loadingText: { ...typography.body },
  errorText: { ...typography.body, textAlign: 'center' },
  retryButton: {
    paddingHorizontal: spacing.large,
    paddingVertical: spacing.small,
    borderRadius: borderRadius.medium,
  },
  retryButtonText: { ...typography.body, fontWeight: '600', color: colors.white },
  emptyTitle: { ...typography.h2, textAlign: 'center' },
  emptySubtitle: { ...typography.body, textAlign: 'center' },
  groupCard: {
    borderRadius: borderRadius.large,
    borderWidth: 1,
    padding: spacing.medium,
    gap: spacing.small,
  },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.medium },
  groupIcon: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupInfo: { flex: 1, gap: 2 },
  groupName: { ...typography.bodyBold },
  groupMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  groupMetaText: { fontSize: 12 },
  groupMetaDot: { fontSize: 12 },
  groupDescription: { ...typography.bodySmall, paddingLeft: 44 + spacing.medium },
  membersList: { borderTopWidth: 1, paddingTop: spacing.small, gap: spacing.xsmall },
  membersTitle: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xsmall },
  memberName: { ...typography.bodySmall, flex: 1 },
  memberRole: { fontSize: 11 },
});
