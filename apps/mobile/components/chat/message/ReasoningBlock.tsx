import { Ionicons } from '@react-native-vector-icons/ionicons';
import { memo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

import { useTheme } from '../../../hooks/useTheme';
import { colors, spacing, borderRadius, chatType } from '../../../theme';

import type { Theme } from '../../../theme/colors';

/** Collapsed-by-default "Gedankengang" for a reasoning part. */
export const ReasoningBlock = memo(function ReasoningBlock({
  part,
  theme,
}: {
  part: { text: string };
  theme: Theme;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!part.text) return null;

  return (
    <View style={[styles.container, { borderColor: theme.border }]}>
      <Pressable style={styles.trigger} onPress={() => setExpanded(!expanded)}>
        <Ionicons name="bulb-outline" size={14} color={colors.primary[500]} />
        <Text style={[styles.label, { color: theme.textSecondary }]}>Gedankengang</Text>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={14}
          color={theme.textSecondary}
        />
      </Pressable>
      {expanded && <Text style={[styles.text, { color: theme.textSecondary }]}>{part.text}</Text>}
    </View>
  );
});

/** The shape `MessagePrimitive.Parts` hands to its `Reasoning` slot. */
export function AssistantReasoningPart(props: { text: string }) {
  const theme = useTheme();
  return <ReasoningBlock part={props} theme={theme} />;
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.xsmall,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: borderRadius.medium,
    overflow: 'hidden',
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxsmall,
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.xsmall,
  },
  label: {
    ...chatType.chatLabel,
    flex: 1,
    fontWeight: '600',
  },
  text: {
    ...chatType.chatSecondary,
    paddingHorizontal: spacing.small,
    paddingBottom: spacing.small,
  },
});
