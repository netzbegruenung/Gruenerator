import { type MenuAction } from '@expo/ui/community/menu';
import {
  GROUP_COMMENT_MAX,
  REACTION_EMOJIS,
  type EntityComment,
  type MarketplaceItem,
  type ReactionSummary,
} from '@gruenerator/contracts';
import {
  MARKETPLACE_COMMENT_TYPE,
  entityCommentsKey,
  useAddEntityComment,
  useDeleteEntityComment,
  useEntityComments,
  useToggleCommentReaction,
  useToggleItemReaction,
} from '@gruenerator/shared/comments';
import {
  errMessage,
  formatFeedDate,
  personInitials,
  threadComments,
} from '@gruenerator/shared/groups';
import {
  MARKETPLACE_QUERY_KEY,
  canReport,
  useMarketplaceLike,
  type MarketplaceTarget,
} from '@gruenerator/shared/marketplace';
import { useAuthStore } from '@gruenerator/shared/stores';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useQueryClient } from '@tanstack/react-query';
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

import { useHiddenMemberIds } from '../../hooks/useHiddenMembers';
import { useTheme } from '../../hooks/useTheme';
import { BODY_FONT, borderRadius, colors, spacing } from '../../theme';
import { canHidePerson } from '../../utils/hiddenMembers';
import { DetailSection, Hint, shareLink } from '../agentura/detail/DetailParts';
import { MenuActionSheet } from '../chat/MenuActionSheet';
import { Button } from '../common/Button';
import { confirmHidePerson } from '../common/confirmHidePerson';
import { SHEET_HANDOFF_MS } from '../common/CreateMenuSheet';
import { useSurfaceStyles } from '../common/ListRow';
import { ReportSheet, type ReportTarget } from '../common/ReportSheet';
import { SkeletonRows } from '../common/Skeleton';

const FIXED_EMOJIS: readonly string[] = REACTION_EMOJIS;

const hasReacted = (reactions: ReactionSummary[], emoji: string) =>
  reactions.find((r) => r.emoji === emoji)?.reacted ?? false;

/** Alle wählbaren Emojis mit ihren Zahlen, dahinter Altbestand (💡), der nur noch entfernt werden kann. */
function withAllEmojis(reactions: ReactionSummary[]): ReactionSummary[] {
  const byEmoji = new Map(reactions.map((r) => [r.emoji, r]));
  return [
    ...FIXED_EMOJIS.map((emoji) => byEmoji.get(emoji) ?? { emoji, count: 0, reacted: false }),
    ...reactions.filter((r) => !FIXED_EMOJIS.includes(r.emoji)),
  ];
}

