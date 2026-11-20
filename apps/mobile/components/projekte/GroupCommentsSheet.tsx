import { GROUP_COMMENT_MAX, type GroupShareComment } from '@gruenerator/contracts';
import {
  errMessage,
  formatFeedDate,
  personInitials,
  threadComments,
  useAddGroupShareComment,
  useDeleteGroupShareComment,
  useGroupShareComments,
  type GroupFeedItem,
} from '@gruenerator/shared/groups';
import { useAuthStore } from '@gruenerator/shared/stores';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import * as Haptics from 'expo-haptics';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useHiddenMemberIds } from '../../hooks/useHiddenMembers';
import { useMentionDraft } from '../../hooks/useMentionDraft';
import { useMentionOptions } from '../../hooks/useMentionOptions';
import { useTheme } from '../../hooks/useTheme';
import { useNoticeStore } from '../../stores/noticeStore';
import { BODY_FONT, colors, spacing } from '../../theme';
import { canHidePerson, filterHiddenComments } from '../../utils/hiddenMembers';
import { BottomSheet } from '../common';
import { confirmHidePerson } from '../common/confirmHidePerson';
import { ReportSheet } from '../common/ReportSheet';
import { SkeletonRows } from '../common/Skeleton';

import {
  canDeleteComment,
  canSendComment,
  COMMENT_DELETE_ACTIONS,
  replyDraft,
  replyTarget,
  type ReplyTarget,
} from './commentRules';
import { FEED_KIND_ICONS } from './feedIcons';
import { GroupMentionText } from './GroupMentionText';
import { MentionSuggestions } from './MentionSuggestions';
import { ModerationMenuButton } from './ModerationMenuButton';
import { CommentReactions } from './ProjectReactions';
import { useProjekteTone } from './projekteTone';

interface GroupCommentsSheetProps {
  groupId: string;
  item: GroupFeedItem | null;
  /** Projekt-Admins dürfen auch fremde Kommentare löschen. */
  isAdmin?: boolean;
  /** Das System-Projekt: `@alle` erreicht dort alle Nutzer*innen. */
  isSystem?: boolean;
  onClose: () => void;
}

