import { useActionSheet } from '@expo/react-native-action-sheet';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useCallback } from 'react';
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

import { useUserGroups, type GroupSummary } from '../../../hooks/useGroups';
import { colors, spacing, typography, borderRadius, lightTheme, darkTheme } from '../../../theme';

export default function GruppenScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const router = useRouter();
  const { showActionSheetWithOptions } = useActionSheet();

  const { data: groups = [], isPending, isRefetching, error, refetch } = useUserGroups();

  const openGroup = useCallback(
    (groupId: string) => {
      router.push(`/(focused)/gruppen/${groupId}`);
    },
    [router]
  );

  const showAddMenu = useCallback(() => {
    const options = ['Neue Gruppe erstellen', 'Einladung einlösen', 'Abbrechen'];
    showActionSheetWithOptions(
      {
        options,
        cancelButtonIndex: 2,
        title: 'Gruppen',
      },
      (idx) => {
        if (idx === 0) router.push('/(modals)/gruppen-create');
        if (idx === 1) router.push('/(modals)/gruppen-join-manual');
      }
    );
  }, [router, showActionSheetWithOptions]);

  const headerRight = useCallback(
    () => (
      <Pressable
        onPress={showAddMenu}
        hitSlop={10}
        style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, padding: spacing.xsmall })}
      >
        <Ionicons name="add" size={26} color={theme.text} />
      </Pressable>
    ),
    [showAddMenu, theme.text]
  );

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

  if (isPending) {
    return (
      <>
        <Stack.Screen options={{ headerRight }} />
        <View style={[styles.centered, { backgroundColor: theme.background }]}>
          <ActivityIndicator size="large" color={colors.primary[600]} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Gruppen laden...</Text>
        </View>
      </>
    );
  }

  if (error) {
    return (
      <>
        <Stack.Screen options={{ headerRight }} />
        <View style={[styles.centered, { backgroundColor: theme.background }]}>
          <Ionicons name="alert-circle" size={48} color={colors.semantic.error} />
          <Text style={[styles.errorText, { color: colors.semantic.error }]}>
            {error instanceof Error ? error.message : 'Gruppen konnten nicht geladen werden'}
          </Text>
          <Pressable
            onPress={() => void refetch()}
            style={({ pressed }) => [
              styles.retryButton,
              { backgroundColor: pressed ? colors.primary[700] : colors.primary[600] },
            ]}
          >
            <Text style={styles.retryButtonText}>Erneut versuchen</Text>
          </Pressable>
        </View>
      </>
    );
  }

  if (groups.length === 0) {
    return (
      <>
        <Stack.Screen options={{ headerRight }} />
        <ScrollView
          style={[styles.container, { backgroundColor: theme.background }]}
          contentContainerStyle={styles.centered}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />
          }
        >
          <Ionicons name="people-outline" size={48} color={theme.textSecondary} />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>Keine Gruppen</Text>
          <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
            Erstelle eine Gruppe oder löse{'\n'}eine Einladung ein.
          </Text>
          <Pressable
            onPress={showAddMenu}
            style={({ pressed }) => [
              styles.retryButton,
              { backgroundColor: pressed ? colors.primary[700] : colors.primary[600] },
            ]}
          >
            <Text style={styles.retryButtonText}>Gruppe hinzufügen</Text>
          </Pressable>
        </ScrollView>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerRight }} />
      <ScrollView
        style={[styles.container, { backgroundColor: theme.background }]}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />
        }
      >
        {groups.map((group: GroupSummary) => (
          <Pressable
            key={group.id}
            onPress={() => openGroup(group.id)}
            style={({ pressed }) => [
              styles.groupCard,
              {
                backgroundColor: pressed ? theme.surface : theme.card,
                borderColor: theme.cardBorder,
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
                    {group.member_count ?? 0} Mitglieder
                  </Text>
                  <Text style={[styles.groupMetaDot, { color: theme.textSecondary }]}>·</Text>
                  <Text style={[styles.groupMetaText, { color: theme.textSecondary }]}>
                    {roleLabel(group.role)}
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
            </View>

            {group.description ? (
              <Text
                style={[styles.groupDescription, { color: theme.textSecondary }]}
                numberOfLines={2}
              >
                {group.description}
              </Text>
            ) : null}
          </Pressable>
        ))}
      </ScrollView>
    </>
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
});
