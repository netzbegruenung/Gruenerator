import { type MenuAction } from '@expo/ui/community/menu';
import { REACTION_EMOJIS, type AgentComment, type ReactionSummary } from '@gruenerator/contracts';
import {
  errMessage,
  formatFeedDate,
  personInitials,
  threadComments,
} from '@gruenerator/shared/groups';
import {
  agentCommentsKey,
  patchAgentCommentReactions,
  patchAgentReactions,
  useAddAgentComment,
  useAgentComments,
  useDeleteAgentComment,
  useToggleReaction,
  type AgentDiscussion as AgentDiscussionData,
} from '@gruenerator/shared/reactions';
import { useAuthStore } from '@gruenerator/shared/stores';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useHiddenMemberIds } from '../../../hooks/useHiddenMembers';
import { useTheme } from '../../../hooks/useTheme';
import { BODY_FONT, borderRadius, colors, spacing } from '../../../theme';
import { canHidePerson } from '../../../utils/hiddenMembers';
import { MenuActionSheet } from '../../chat/MenuActionSheet';
import { SkeletonRows, useSurfaceStyles } from '../../common';
import { confirmHidePerson } from '../../common/confirmHidePerson';
import { SHEET_HANDOFF_MS } from '../../common/CreateMenuSheet';

import { DetailSection, Hint } from './DetailParts';

const hasReacted = (reactions: ReactionSummary[], emoji: string) =>
  reactions.find((r) => r.emoji === emoji)?.reacted ?? false;

/** Alle wählbaren Emojis mit ihren Zahlen, dahinter Altbestand (💡), der nur noch entfernt werden kann. */
function withAllEmojis(reactions: ReactionSummary[]): ReactionSummary[] {
  const byEmoji = new Map(reactions.map((r) => [r.emoji, r]));
  const fixed: readonly string[] = REACTION_EMOJIS;
  return [
    ...fixed.map((emoji) => byEmoji.get(emoji) ?? { emoji, count: 0, reacted: false }),
    ...reactions.filter((r) => !fixed.includes(r.emoji)),
  ];
}

