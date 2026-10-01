import { groupFeedByKind } from '@gruenerator/shared/groups';
import { type IoniconsIconName } from '@react-native-vector-icons/ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { type ReactNode } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';

import { ListGroup, ListRow, SkeletonRows } from '../../../../components/common';
import { ScreenScaffold } from '../../../../components/navigation/ScreenScaffold';
import { FEED_KIND_ICONS } from '../../../../components/projekte/feedIcons';
import { GroupAvatar } from '../../../../components/workplace/GroupAvatar';
import { useGroupFeed } from '../../../../hooks/useGroupContent';
import { useGroupDetails, useGroupMembers } from '../../../../hooks/useGroups';
import { useTheme } from '../../../../hooks/useTheme';
import { openUrl } from '../../../../services/share';
import { colors, spacing, typography, borderRadius, BODY_FONT } from '../../../../theme';
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
 * Was im Web die Seitenleiste ist: Beschreibung, Mitglieder, Links und die
 * Inhalte nach Art. Verwaltung (Umbenennen, Rollen, Einladen, Löschen) bleibt
 * dem Web — die App ist hier nur zum Lesen.
 */
export default function ProjektInfoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();

  const detailsQuery = useGroupDetails(id);
  const membersQuery = useGroupMembers(id);
  const feedQuery = useGroupFeed(id);

  const group = detailsQuery.data?.group;
  const membership = detailsQuery.data?.membership;
  const isPersonal = group?.group_type === 'personal';
  // The system group holds every user and never shows its members.
  const showMembers = !isPersonal && !group?.is_system;
  const members = membersQuery.data ?? [];
  const links = group?.links ?? [];
  const sections = groupFeedByKind(feedQuery.data ?? []);

  const section = (title: string, body: ReactNode): ReactNode => (
    <View style={styles.section}>
      <Text
        style={[styles.sectionTitle, { color: theme.textSecondary }]}
        accessibilityRole="header"
      >
        {title}
      </Text>
      {body}
    </View>
  );

  return (
    <ScreenScaffold title={group?.name ?? 'Projekt'} onBack={() => router.back()}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {group ? (
          <View style={styles.hero}>
            <GroupAvatar name={group.name} avatarUrl={group.avatar_url} size={72} />
            <Text style={[styles.groupName, { color: theme.text }]}>{group.name}</Text>
            <View style={[styles.roleBadge, { backgroundColor: colors.primary[600] + '18' }]}>
              <Text style={[styles.roleBadgeText, { color: colors.primary[600] }]}>
                {roleLabel(membership?.isAdmin ? 'admin' : (membership?.role ?? 'member'))}
              </Text>
            </View>
          </View>
        ) : (
          <SkeletonRows count={2} leading={44} />
        )}

        {group?.description
          ? section(
              isPersonal ? 'Über das Projekt' : 'Über die Gruppe',
              <View style={[styles.card, { backgroundColor: theme.card }]}>
                <Text style={[styles.description, { color: theme.text }]}>{group.description}</Text>
              </View>
            )
          : null}

        {showMembers &&
          section(
            `Mitglieder${members.length ? ` · ${members.length}` : ''}`,
            membersQuery.isPending ? (
              <SkeletonRows count={3} leading={44} />
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

        {sections.length > 0 &&
          section(
            'Inhalte',
            <ListGroup>
              {sections.map((s, i) => (
                <ListRow
                  key={s.id}
                  icon={FEED_KIND_ICONS[s.id]}
                  title={s.plural}
                  value={String(s.items.length)}
                  last={i === sections.length - 1}
                />
              ))}
            </ListGroup>
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
                  onPress={() => void openUrl(link.url)}
                  last={i === links.length - 1}
                />
              ))}
            </ListGroup>
          )}
      </ScrollView>
    </ScreenScaffold>
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
  card: { borderRadius: 16, padding: 16 },
  description: { fontFamily: BODY_FONT, fontSize: 15, lineHeight: 22 },
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
});
