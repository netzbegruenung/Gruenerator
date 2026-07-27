import { Ionicons, type IoniconsIconName } from '@react-native-vector-icons/ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { type ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  useColorScheme,
  ActivityIndicator,
  Pressable,
  Linking,
  RefreshControl,
} from 'react-native';

import { ListGroup, ListRow } from '../../../../components/common';
import { ScreenScaffold } from '../../../../components/navigation/ScreenScaffold';
import { GroupAvatar } from '../../../../components/workplace/GroupAvatar';
import { GroupContentSection } from '../../../../components/workplace/GroupContentSection';
import { useGroupDetails, useGroupMembers } from '../../../../hooks/useGroups';
import {
  colors,
  spacing,
  typography,
  borderRadius,
  lightTheme,
  darkTheme,
  BODY_FONT,
} from '../../../../theme';
import { roleLabel } from '../../../../utils/groups';

const LINK_ICONS: Record<string, IoniconsIconName> = {
  link: 'link',
  globe: 'globe-outline',
  mail: 'mail-outline',
  calendar: 'calendar-outline',
  chat: 'chatbubble-outline',
  folder: 'folder-outline',
  document: 'document-outline',
  video: 'videocam-outline',
  phone: 'call-outline',
  drive: 'cloud-outline',
};

/**
 * A single project, read-only.
 *
 * Everything that used to sit behind the ⋯ menu — rename, avatar, invite,
 * member roles, link editing, delete, leave — is gone; those are web's job. The
 * screen answers three questions instead: who is in it, what is linked, and what
 * has been shared.
 */
export default function ProjektDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const detailsQuery = useGroupDetails(id);
  const membersQuery = useGroupMembers(id);

  const group = detailsQuery.data?.group;
  const membership = detailsQuery.data?.membership;
  const members = membersQuery.data ?? [];
  const links = group?.links ?? [];

  // Title falls back until the details land, so the header does not pop in.
  const scaffold = (children: ReactNode): ReactNode => (
    <ScreenScaffold title={group?.name ?? 'Projekt'} onBack={() => router.back()}>
      {children}
    </ScreenScaffold>
  );

  if (detailsQuery.isPending) {
    return scaffold(
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary[600]} />
      </View>
    );
  }

  if (detailsQuery.error || !group) {
    return scaffold(
      <View style={styles.centered}>
        <Ionicons name="alert-circle" size={44} color={colors.semantic.error} />
        <Text style={[styles.centeredText, { color: colors.semantic.error }]}>
          {detailsQuery.error instanceof Error
            ? detailsQuery.error.message
            : 'Projekt konnte nicht geladen werden.'}
        </Text>
        <Pressable
          onPress={() => void detailsQuery.refetch()}
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

  const section = (title: string, body: ReactNode): ReactNode => (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>{title}</Text>
      {body}
    </View>
  );

  return scaffold(
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={detailsQuery.isRefetching}
          onRefresh={() => {
            void detailsQuery.refetch();
            void membersQuery.refetch();
          }}
        />
      }
    >
      <View style={styles.hero}>
        <GroupAvatar name={group.name} avatarUrl={group.avatar_url} size={88} />
        <Text style={[styles.groupName, { color: theme.text }]}>{group.name}</Text>
        <View style={[styles.roleBadge, { backgroundColor: colors.primary[600] + '18' }]}>
          <Text style={[styles.roleBadgeText, { color: colors.primary[600] }]}>
            {roleLabel(membership?.isAdmin ? 'admin' : (membership?.role ?? 'member'))}
          </Text>
        </View>
        {group.description ? (
          <Text style={[styles.description, { color: theme.textSecondary }]}>
            {group.description}
          </Text>
        ) : null}
      </View>

      {section(
        `Mitglieder${members.length ? ` (${members.length})` : ''}`,
        membersQuery.isPending ? (
          <ActivityIndicator color={colors.primary[600]} />
        ) : members.length === 0 ? (
          <Text style={[styles.emptyLine, { color: theme.textSecondary }]}>
            Keine Mitglieder gefunden.
          </Text>
        ) : (
          <ListGroup>
            {members.map((member, i) => (
              <ListRow
                key={member.user_id}
                icon="person-outline"
                title={member.display_name ?? member.first_name ?? member.email ?? 'Mitglied'}
                value={roleLabel(member.role)}
                last={i === members.length - 1}
              />
            ))}
          </ListGroup>
        )
      )}

      {links.length > 0 &&
        section(
          'Links',
          <ListGroup>
            {links.map((link, i) => (
              <ListRow
                key={link.id}
                icon={LINK_ICONS[link.icon] ?? 'link'}
                title={link.title}
                value={link.description ?? link.url}
                onPress={() => void Linking.openURL(link.url)}
                last={i === links.length - 1}
              />
            ))}
          </ListGroup>
        )}

      {id ? <GroupContentSection groupId={id} /> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: spacing.medium,
    paddingBottom: spacing.xxlarge * 2,
    gap: spacing.xlarge,
  },
  hero: {
    alignItems: 'center',
    gap: spacing.small,
    paddingTop: spacing.medium,
    paddingBottom: spacing.xsmall,
  },
  groupName: { ...typography.h2, textAlign: 'center' },
  roleBadge: {
    paddingHorizontal: spacing.small,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
  },
  roleBadgeText: { fontFamily: BODY_FONT, fontSize: 12, fontWeight: '700' },
  description: {
    fontFamily: BODY_FONT,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    paddingTop: 2,
  },
  section: { gap: spacing.small },
  sectionTitle: {
    fontFamily: BODY_FONT,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: spacing.xsmall,
  },
  emptyLine: { fontFamily: BODY_FONT, fontSize: 14 },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.small,
    paddingHorizontal: spacing.large,
  },
  centeredText: { fontFamily: BODY_FONT, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  retryButton: {
    marginTop: spacing.small,
    paddingHorizontal: spacing.large,
    paddingVertical: spacing.small,
    borderRadius: borderRadius.medium,
  },
  retryButtonText: { ...typography.body, fontWeight: '600', color: colors.white },
});
