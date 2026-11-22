import { groupFeedByKind } from '@gruenerator/shared/groups';
import { useAuthStore } from '@gruenerator/shared/stores';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Alert, Platform, Share, Switch, View, Text, StyleSheet, ScrollView } from 'react-native';

import { MenuActionSheet } from '../../../../components/chat/MenuActionSheet';
import { ListGroup, ListRow, SkeletonRows } from '../../../../components/common';
import { NeutralBackdrop } from '../../../../components/common/NeutralBackdrop';
import { ScreenScaffold } from '../../../../components/navigation/ScreenScaffold';
import { FEED_KIND_ICONS } from '../../../../components/projekte/feedIcons';
import { useProjekteTone } from '../../../../components/projekte/projekteTone';
import {
  MAKE_ADMIN_ID,
  REMOVE_MEMBER_ID,
  buildMemberActions,
  canChangeMemberRole,
  canLeaveProject,
  canShareInviteLink,
} from '../../../../components/projekte/settingsRules';
import { GroupAvatar } from '../../../../components/workplace/GroupAvatar';
import { useGroupFeed } from '../../../../hooks/useGroupContent';
import {
  buildGroupInviteUrl,
  useGroupDetails,
  useGroupMembers,
  useLeaveGroup,
  useSetGroupMute,
  useRemoveGroupMember,
  useSetGroupArchived,
  useUpdateMemberRole,
  type GroupMember,
} from '../../../../hooks/useGroups';
import { useTheme } from '../../../../hooks/useTheme';
import { useNoticeStore } from '../../../../stores/noticeStore';
import { spacing, typography, borderRadius, BODY_FONT } from '../../../../theme';
import { CONTENT_MAX_WIDTH } from '../../../../theme/layout';
import { roleLabel } from '../../../../utils/groups';
import { goBackOr } from '../../../../utils/navigation';

/**
 * Was im Web die Seitenleiste ist, als Einstellungsseite: Beschreibung,
 * Mitglieder und Inhalte nach Art — dazu die Verwaltung, die auf dem Handy
 * Sinn ergibt: Stummschalten (alle), Name und Beschreibung (Admin), Einladungs-
 * link teilen (Admin, Team-Projekt), Mitglieder-Rollen (Admin) und Verlassen
 * (Team-Projekt, nicht für die Ersteller*in). Im Web bleiben: Projekt anlegen,
 * Einladung per E-Mail, Profilbild, Links und Anweisungen bearbeiten, Löschen,
 * öffentliche Projekte, Beitrittsanfragen und Sichtbarkeit.
 */
