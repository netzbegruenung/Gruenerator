import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useRouter } from 'expo-router';
import { useCallback, type ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  useColorScheme,
  Pressable,
  RefreshControl,
} from 'react-native';

import { ListGroup, ListRow, SkeletonRows } from '../../../components/common';
import { ScreenScaffold } from '../../../components/navigation/ScreenScaffold';
import { GroupAvatar } from '../../../components/workplace/GroupAvatar';
import { useUserGroups, type GroupSummary } from '../../../hooks/useGroups';
import {
  colors,
  spacing,
  typography,
  borderRadius,
  lightTheme,
  darkTheme,
  BODY_FONT,
} from '../../../theme';
import { roleLabel } from '../../../utils/groups';

/**
 * Projekte — the read-only mobile view of what web calls Gruppen.
 *
 * Read-only on purpose: creating a project, joining by code, renaming, managing
 * members and links all stay on web. What is left is the thing people actually
 * do on a phone — look up which projects they are in and what has been shared
 * there. An invite link still works; `app/gruppen-join/[token]` handles it.
 */
export default function ProjekteScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const router = useRouter();

  const { data: groups = [], isPending, isRefetching, error, refetch } = useUserGroups();

  const openGroup = useCallback(
    (groupId: string) => router.push(`/(focused)/projekte/${groupId}`),
    [router]
  );

  // (focused) has no tab bar, so a bare router.back() strands the user when this
  // screen is the stack root — e.g. reached via gruppen-join's router.replace on
  // a cold deep link. Fall back to a tab, mirroring gruppen-join's own guard.
  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/start');
  }, [router]);

  // Web's meta rule, kept verbatim so a project reads the same on both surfaces.
  const metaFor = (group: GroupSummary): string => {
    if (group.group_type === 'personal') return 'Nur für dich';
    if (group.member_count) {
      return `${group.member_count} ${group.member_count === 1 ? 'Mitglied' : 'Mitglieder'}`;
    }
    return roleLabel(group.role);
  };

  let body: ReactNode;
  if (isPending) {
    // The rows below, in outline: the same card, the same 44-dp avatar, the
    // same two lines of text. Five of them, which fills a phone screen without
    // claiming to know how many projects there are.
    body = (
      <ListGroup>
        <SkeletonRows count={5} leading={44} on="card" />
      </ListGroup>
    );
  } else if (error) {
    body = (
      <View style={styles.centered}>
        <Ionicons name="alert-circle" size={44} color={colors.semantic.error} />
        {/* Deliberately not the hook's own message: it comes from the shared
            groups client and still says "Gruppen", web's word for this. */}
        <Text style={[styles.centeredText, { color: colors.semantic.error }]}>
          Projekte konnten nicht geladen werden.
        </Text>
        <Pressable
          onPress={() => void refetch()}
          style={({ pressed }) => [
            styles.retryButton,
            { backgroundColor: pressed ? colors.primary[700] : colors.primary[600] },
          ]}
          accessibilityRole="button"
        >
          <Text style={styles.retryButtonText}>Erneut versuchen</Text>
        </Pressable>
      </View>
    );
  } else if (groups.length === 0) {
    body = (
      <View style={styles.centered}>
        <Ionicons name="people-outline" size={44} color={theme.textSecondary} />
        <Text style={[styles.centeredText, { color: theme.text }]}>Keine Projekte</Text>
        <Text style={[styles.centeredText, { color: theme.textSecondary }]}>
          Projekte legst du am Rechner an oder trittst ihnen über einen Einladungslink bei.
        </Text>
      </View>
    );
  } else {
    body = (
      <ListGroup>
        {groups.map((group, i) => (
          <ListRow
            key={group.id}
            leading={<GroupAvatar name={group.name} avatarUrl={group.avatar_url} size={44} />}
            title={group.name}
            value={metaFor(group)}
            onPress={() => openGroup(group.id)}
            last={i === groups.length - 1}
          />
        ))}
      </ListGroup>
    );
  }

  return (
    <ScreenScaffold title="Projekte" onBack={handleBack}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />
        }
      >
        {body}
      </ScrollView>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: spacing.medium,
    paddingTop: spacing.xsmall,
    paddingBottom: spacing.xxlarge * 2,
  },
  centered: {
    alignItems: 'center',
    gap: spacing.medium,
    paddingVertical: spacing.xxlarge,
    paddingHorizontal: spacing.large,
  },
  centeredText: {
    fontFamily: BODY_FONT,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: spacing.small,
    paddingHorizontal: spacing.large,
    paddingVertical: spacing.small,
    borderRadius: borderRadius.medium,
  },
  retryButtonText: { ...typography.body, fontWeight: '600', color: colors.white },
});