function ReactionChips({
  reactions,
  onToggle,
  pickable = false,
}: {
  reactions: ReactionSummary[];
  onToggle: (emoji: string, reacted: boolean) => void;
  /** Ein Knopf, der alle Emojis zur Wahl stellt — wie der Picker der `ReactionBar` im Web. */
  pickable?: boolean;
}) {
  const theme = useTheme();
  const [picking, setPicking] = useState(false);
  const shown = picking ? withAllEmojis(reactions) : reactions;
  if (shown.length === 0 && !pickable) return null;
  return (
    <View style={styles.chips}>
      {shown.map((r) => {
        // Altbestand außerhalb der festen Auswahl lässt sich entfernen, nicht hinzufügen.
        const locked = !r.reacted && !FIXED_EMOJIS.includes(r.emoji);
        return (
          <Pressable
            key={r.emoji}
            disabled={locked}
            onPress={() => {
              setPicking(false);
              onToggle(r.emoji, r.reacted);
            }}
            accessibilityRole="button"
            accessibilityLabel={`${r.emoji} ${r.count}`}
            accessibilityState={{ selected: r.reacted, disabled: locked }}
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
        );
      })}
      {pickable && !picking ? (
        <Pressable
          onPress={() => setPicking(true)}
          accessibilityRole="button"
          accessibilityLabel="Reagieren"
          hitSlop={4}
          style={({ pressed }) => [
            styles.chip,
            { borderColor: theme.border },
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="happy-outline" size={16} color={theme.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

function ItemReactions({
  target,
  reactions,
}: {
  target: MarketplaceTarget;
  reactions: ReactionSummary[];
}) {
  const { toggle } = useToggleItemReaction(MARKETPLACE_COMMENT_TYPE[target.kind], target.ref);
  return <ReactionChips reactions={withAllEmojis(reactions)} onToggle={toggle} />;
}

function CommentReactions({ comment }: { comment: EntityComment }) {
  const { toggle } = useToggleCommentReaction(comment);
  return (
    <ReactionChips
      reactions={comment.reactions}
      onToggle={(emoji) => toggle(emoji, hasReacted(comment.reactions, emoji))}
      pickable
    />
  );
}

/** Ein Eingabefeld mit Senden-Knopf — für neue Kommentare und für Antworten. */
function CommentComposer({
  placeholder,
  onSubmit,
  onCancel,
  autoFocus = false,
}: {
  placeholder: string;
  onSubmit: (body: string) => Promise<unknown>;
  onCancel?: () => void;
  autoFocus?: boolean;
}) {
  const theme = useTheme();
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const body = draft.trim();

  const send = async () => {
    if (!body || pending) return;
    setPending(true);
    try {
      await onSubmit(body);
      setDraft('');
    } catch (error) {
      Alert.alert('Fehler', errMessage(error));
    }
    // No `finally`: the React Compiler cannot lower it (reactCompilerCoverage).
    setPending(false);
  };

  return (
    <View style={styles.composer}>
      <TextInput
        value={draft}
        onChangeText={setDraft}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        multiline
        autoFocus={autoFocus}
        maxLength={GROUP_COMMENT_MAX}
        editable={!pending}
        accessibilityLabel={placeholder}
        style={[styles.input, { color: theme.text, backgroundColor: theme.surface }]}
      />
      {onCancel ? (
        <Pressable
          onPress={onCancel}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="Antwort abbrechen"
          style={({ pressed }) => [styles.send, pressed && styles.pressed]}
        >
          <Ionicons name="close" size={20} color={theme.textSecondary} />
        </Pressable>
      ) : null}
      <Pressable
        onPress={() => void send()}
        disabled={!body || pending}
        accessibilityRole="button"
        accessibilityLabel="Senden"
        accessibilityState={{ disabled: !body || pending }}
        hitSlop={6}
        style={({ pressed }) => [
          styles.send,
          { backgroundColor: colors.secondary[600] },
          (!body || pending) && styles.disabled,
          pressed && styles.pressed,
        ]}
      >
        {pending ? (
          <ActivityIndicator size="small" color={colors.white} />
        ) : (
          <Ionicons name="arrow-up" size={20} color={colors.white} />
        )}
      </Pressable>
    </View>
  );
}

export interface MarketplaceDiscussionProps {
  /** Woran Kommentare und Reaktionen hängen — `(kind, ref)`, derselbe Schlüssel wie bei Likes. */
  target: MarketplaceTarget;
  /**
   * Der Eintrag, wie der Marktplatz ihn führt — für sein Like und seine Meldung.
   * `null`, wo der Marktplatz ihn nicht führt (ein privater oder nur im Projekt
   * geteilter Agent).
   */
  item: MarketplaceItem | null;
  /** Die Eigentümer*in darf fremde Kommentare löschen. */
  canModerate: boolean;
  /** „Teilen" gibt diesen Link weiter; weggelassen, wo die Seite selbst teilt. */
  shareUrl?: string;
  /**
   * Aus in einem Sheet: das Meldeformular wäre ein Modal über dem Modal. Gilt
   * für den Eintrag und für die Kommentare gleichermaßen.
   */
  allowReport?: boolean;
}

/**
 * Der eine Interaktionsblock unter jedem Marktplatz-Eintrag, gleich welcher
 * Art (wie `MarketplaceDiscussion` im Web): Gefällt mir, Teilen, Melden,
 * Reaktionen auf den Eintrag, dann die Kommentare — jeder mit Reaktionen und
 * „Antworten", fremde mit „Melden". Löschen dürfen Verfasser*in und
 * Eigentümer*in; fremde Personen lassen sich wie in Projekten auf diesem Gerät
 * ausblenden.
 */
export function MarketplaceDiscussion({
  target,
  item,
  canModerate,
  shareUrl,
  allowReport = true,
}: MarketplaceDiscussionProps) {
  const theme = useTheme();
  const { card } = useSurfaceStyles();
  const queryClient = useQueryClient();
  const type = MARKETPLACE_COMMENT_TYPE[target.kind];
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const hiddenIds = useHiddenMemberIds();
  const discussion = useEntityComments(type, target.ref);
  const addComment = useAddEntityComment(type, target.ref);
  const deleteComment = useDeleteEntityComment(type, target.ref);
  const like = useMarketplaceLike();
  const [replyTo, setReplyTo] = useState<{ threadId: string; toName: string } | null>(null);
  const [menuFor, setMenuFor] = useState<EntityComment | null>(null);
  const [reporting, setReporting] = useState<ReportTarget | null>(null);
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

  const actionsFor = (c: EntityComment): MenuAction[] => {
    const mine = c.userId !== null && c.userId === userId;
    const actions: MenuAction[] = [];
    if (canModerate || mine)
      actions.push({ id: 'delete', title: 'Kommentar löschen', attributes: { destructive: true } });
    if (allowReport && userId && !mine) actions.push({ id: 'report', title: 'Melden' });
    if (canHidePerson(c.userId, userId)) actions.push({ id: 'hide', title: 'Person ausblenden' });
    return actions;
  };

  const handleMenu = (comment: EntityComment, id: string) => {
    // Das Menü-Sheet geht noch; iOS zeigt im selben Moment keinen zweiten Dialog.
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (id === 'report') {
        setReporting({ kind: 'entity_comment', targetId: comment.id });
        return;
      }
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

  const renderComment = (c: EntityComment, threadId: string, isReply: boolean) => {
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
          <View style={styles.commentFoot}>
            <CommentReactions comment={c} />
            <Pressable
              onPress={() => setReplyTo({ threadId, toName: c.authorName })}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={`${c.authorName} antworten`}
            >
              <Text style={[styles.replyLink, { color: theme.textSecondary }]}>Antworten</Text>
            </Pressable>
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <DetailSection title={`Kommentare${threads.length ? ` · ${threads.length}` : ''}`}>
      <View style={styles.bar}>
        {item ? (
          <Button
            variant="ghost"
            onPress={() =>
              like.mutate(item, { onError: (error) => Alert.alert('Fehler', error.message) })
            }
          >
            {item.liked ? `Gefällt dir (${item.likesCount})` : `Gefällt mir (${item.likesCount})`}
          </Button>
        ) : null}
        {shareUrl ? (
          <Button variant="ghost" onPress={() => shareLink(shareUrl, item?.title ?? 'Marktplatz')}>
            Teilen
          </Button>
        ) : null}
        {allowReport && item && canReport(item) ? (
          <Button
            variant="ghost"
            onPress={() => setReporting({ kind: item.reportKind, targetId: item.ref })}
          >
            Melden
          </Button>
        ) : null}
      </View>

      {discussion.isPending ? (
        <SkeletonRows count={2} leading={32} />
      ) : discussion.isError ? (
        <Hint tone="error">{errMessage(discussion.error)}</Hint>
      ) : (
        <>
          <ItemReactions target={target} reactions={discussion.data.reactions} />
          <View style={[styles.card, card]}>
            {threads.length === 0 ? (
              <Text style={[styles.empty, { color: theme.textSecondary }]}>
                Noch keine Kommentare. Schreib den ersten.
              </Text>
            ) : (
              threads.map((t) => (
                <View key={t.comment.id} style={styles.thread}>
                  {renderComment(t.comment, t.comment.id, false)}
                  {t.replies.map((r) => renderComment(r, t.comment.id, true))}
                  {replyTo?.threadId === t.comment.id ? (
                    <View style={styles.reply}>
                      <CommentComposer
                        autoFocus
                        placeholder={`${replyTo.toName.split(' ')[0]} antworten …`}
                        onCancel={() => setReplyTo(null)}
                        onSubmit={(body) =>
                          addComment
                            .mutateAsync({ body, parentId: t.comment.id })
                            .then(() => setReplyTo(null))
                        }
                      />
                    </View>
                  ) : null}
                </View>
              ))
            )}
            <View style={[styles.footer, { borderTopColor: theme.border }]}>
              <CommentComposer
                placeholder="Kommentieren …"
                onSubmit={(body) => addComment.mutateAsync({ body })}
              />
            </View>
          </View>
        </>
      )}

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
      {allowReport ? (
        <ReportSheet
          target={reporting}
          onClose={() => setReporting(null)}
          // Genug Meldungen verbergen den Inhalt sofort; die Liste soll ihn nicht weiter zeigen.
          onReported={() =>
            void queryClient.invalidateQueries({
              queryKey:
                reporting?.kind === 'entity_comment'
                  ? entityCommentsKey(type, target.ref)
                  : MARKETPLACE_QUERY_KEY,
            })
          }
        />
      ) : null}
    </DetailSection>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xsmall },
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
  commentFoot: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  replyLink: { fontFamily: BODY_FONT, fontSize: 13, fontWeight: '700' },
  author: { fontFamily: BODY_FONT, fontSize: 14, fontWeight: '700', flexShrink: 1 },
  when: { fontFamily: BODY_FONT, fontSize: 12 },
  more: { marginLeft: 'auto', padding: 2 },
  text: { fontFamily: BODY_FONT, fontSize: 15, lineHeight: 21 },
  footer: {
    paddingTop: spacing.small,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.xsmall,
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