function ReactionChips({
  reactions,
  onToggle,
}: {
  reactions: ReactionSummary[];
  onToggle: (emoji: string, reacted: boolean) => void;
}) {
  const theme = useTheme();
  if (reactions.length === 0) return null;
  return (
    <View style={styles.chips}>
      {reactions.map((r) => (
        <Pressable
          key={r.emoji}
          onPress={() => onToggle(r.emoji, r.reacted)}
          accessibilityRole="button"
          accessibilityLabel={`${r.emoji} ${r.count}`}
          accessibilityState={{ selected: r.reacted }}
          style={({ pressed }) => [
            styles.chip,
            {
              borderColor: r.reacted ? theme.textGreen : theme.border,
              backgroundColor: r.reacted ? theme.surface : 'transparent',
            },
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.chipEmoji}>{r.emoji}</Text>
          {r.count > 0 ? (
            <Text
              style={[
                styles.chipCount,
                { color: r.reacted ? theme.textGreen : theme.textSecondary },
              ]}
            >
              {r.count}
            </Text>
          ) : null}
        </Pressable>
      ))}
    </View>
  );
}

function AgentReactions({ agentId, reactions }: { agentId: string; reactions: ReactionSummary[] }) {
  const { toggle } = useToggleReaction<AgentDiscussionData>({
    entityType: 'agent',
    entityId: agentId,
    queryKey: agentCommentsKey(agentId),
    update: patchAgentReactions,
  });
  return <ReactionChips reactions={withAllEmojis(reactions)} onToggle={toggle} />;
}

function CommentReactions({ comment }: { comment: AgentComment }) {
  const { toggle } = useToggleReaction<AgentDiscussionData>({
    entityType: 'agent_comment',
    entityId: comment.id,
    queryKey: agentCommentsKey(comment.agentId),
    update: (data, apply) => patchAgentCommentReactions(data, comment.id, apply),
  });
  return (
    <ReactionChips
      reactions={comment.reactions}
      onToggle={(emoji) => toggle(emoji, hasReacted(comment.reactions, emoji))}
    />
  );
}

/**
 * Reaktionen auf den Agent und die Kommentare darunter, wie `AgentDiscussion`
 * im Web. Löschen dürfen Verfasser*in und Eigentümer*in des Agents; fremde
 * Personen lassen sich wie in Projekten auf diesem Gerät ausblenden.
 */
export function AgentDiscussion({ agentId, isOwner }: { agentId: string; isOwner: boolean }) {
  const theme = useTheme();
  const { card } = useSurfaceStyles();
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const hiddenIds = useHiddenMemberIds();
  const discussion = useAgentComments(agentId);
  const addComment = useAddAgentComment(agentId);
  const deleteComment = useDeleteAgentComment(agentId);
  const [draft, setDraft] = useState('');
  const [menuFor, setMenuFor] = useState<AgentComment | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const threads = useMemo(
    () =>
      threadComments(
        (discussion.data?.comments ?? []).filter((c) => !(c.userId && hiddenIds.has(c.userId)))
      ),
    [discussion.data, hiddenIds]
  );

  const actionsFor = (c: AgentComment): MenuAction[] => {
    const actions: MenuAction[] = [];
    if (isOwner || (c.userId !== null && c.userId === userId))
      actions.push({ id: 'delete', title: 'Kommentar löschen', attributes: { destructive: true } });
    if (canHidePerson(c.userId, userId)) actions.push({ id: 'hide', title: 'Person ausblenden' });
    return actions;
  };

  const handleMenu = (comment: AgentComment, id: string) => {
    // Das Menü-Sheet geht noch; iOS zeigt im selben Moment keinen zweiten Dialog.
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (id === 'hide' && comment.userId) {
        confirmHidePerson(comment.userId, comment.authorName);
        return;
      }
      if (id !== 'delete') return;
      Alert.alert('Kommentar löschen?', 'Das lässt sich nicht rückgängig machen.', [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Löschen',
          style: 'destructive',
          onPress: () =>
            deleteComment.mutate(comment.id, {
              onError: (error) => Alert.alert('Fehler', errMessage(error)),
            }),
        },
      ]);
    }, SHEET_HANDOFF_MS);
  };

  const send = () => {
    const body = draft.trim();
    if (!body || addComment.isPending) return;
    addComment.mutate(
      { body },
      {
        onSuccess: () => setDraft(''),
        onError: (error) => Alert.alert('Fehler', errMessage(error)),
      }
    );
  };

  const renderComment = (c: AgentComment, isReply: boolean) => {
    const actions = actionsFor(c);
    return (
      <Pressable
        key={c.id}
        onLongPress={actions.length > 0 ? () => setMenuFor(c) : null}
        style={({ pressed }) => [
          styles.comment,
          isReply && styles.reply,
          pressed && actions.length > 0 && styles.pressed,
        ]}
        {...(actions.length > 0 ? { accessibilityHint: 'Lange drücken für Optionen' } : {})}
      >
        <View style={[styles.avatar, { backgroundColor: theme.surface }]}>
          <Text style={[styles.avatarText, { color: theme.textSecondary }]}>
            {personInitials(c.authorName)}
          </Text>
        </View>
        <View style={styles.commentBody}>
          <View style={styles.commentHead}>
            <Text style={[styles.author, { color: theme.text }]} numberOfLines={1}>
              {c.authorName}
            </Text>
            <Text style={[styles.when, { color: theme.textSecondary }]}>
              {formatFeedDate(c.createdAt, 'short')}
            </Text>
            {actions.length > 0 ? (
              <Pressable
                onPress={() => setMenuFor(c)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Optionen für den Kommentar von ${c.authorName}`}
                style={({ pressed }) => [styles.more, pressed && styles.pressed]}
              >
                <Ionicons name="ellipsis-horizontal" size={18} color={theme.textSecondary} />
              </Pressable>
            ) : null}
          </View>
          <Text style={[styles.text, { color: theme.text }]} selectable>
            {c.body}
          </Text>
          <CommentReactions comment={c} />
        </View>
      </Pressable>
    );
  };

  if (discussion.isPending) {
    return (
      <DetailSection title="Diskussion">
        <SkeletonRows count={2} leading={32} />
      </DetailSection>
    );
  }
  if (discussion.isError) {
    return (
      <DetailSection title="Diskussion">
        <Hint tone="error">{errMessage(discussion.error)}</Hint>
      </DetailSection>
    );
  }

  return (
    <DetailSection title={`Diskussion${threads.length ? ` · ${threads.length}` : ''}`}>
      <AgentReactions agentId={agentId} reactions={discussion.data.reactions} />
      <View style={[styles.card, card]}>
        {threads.length === 0 ? (
          <Text style={[styles.empty, { color: theme.textSecondary }]}>Noch keine Kommentare.</Text>
        ) : (
          threads.map((t) => (
            <View key={t.comment.id} style={styles.thread}>
              {renderComment(t.comment, false)}
              {t.replies.map((r) => renderComment(r, true))}
            </View>
          ))
        )}
        <View style={[styles.composer, { borderTopColor: theme.border }]}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Kommentar schreiben …"
            placeholderTextColor={theme.textSecondary}
            multiline
            editable={!addComment.isPending}
            accessibilityLabel="Kommentar"
            style={[styles.input, { color: theme.text, backgroundColor: theme.surface }]}
          />
          <Pressable
            onPress={send}
            disabled={!draft.trim() || addComment.isPending}
            accessibilityRole="button"
            accessibilityLabel="Kommentar senden"
            accessibilityState={{ disabled: !draft.trim() || addComment.isPending }}
            hitSlop={6}
            style={({ pressed }) => [
              styles.send,
              { backgroundColor: colors.secondary[600] },
              (!draft.trim() || addComment.isPending) && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            {addComment.isPending ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Ionicons name="arrow-up" size={20} color={colors.white} />
            )}
          </Pressable>
        </View>
      </View>
      <MenuActionSheet
        visible={menuFor !== null}
        theme={theme}
        heading={menuFor ? `Kommentar von ${menuFor.authorName}` : ''}
        actions={menuFor ? actionsFor(menuFor) : []}
        onSelect={(id) => {
          if (menuFor) handleMenu(menuFor, id);
        }}
        onClose={() => setMenuFor(null)}
      />
    </DetailSection>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  chipEmoji: { fontSize: 15 },
  chipCount: { fontFamily: BODY_FONT, fontSize: 13, fontWeight: '700' },
  card: {
    borderRadius: borderRadius.large,
    borderCurve: 'continuous',
    padding: spacing.medium,
    gap: spacing.medium,
  },
  empty: { fontFamily: BODY_FONT, fontSize: 14 },
  thread: { gap: spacing.small },
  comment: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  reply: { marginLeft: 42 },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: BODY_FONT, fontSize: 12, fontWeight: '700' },
  commentBody: { flex: 1, minWidth: 0, gap: 4 },
  commentHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  author: { fontFamily: BODY_FONT, fontSize: 14, fontWeight: '700', flexShrink: 1 },
  when: { fontFamily: BODY_FONT, fontSize: 12 },
  more: { marginLeft: 'auto', padding: 2 },
  text: { fontFamily: BODY_FONT, fontSize: 15, lineHeight: 21 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.xsmall,
    paddingTop: spacing.small,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    borderRadius: 20,
    paddingHorizontal: spacing.small,
    paddingTop: 10,
    paddingBottom: 10,
    fontFamily: BODY_FONT,
    fontSize: 15,
  },
  send: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.6 },
});