/** Kommentare eines Beitrags als Threads, mit Antworten, Löschen und dem Eingabefeld am unteren Rand. */
export function GroupCommentsSheet({
  groupId,
  item,
  isAdmin = false,
  isSystem = false,
  onClose,
}: GroupCommentsSheetProps) {
  const theme = useTheme();
  const tone = useProjekteTone();
  const shareId = item?.share?.shareId ?? '';
  const comments = useGroupShareComments(groupId, shareId, { enabled: !!item });
  const hiddenIds = useHiddenMemberIds();
  const list = useMemo(
    () => filterHiddenComments(comments.data ?? [], hiddenIds),
    [comments.data, hiddenIds]
  );
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const [reportId, setReportId] = useState<string | null>(null);
  const addComment = useAddGroupShareComment(groupId, shareId);
  const deleteComment = useDeleteGroupShareComment(groupId, shareId);
  const mentionOptions = useMentionOptions(groupId, isSystem, isAdmin);
  const mention = useMentionDraft(mentionOptions, GROUP_COMMENT_MAX);
  const draft = mention.text;
  const [reply, setReply] = useState<ReplyTarget | null>(null);

  const startReply = (c: GroupShareComment) => {
    const target = replyTarget(c);
    const d = replyDraft(target);
    setReply(target);
    mention.start(d.text, d.mentions);
  };
  const resetDraft = () => {
    mention.reset();
    setReply(null);
  };
  const send = () => {
    if (!canSendComment(draft, addComment.isPending) || mention.tooLong) return;
    // Bei einem Fehler bleibt der Entwurf stehen.
    addComment.mutate(
      { body: mention.serialize(), parentId: reply?.threadId ?? null },
      {
        onSuccess: () => {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          resetDraft();
        },
        onError: (e) => useNoticeStore.getState().show('error', e.message),
      }
    );
  };
  const confirmDelete = (c: GroupShareComment) =>
    Alert.alert('Kommentar löschen?', 'Das lässt sich nicht rückgängig machen.', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: () =>
          deleteComment.mutate(c.id, {
            onError: (e) => useNoticeStore.getState().show('error', e.message),
          }),
      },
    ]);

  const renderComment = (c: GroupShareComment, isReply: boolean) => (
    <View key={c.id} style={styles.comment}>
      <View style={[styles.avatar, isReply && styles.avatarReply, { backgroundColor: tone.soft }]}>
        <Text style={[styles.avatarText, { color: tone.accent }]}>
          {personInitials(c.authorName)}
        </Text>
      </View>
      <View style={styles.flex}>
        <View style={[styles.bubble, { backgroundColor: theme.surface }]}>
          <Text style={[styles.author, { color: theme.text }]}>{c.authorName}</Text>
          <Text style={[styles.body, { color: theme.text }]}>
            <GroupMentionText text={c.body} />
          </Text>
        </View>
        <View style={styles.meta}>
          <Text style={[styles.when, { color: theme.textSecondary }]}>
            {formatFeedDate(c.createdAt, 'short')}
          </Text>
          <Pressable
            onPress={() => startReply(c)}
            accessibilityRole="button"
            accessibilityLabel={`Antworten an ${c.authorName}`}
            hitSlop={10}
          >
            <Text style={[styles.replyLink, { color: theme.textSecondary }]}>Antworten</Text>
          </Pressable>
        </View>
        <View style={styles.reactions}>
          <CommentReactions groupId={groupId} comment={c} />
        </View>
      </View>
      <ModerationMenuButton
        name={c.authorName}
        canReport={!c.userId || c.userId !== userId}
        canHide={canHidePerson(c.userId, userId)}
        onReport={() => setReportId(c.id)}
        onHide={() => c.userId && confirmHidePerson(c.userId, c.authorName)}
        shareActions={canDeleteComment(c, userId, isAdmin) ? COMMENT_DELETE_ACTIONS : undefined}
        onShareAction={() => confirmDelete(c)}
        iconSize={18}
      />
    </View>
  );

  return (
    <BottomSheet visible={!!item} onClose={onClose} maxHeight="85%" keyboardAvoiding>
      {item ? (
        <View style={styles.root}>
          <View style={[styles.header, { borderBottomColor: theme.border }]}>
            <View style={[styles.headerIcon, { backgroundColor: theme.surface }]}>
              <Ionicons name={FEED_KIND_ICONS[item.kind]} size={22} color={tone.accent} />
            </View>
            <View style={styles.flex}>
              <Text style={[styles.headerTitle, { color: theme.text }]} accessibilityRole="header">
                Kommentare{comments.data ? ` · ${list.length}` : ''}
              </Text>
              <Text style={[styles.headerSub, { color: theme.textSecondary }]} numberOfLines={1}>
                {item.title}
              </Text>
            </View>
          </View>

          <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
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

          <View style={[styles.composer, { borderTopColor: theme.border }]}>
            {reply ? (
              <View style={styles.replyBar}>
                <Text
                  style={[styles.replyBarText, { color: theme.textSecondary }]}
                  numberOfLines={1}
                >
                  Antwort an {reply.authorName}
                </Text>
                <Pressable
                  onPress={resetDraft}
                  accessibilityRole="button"
                  accessibilityLabel="Antwort abbrechen"
                  hitSlop={10}
                >
                  <Ionicons name="close" size={18} color={theme.textSecondary} />
                </Pressable>
              </View>
            ) : null}
            <MentionSuggestions
              suggestions={mention.suggestions}
              memberCount={mentionOptions.memberCount}
              onChoose={mention.choose}
            />
            <View style={styles.inputRow}>
              <TextInput
                {...mention.inputProps}
                multiline
                placeholder="Kommentar schreiben …"
                placeholderTextColor={theme.textSecondary}
                accessibilityLabel="Kommentar schreiben"
                editable={!addComment.isPending}
                style={[styles.input, { color: theme.text, backgroundColor: theme.surface }]}
              />
              <Pressable
                onPress={send}
                disabled={!canSendComment(draft, addComment.isPending)}
                accessibilityRole="button"
                accessibilityLabel="Kommentar senden"
                accessibilityState={{ disabled: !canSendComment(draft, addComment.isPending) }}
                style={[
                  styles.send,
                  {
                    backgroundColor: tone.accent,
                    opacity: canSendComment(draft, addComment.isPending) ? 1 : 0.4,
                  },
                ]}
              >
                <Ionicons name="arrow-up" size={20} color={colors.white} />
              </Pressable>
            </View>
          </View>
          <ReportSheet
            target={reportId ? { kind: 'group_comment', targetId: reportId, groupId } : null}
            onClose={() => setReportId(null)}
          />
        </View>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  root: { flexShrink: 1, paddingBottom: spacing.medium },
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
  meta: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingLeft: 14, paddingTop: 4 },
  when: { fontFamily: BODY_FONT, fontSize: 12 },
  replyLink: { fontFamily: BODY_FONT, fontSize: 12, fontWeight: '700' },
  reactions: { paddingLeft: 14, paddingTop: 6 },
  composer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 6,
  },
  replyBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  replyBarText: { fontFamily: BODY_FONT, fontSize: 13, flex: 1 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    fontFamily: BODY_FONT,
    fontSize: 15,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