export default function ProjektInfoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const tone = useProjekteTone();
  const router = useRouter();
  const currentUserId = useAuthStore((s) => s.user?.id ?? null);
  const [menuMember, setMenuMember] = useState<GroupMember | null>(null);

  const detailsQuery = useGroupDetails(id);
  const membersQuery = useGroupMembers(id);
  const feedQuery = useGroupFeed(id);

  const group = detailsQuery.data?.group;
  const membership = detailsQuery.data?.membership;
  const isPersonal = group?.group_type === 'personal';
  // The system group holds every user and never shows its members.
  const showMembers = !isPersonal && !group?.is_system;
  const members = membersQuery.data ?? [];

  const isAdmin = !!membership?.isAdmin;
  const muteMutation = useSetGroupMute(id ?? '');
  const roleMutation = useUpdateMemberRole(id ?? '');
  const removeMutation = useRemoveGroupMember(id ?? '');
  const archiveMutation = useSetGroupArchived(id ?? '');
  const leaveMutation = useLeaveGroup();
  const muted = muteMutation.isPending
    ? (muteMutation.variables ?? false)
    : !!membership?.notifications_muted;
  const canShareLink = !!group && canShareInviteLink(group, isAdmin);
  const canLeave = !!group && canLeaveProject(group, currentUserId);
  const fail = (error: Error) => useNoticeStore.getState().show('error', error.message);
  const done = () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

  const toggleMute = (value: boolean) =>
    muteMutation.mutate(value, { onSuccess: done, onError: fail });

  const shareInvite = () => {
    if (!group?.join_token) return;
    const url = buildGroupInviteUrl(group.join_token);
    const title = group.name;
    void Share.share(Platform.OS === 'ios' ? { url, title } : { message: url, title }).catch(
      (error: Error) => fail(error)
    );
  };

  const confirmLeave = () => {
    if (!id) return;
    Alert.alert(
      'Projekt verlassen',
      'Du verlierst den Zugriff auf alle Inhalte dieses Projekts. Das Projekt selbst, deine eigenen Inhalte und deine Team-Chats im Projekt bleiben bestehen. Ein erneuter Beitritt ist nur über eine neue Einladung möglich.',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Verlassen',
          style: 'destructive',
          onPress: () =>
            leaveMutation.mutate(id, {
              onSuccess: () => {
                done();
                router.replace('/(focused)/projekte');
              },
              onError: fail,
            }),
        },
      ]
    );
  };

  const selectMemberAction = (actionId: string) => {
    if (!menuMember) return;
    if (actionId === REMOVE_MEMBER_ID) {
      const target = menuMember;
      const name = target.display_name ?? target.first_name ?? target.email ?? 'Das Mitglied';
      Alert.alert(
        'Mitglied entfernen',
        `${name} verliert den Zugriff auf dieses Projekt. Team-Chats bleiben im Projekt.`,
        [
          { text: 'Abbrechen', style: 'cancel' },
          {
            text: 'Entfernen',
            style: 'destructive',
            onPress: () =>
              removeMutation.mutate(target.user_id, { onSuccess: done, onError: fail }),
          },
        ]
      );
      return;
    }
    roleMutation.mutate(
      { memberId: menuMember.user_id, role: actionId === MAKE_ADMIN_ID ? 'admin' : 'member' },
      { onSuccess: done, onError: fail }
    );
  };
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
    <ScreenScaffold
      backdrop={<NeutralBackdrop />}
      title={group?.name ?? 'Projekt'}
      onBack={() => goBackOr({ pathname: '/(focused)/projekte/[id]', params: { id: id ?? '' } })}
    >
      <ScrollView
        contentContainerStyle={[styles.column, styles.scrollContent]}
        showsVerticalScrollIndicator={false}
      >
        {group ? (
          <View style={styles.hero}>
            <GroupAvatar
              groupId={group.id}
              name={group.name}
              avatarUrl={group.avatar_url}
              size={72}
            />
            <Text style={[styles.groupName, { color: theme.text }]}>{group.name}</Text>
            <View style={[styles.roleBadge, { backgroundColor: tone.soft }]}>
              <Text style={[styles.roleBadgeText, { color: tone.accent }]}>
                {roleLabel(membership?.isAdmin ? 'admin' : (membership?.role ?? 'member'))}
              </Text>
            </View>
          </View>
        ) : detailsQuery.isError ? (
          <Text style={[styles.emptyLine, { color: theme.textSecondary }]}>
            Das Projekt konnte nicht geladen werden.
          </Text>
        ) : (
          <SkeletonRows count={2} leading={44} />
        )}

        {group
          ? section(
              'Benachrichtigungen',
              <>
                <ListGroup>
                  <ListRow
                    icon={muted ? 'notifications-off-outline' : 'notifications-outline'}
                    title="Stummschalten"
                    last
                    accessory={
                      <Switch
                        value={muted}
                        onValueChange={toggleMute}
                        accessibilityLabel="Projekt stummschalten"
                      />
                    }
                  />
                </ListGroup>
                <Text style={[styles.footer, { color: theme.textSecondary }]}>
                  Schaltet E-Mails und Push-Mitteilungen dieses Projekts aus. Im Grünerator selbst
                  erscheinen sie weiterhin.
                </Text>
              </>
            )
          : null}

        {group && isAdmin
          ? section(
              'Verwaltung',
              <ListGroup>
                <ListRow
                  icon="create-outline"
                  title="Name und Beschreibung bearbeiten"
                  last={group.is_system === true && !canShareLink}
                  onPress={() =>
                    router.push({
                      pathname: '/(focused)/projekte/[id]/bearbeiten',
                      params: { id: id ?? '' },
                    })
                  }
                />
                {canShareLink ? (
                  <ListRow
                    icon="share-outline"
                    title="Einladungslink teilen"
                    last={group.is_system === true}
                    onPress={shareInvite}
                  />
                ) : null}
                {group.is_system ? null : (
                  <ListRow
                    icon="archive-outline"
                    title={group.archived_at ? 'Projekt wiederherstellen' : 'Projekt archivieren'}
                    last
                    disabled={archiveMutation.isPending}
                    onPress={() =>
                      archiveMutation.mutate(!group.archived_at, { onSuccess: done, onError: fail })
                    }
                  />
                )}
              </ListGroup>
            )
          : null}

        {group?.description
          ? section(
              showMembers ? 'Über die Gruppe' : 'Über das Projekt',
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
                {members.map((member, i) => {
                  const editable = canChangeMemberRole(
                    isAdmin,
                    member.user_id,
                    currentUserId,
                    group?.created_by
                  );
                  return (
                    <ListRow
                      key={member.user_id}
                      icon="person-outline"
                      title={member.display_name ?? member.first_name ?? member.email ?? 'Mitglied'}
                      value={roleLabel(member.role)}
                      last={i === members.length - 1}
                      {...(editable && {
                        onPress: () => setMenuMember(member),
                        accessory: (
                          <Ionicons
                            name="ellipsis-horizontal"
                            size={20}
                            color={theme.textSecondary}
                          />
                        ),
                      })}
                    />
                  );
                })}
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

        {canLeave && (
          <ListGroup>
            <ListRow
              icon="log-out-outline"
              title="Projekt verlassen"
              destructive
              last
              disabled={leaveMutation.isPending}
              onPress={confirmLeave}
            />
          </ListGroup>
        )}
      </ScrollView>
      <MenuActionSheet
        visible={menuMember !== null}
        theme={theme}
        heading={menuMember?.display_name ?? menuMember?.first_name ?? menuMember?.email ?? ''}
        actions={menuMember ? buildMemberActions(menuMember.role) : []}
        onSelect={selectMemberAction}
        onClose={() => setMenuMember(null)}
      />
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  // Reading measure on a tablet; a phone is narrower than the cap anyway.
  column: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
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
  footer: {
    fontFamily: BODY_FONT,
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: spacing.xsmall,
  },
  emptyLine: { fontFamily: BODY_FONT, fontSize: 14 },
});
