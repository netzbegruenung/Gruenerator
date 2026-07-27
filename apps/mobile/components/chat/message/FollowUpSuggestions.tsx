import { ThreadPrimitive, useAuiState } from '@assistant-ui/react-native';
import { type ChatMessageMetadata } from '@gruenerator/chat';
import { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { useTheme } from '../../../hooks/useTheme';
import { spacing, borderRadius, BODY_FONT, chatType } from '../../../theme';

/**
 * Follow-up prompts under the last answer. These ride on message metadata
 * rather than a SuggestionAdapter, which is why they use
 * `ThreadPrimitive.Suggestion` (prompt passed in) instead of the
 * suggestion-context primitives.
 */
export const FollowUpSuggestions = memo(function FollowUpSuggestions() {
  const theme = useTheme();
  const message = useAuiState((s) => s.message);
  const isLast = useAuiState((s) => s.message.isLast);
  const isRunning = useAuiState((s) => s.thread.isRunning);

  if (!isLast || isRunning) return null;

  const metadata = ((message.metadata as Record<string, unknown>)?.custom ??
    {}) as ChatMessageMetadata;
  const suggestions = metadata.followUpSuggestions;
  if (!suggestions || suggestions.length === 0) return null;

  return (
    <View style={styles.container}>
      {suggestions.map((prompt) => (
        <ThreadPrimitive.Suggestion
          key={prompt}
          prompt={prompt}
          send
          style={[styles.chip, { borderColor: theme.border, backgroundColor: theme.surface }]}
        >
          <Text style={[styles.text, { color: theme.text }]} numberOfLines={2}>
            {prompt}
          </Text>
        </ThreadPrimitive.Suggestion>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.medium,
    marginTop: spacing.xsmall,
    marginBottom: spacing.small,
    gap: spacing.xsmall,
  },
  chip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: borderRadius.large,
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.xsmall,
  },
  text: {
    ...chatType.chatSecondary,
  },
});
