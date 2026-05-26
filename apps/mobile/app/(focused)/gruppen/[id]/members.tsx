import { useActionSheet } from '@expo/react-native-action-sheet';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  useColorScheme,
  Alert,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  useGroupDetails,
  useGroupMembers,
  useUpdateMemberRole,
  type GroupMember,
} from '../../../../hooks/useGroups';
import {
  colors,
  spacing,
  typography,
  borderRadius,
  lightTheme,
  darkTheme,
} from '../../../../theme';

export default function GroupMembersScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const { showActionSheetWithOptions } = useActionSheet();

  const detailsQuery = useGroupDetails(id);
  const membersQuery = useGroupMembers(id);
  const updateRole = useUpdateMemberRole(id ?? '');

  const isAdmin = detailsQuery.data?.membership?.isAdmin ?? false;
  const createdBy = detailsQuery.data?.group.created_by;

  const openMemberMenu = useCallback(
    (member: GroupMember) => {
      if (!isAdmin) return;
      if (String(member.user_id) === String(createdBy)) {
        Alert.alert(
          'Nicht möglich',
          'Die Rolle der Gruppenersteller*in kann nicht geändert werden.'
        );
        return;
      }
      const makeAdmin = member.role !== 'admin';
      const options = [makeAdmin ? 'Zum Admin machen' : 'Zum Mitglied machen', 'Abbrechen'];
      showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex: 1,
          title: member.display_name ?? 'Mitglied',
        },
        (idx) => {
          if (idx === 0) {
            updateRole.mutate(
              { memberId: member.user_id, role: makeAdmin ? 'admin' : 'member' },
              {
                onError: (err) =>
                  Alert.alert(
                    'Fehler',
                    err instanceof Error ? err.message : 'Rolle konnte nicht geändert werden.'
                  ),
              }
            );
          }
        }
      );
    },
    [isAdmin, createdBy, showActionSheetWithOptions, updateRole]
  );

  const roleLabel = (role: string) => (role === 'admin' ? 'Admin' : 'Mitglied');

  const members = membersQuery.data ?? [];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={28} color={theme.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Mitglieder</Text>
        <View style={{ width: 28 }} />
      </View>

      {membersQuery.isPending ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary[600]} />
        </View>
      ) : members.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="people-outline" size={48} color={theme.textSecondary} />
          <Text style={[styles.empty, { color: theme.textSecondary }]}>
            Keine Mitglieder gefunden
          </Text>
        </View>
      ) : (
        <FlatList
          data={members}
          keyExtractor={(member) => member.user_id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={membersQuery.isRefetching}
              onRefresh={() => void membersQuery.refetch()}
            />
          }
          renderItem={({ item: member }) => {
            const isCreator = String(member.user_id) === String(createdBy);
            const canChange = isAdmin && !isCreator;
            return (
              <Pressable
                onPress={() => openMemberMenu(member)}
                disabled={!canChange}
                style={({ pressed }) => [
                  styles.row,
                  {
                    backgroundColor: pressed && canChange ? theme.surface : theme.card,
                    borderColor: theme.cardBorder,
                  },
                ]}
              >
                <View style={[styles.avatar, { backgroundColor: colors.primary[600] + '18' }]}>
                  <Ionicons name="person" size={20} color={colors.primary[600]} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
                    {member.display_name ?? member.first_name ?? 'Mitglied'}
                  </Text>
                  <Text style={[styles.role, { color: theme.textSecondary }]}>
                    {isCreator ? 'Eigentümer*in' : roleLabel(member.role)}
                  </Text>
                </View>
                {canChange ? (
                  <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
                ) : null}
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    height: 52,
    paddingHorizontal: spacing.medium,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { ...typography.bodyBold },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.medium },
  empty: { ...typography.body },
  list: { padding: spacing.medium, gap: spacing.small, paddingBottom: spacing.xxlarge },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.medium,
    borderRadius: borderRadius.medium,
    borderWidth: 1,
    padding: spacing.medium,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { ...typography.body, fontWeight: '600' },
  role: { ...typography.bodySmall },
});
