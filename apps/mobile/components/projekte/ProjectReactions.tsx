import {
  type GroupShareComment,
  type GroupShareMeta,
  type ReactionSummary,
} from '@gruenerator/contracts';
import {
  groupContentKey,
  groupShareCommentsKey,
  patchCommentReactions,
  type GroupFeedItem,
} from '@gruenerator/shared/groups';
import { useToggleReaction } from '@gruenerator/shared/reactions';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { BODY_FONT } from '../../theme';
import { BottomSheet } from '../common';

import { useProjekteTone } from './projekteTone';
import {
  canToggleEmoji,
  hasReacted,
  patchFeedShareReactions,
  PICKER_EMOJIS,
  reactionChipLabel,
} from './reactions';

interface ReactionRowProps {
  reactions: ReactionSummary[];
  onToggle: (emoji: string) => void;
  compact?: boolean;
}

/** Pillen mit Emoji und Zahl, dahinter ein „+" für die feste Auswahl. */
function ReactionRow({ reactions, onToggle, compact = false }: ReactionRowProps) {
  const theme = useTheme();
  const tone = useProjekteTone();
  const [pickerOpen, setPickerOpen] = useState(false);

  const toggle = (emoji: string) => {
    void Haptics.selectionAsync();
    onToggle(emoji);
  };

  return (
    <View style={styles.row}>
      {reactions.map((r) => (
        <Pressable
          key={r.emoji}
          onPress={() => toggle(r.emoji)}
          disabled={!canToggleEmoji(r.emoji, r.reacted)}
          accessibilityRole="button"
          accessibilityLabel={reactionChipLabel(r)}
          accessibilityState={{ selected: r.reacted }}
          hitSlop={compact ? 6 : 4}
          style={[
            styles.pill,
            compact && styles.pillCompact,
            r.reacted
              ? { backgroundColor: tone.soft, borderColor: tone.accent }
              : { borderColor: theme.border },
          ]}
        >
          <Text style={styles.emoji} importantForAccessibility="no">
            {r.emoji}
          </Text>
          <Text style={[styles.count, { color: theme.text }]} importantForAccessibility="no">
            {r.count}
          </Text>
        </Pressable>
      ))}
      <Pressable
        onPress={() => setPickerOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Reaktion hinzufügen"
        hitSlop={8}
        style={[styles.pill, compact && styles.pillCompact, { borderColor: theme.border }]}
      >
        <Ionicons name="happy-outline" size={compact ? 16 : 18} color={theme.textSecondary} />
      </Pressable>
      <BottomSheet visible={pickerOpen} onClose={() => setPickerOpen(false)} padded>
        <View style={styles.picker} accessibilityRole="menu">
          {PICKER_EMOJIS.map((emoji) => (
            <Pressable
              key={emoji}
              onPress={() => {
                setPickerOpen(false);
                toggle(emoji);
              }}
              accessibilityRole="button"
              accessibilityLabel={emoji}
              accessibilityState={{ selected: hasReacted(reactions, emoji) }}
              style={[
                styles.pickerItem,
                hasReacted(reactions, emoji) && { backgroundColor: tone.soft },
              ]}
            >
              <Text style={styles.pickerEmoji}>{emoji}</Text>
            </Pressable>
          ))}
        </View>
      </BottomSheet>
    </View>
  );
}

export function ShareReactions({ groupId, share }: { groupId: string; share: GroupShareMeta }) {
  const reactions = share.reactions ?? [];
  const { toggle } = useToggleReaction<GroupFeedItem[]>({
    entityType: 'group_share',
    entityId: share.shareId,
    queryKey: groupContentKey(groupId),
    update: (data, apply) => patchFeedShareReactions(data, share.shareId, apply),
  });
  return (
    <ReactionRow reactions={reactions} onToggle={(e) => toggle(e, hasReacted(reactions, e))} />
  );
}

export function CommentReactions({
  groupId,
  comment,
}: {
  groupId: string;
  comment: GroupShareComment;
}) {
  const { toggle } = useToggleReaction<GroupShareComment[]>({
    entityType: 'group_comment',
    entityId: comment.id,
    queryKey: groupShareCommentsKey(groupId, comment.shareId),
    update: (data, apply) => patchCommentReactions(data, comment.id, apply),
  });
  return (
    <ReactionRow
      compact
      reactions={comment.reactions}
      onToggle={(e) => toggle(e, hasReacted(comment.reactions, e))}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  pill: {
    minHeight: 32,
    minWidth: 32,
    paddingHorizontal: 10,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  pillCompact: { minHeight: 28, minWidth: 28, paddingHorizontal: 8, borderRadius: 14 },
  emoji: { fontSize: 14 },
  count: { fontFamily: BODY_FONT, fontSize: 13, fontVariant: ['tabular-nums'] },
  picker: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, padding: 8 },
  pickerItem: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerEmoji: { fontSize: 28 },
});
