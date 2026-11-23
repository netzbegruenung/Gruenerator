import { getDefaultAgent } from '@gruenerator/chat';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useProjectChats } from '../../hooks/useProjectChats';
import { useTheme } from '../../hooks/useTheme';
import { BODY_FONT } from '../../theme';
import { formatRelativeDate } from '../../utils/date';
import { threadRoute } from '../../utils/threadRoute';
import { SkeletonRows } from '../common';

import { useProjekteTone } from './projekteTone';

/** Wie im Web: eingeklappt, dann fünf, dann „Alle N Chats anzeigen“. */
export const CHATS_SHOWN = 5;

/**
 * „Bisherige Chats“: eine Zeile zum Aufklappen, rechts daneben `aside` (der
 * Teilen-Schalter des Composers). Aufgeklappt die Chats des Projekts als
 * schmale Liste: Titel, bei Team-Chats Besitzer*in und „Team“, sonst
 * „Privat“, dazu das Datum. Tippen öffnet den Chat wie die Seitenleiste.
 */
export function ProjectChatList({
  groupId,
  aside = null,
  hint = null,
}: {
  groupId: string;
  aside?: ReactNode;
  /** Steht unter der Zeile, z. B. der Hinweis zum ausgeschalteten Teilen. */
  hint?: ReactNode;
}) {
  const router = useRouter();
  const theme = useTheme();
  const tone = useProjekteTone();
  const { data: threads = [], isPending, isError, refetch } = useProjectChats(groupId);
  // Oben steht der neue Chat, nicht die Liste.
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);

  let body: ReactNode = null;
  if (open) {
    if (isPending) body = <SkeletonRows count={2} leading={32} />;
    else if (isError) {
      body = (
        <Pressable onPress={() => void refetch()} accessibilityRole="button">
          <Text style={[styles.note, { color: theme.textSecondary }]}>
            Chats konnten nicht geladen werden. Tippen zum Wiederholen.
          </Text>
        </Pressable>
      );
    } else if (threads.length === 0) {
      body = (
        <Text style={[styles.note, { color: theme.textSecondary }]}>
          Noch keine Chats. Starte oben den ersten.
        </Text>
      );
    } else {
      body = (
        <View accessibilityLabel="Chats in diesem Projekt" style={styles.list}>
          {(showAll ? threads : threads.slice(0, CHATS_SHOWN)).map((t) => {
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
          {threads.length > CHATS_SHOWN ? (
            <Pressable
              onPress={() => setShowAll((v) => !v)}
              accessibilityRole="button"
              style={styles.more}
            >
              <Text style={[styles.moreText, { color: theme.textSecondary }]}>
                {showAll ? 'Weniger anzeigen' : `Alle ${threads.length} Chats anzeigen`}
              </Text>
            </Pressable>
          ) : null}
        </View>
      );
    }
  }

  return (
    <View style={styles.section}>
      <View style={styles.headRow}>
        <Pressable
          onPress={() => setOpen((v) => !v)}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={`Bisherige Chats, ${threads.length}`}
          hitSlop={6}
          style={styles.toggle}
        >
          <Ionicons
            name={open ? 'chevron-down' : 'chevron-forward'}
            size={16}
            color={theme.textSecondary}
          />
          <Text style={[styles.toggleLabel, { color: theme.textSecondary }]}>Bisherige Chats</Text>
          <Text style={[styles.count, { color: theme.textSecondary }]}>
            {isPending ? '' : threads.length}
          </Text>
        </Pressable>
        {aside}
      </View>
      {hint}
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8 },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 },
  toggleLabel: { fontFamily: BODY_FONT, fontSize: 14, fontWeight: '500' },
  count: { fontFamily: BODY_FONT, fontSize: 14 },
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
  more: { alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 4 },
  moreText: { fontFamily: BODY_FONT, fontSize: 14 },
});
