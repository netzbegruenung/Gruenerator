import { getDefaultAgent } from '@gruenerator/chat';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useProjectChats } from '../../hooks/useProjectChats';
import { useTheme } from '../../hooks/useTheme';
import { BODY_FONT } from '../../theme';
import { formatRelativeDate } from '../../utils/date';
import { threadRoute } from '../../utils/threadRoute';
import { SkeletonRows } from '../common';

import { useProjekteTone } from './projekteTone';

/**
 * Die Chats des Projekts als schmale Liste: Titel, bei Team-Chats Besitzer*in
 * und „Team“, sonst „Privat“, dazu das Datum. Tippen öffnet den Chat wie die
 * Seitenleiste.
 */
export function ProjectChatList({ groupId }: { groupId: string }) {
  const router = useRouter();
  const theme = useTheme();
  const tone = useProjekteTone();
  const { data: threads = [], isPending, isError, refetch } = useProjectChats(groupId);

  if (isPending) return <SkeletonRows count={2} leading={32} />;

  if (isError) {
    return (
      <Pressable onPress={() => void refetch()} accessibilityRole="button">
        <Text style={[styles.note, { color: theme.textSecondary }]}>
          Chats konnten nicht geladen werden. Tippen zum Wiederholen.
        </Text>
      </Pressable>
    );
  }

  if (threads.length === 0) {
    return (
      <Text style={[styles.note, { color: theme.textSecondary }]}>
        Noch keine Chats. Starte oben den ersten.
      </Text>
    );
  }

  return (
    <View accessibilityLabel="Chats in diesem Projekt" style={styles.list}>
      {threads.map((t) => {
        const isTeam = t.teamShared === true || t.accessType === 'group';
        const isOwn = !t.accessType || t.accessType === 'owner';
        const title = t.title || 'Neue Unterhaltung';
        const meta = [
          isTeam && t.ownerName ? t.ownerName : null,
          isTeam ? 'Team' : isOwn ? 'Privat' : null,
          formatRelativeDate(t.updatedAt),
        ]
          .filter(Boolean)
          .join(' · ');
        return (
          <Pressable
            key={t.id}
            onPress={() => {
              const { href, withAnchor } = threadRoute({
                id: t.id,
                threadType: t.threadType,
                notebookCollectionIds: t.notebookCollectionIds ?? undefined,
                agentId: t.agentId !== getDefaultAgent() ? t.agentId : null,
              });
              router.push(href, { withAnchor });
            }}
            accessibilityRole="button"
            accessibilityLabel={`${title}, ${meta}`}
            style={({ pressed }) => [
              styles.row,
              { backgroundColor: theme.card, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Ionicons name="chatbubble-outline" size={20} color={tone.accent} />
            <View style={styles.text}>
              <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
                {title}
              </Text>
              <Text style={[styles.meta, { color: theme.textSecondary }]} numberOfLines={1}>
                {meta}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    minHeight: 52,
  },
  text: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontFamily: BODY_FONT, fontSize: 15, fontWeight: '600' },
  meta: { fontFamily: BODY_FONT, fontSize: 12 },
  note: { fontFamily: BODY_FONT, fontSize: 15, paddingHorizontal: 4 },
});
