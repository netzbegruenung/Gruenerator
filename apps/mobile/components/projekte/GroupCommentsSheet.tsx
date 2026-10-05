import { type GroupShareComment } from '@gruenerator/contracts';
import {
  errMessage,
  formatFeedDate,
  personInitials,
  threadComments,
  useGroupShareComments,
  type GroupFeedItem,
} from '@gruenerator/shared/groups';
import { useAuthStore } from '@gruenerator/shared/stores';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { BODY_FONT, colors, spacing } from '../../theme';
import { BottomSheet } from '../common';
import { ReportSheet } from '../common/ReportSheet';
import { SkeletonRows } from '../common/Skeleton';

import { FEED_KIND_ICONS } from './feedIcons';
import { GroupMentionText } from './GroupMentionText';

interface GroupCommentsSheetProps {
  groupId: string;
  item: GroupFeedItem | null;
  onClose: () => void;
}

/** Kommentare eines Beitrags als Threads — in der App nur zum Lesen, geschrieben wird im Web. */
export function GroupCommentsSheet({ groupId, item, onClose }: GroupCommentsSheetProps) {
  const theme = useTheme();
  const shareId = item?.share?.shareId ?? '';
  const comments = useGroupShareComments(groupId, shareId, { enabled: !!item });
  const list = comments.data ?? [];
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const [reportId, setReportId] = useState<string | null>(null);

  const renderComment = (c: GroupShareComment, isReply: boolean) => (
    <View key={c.id} style={styles.comment}>
      <View
        style={[
          styles.avatar,
          isReply && styles.avatarReply,
          { backgroundColor: colors.secondary[100] },
        ]}
      >
        <Text style={styles.avatarText}>{personInitials(c.authorName)}</Text>
      </View>
      <View style={styles.flex}>
        <View style={[styles.bubble, { backgroundColor: theme.surface }]}>
          <Text style={[styles.author, { color: theme.text }]}>{c.authorName}</Text>
          <Text style={[styles.body, { color: theme.text }]}>
            <GroupMentionText text={c.body} />
          </Text>
        </View>
        <Text style={[styles.when, { color: theme.textSecondary }]}>
          {formatFeedDate(c.createdAt, 'short')}
        </Text>
      </View>
      {!c.userId || c.userId !== userId ? (
        <Pressable
          onPress={() => setReportId(c.id)}
          accessibilityRole="button"
          accessibilityLabel={`Kommentar von ${c.authorName} melden`}
          hitSlop={6}
          style={styles.reportButton}
        >
          <Ionicons name="flag-outline" size={18} color={theme.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );

  return (
    <>
      <BottomSheet visible={!!item} onClose={onClose} maxHeight="75%">
        {item ? (
          <View style={styles.root}>
            <View style={[styles.header, { borderBottomColor: theme.border }]}>
              <View style={[styles.headerIcon, { backgroundColor: theme.surface }]}>
                <Ionicons name={FEED_KIND_ICONS[item.kind]} size={22} color={colors.primary[600]} />
              </View>
              <View style={styles.flex}>
                <Text
                  style={[styles.headerTitle, { color: theme.text }]}
                  accessibilityRole="header"
                >
                  Kommentare{comments.data ? ` · ${list.length}` : ''}
                </Text>
                <Text style={[styles.headerSub, { color: theme.textSecondary }]} numberOfLines={1}>
                  {item.title}
                </Text>
              </View>
            </View>

            <ScrollView contentContainerStyle={styles.list}>
              {comments.isPending ? (
                <SkeletonRows count={3} leading={32} />
              ) : comments.isError ? (
                <Text style={[styles.info, { color: colors.semantic.error }]}>
                  {errMessage(comments.error)}
                </Text>
              ) : list.length === 0 ? (
                <Text style={[styles.info, { color: theme.textSecondary }]}>
                  Noch keine Kommentare.
                </Text>
              ) : (
                threadComments(list).map((t) => (
                  <View key={t.comment.id} style={styles.thread}>
                    {renderComment(t.comment, false)}
                    {t.replies.length > 0 && (
                      <View style={[styles.replies, { borderLeftColor: theme.border }]}>
                        {t.replies.map((r) => renderComment(r, true))}
                      </View>
                    )}
                  </View>
                ))
              )}
            </ScrollView>

            <Text style={[styles.footerHint, { color: theme.textSecondary }]}>
              Kommentieren geht im Moment nur im Web.
            </Text>
            <ReportSheet
              target={reportId ? { kind: 'group_comment', targetId: reportId, groupId } : null}
              onClose={() => setReportId(null)}
            />
          </View>
        ) : null}
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  root: { paddingBottom: spacing.medium },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontFamily: BODY_FONT, fontSize: 16, fontWeight: '700' },
  headerSub: { fontFamily: BODY_FONT, fontSize: 13 },
  flex: { flex: 1, minWidth: 0 },
  reportButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16, gap: 14 },
  info: { fontFamily: BODY_FONT, fontSize: 14 },
  thread: { gap: 10 },
  replies: { marginLeft: 16, paddingLeft: 14, borderLeftWidth: 2, gap: 10 },
  comment: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarReply: { width: 28, height: 28, borderRadius: 14 },
  avatarText: {
    fontFamily: BODY_FONT,
    fontSize: 12,
    fontWeight: '700',
    color: colors.secondary[800],
  },
  bubble: {
    alignSelf: 'flex-start',
    borderTopLeftRadius: 4,
    borderTopRightRadius: 16,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 2,
  },
  author: { fontFamily: BODY_FONT, fontSize: 13, fontWeight: '700' },
  body: { fontFamily: BODY_FONT, fontSize: 15, lineHeight: 21 },
  when: { fontFamily: BODY_FONT, fontSize: 12, paddingLeft: 14, paddingTop: 4 },
  footerHint: { fontFamily: BODY_FONT, fontSize: 13, textAlign: 'center', paddingHorizontal: 20 },
});
