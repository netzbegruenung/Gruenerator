import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { borderRadius, chatType, spacing } from '../../../theme';
import { type Theme } from '../../../theme/colors';

import { type AnswerModeChipView } from './answerModeChipView';

/**
 * Which notebook answer mode wrote this answer — "Präzisionsmodus" or
 * "Chatmodus", plus a quiet "automatisch gewählt" when the auto guard decided.
 * Same shape and place as `AgentBadge`: a pill above the answer.
 */
export const AnswerModeChip = memo(function AnswerModeChip({
  view,
  theme,
}: {
  view: AnswerModeChipView;
  theme: Theme;
}) {
  return (
    <View
      style={[styles.chip, { backgroundColor: theme.surface }]}
      accessible
      accessibilityLabel={view.accessibilityLabel}
    >
      <Text style={[styles.label, { color: theme.textSecondary }]} numberOfLines={1}>
        {view.label}
      </Text>
      {view.hint && (
        <Text style={[styles.hint, { color: theme.textSecondary }]} numberOfLines={1}>
          · {view.hint}
        </Text>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxsmall,
    borderRadius: borderRadius.pill,
    paddingHorizontal: spacing.xsmall,
    paddingVertical: 3,
    marginBottom: spacing.xxsmall,
  },
  label: {
    ...chatType.chatLabel,
    fontWeight: '600',
  },
  hint: {
    ...chatType.chatLabel,
  },
});
