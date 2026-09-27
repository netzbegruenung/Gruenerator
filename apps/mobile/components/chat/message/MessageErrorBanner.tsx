import { ErrorPrimitive, useAui } from '@assistant-ui/react-native';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { memo, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, useColorScheme } from 'react-native';

import { colors, spacing, borderRadius, BODY_FONT, chatType } from '../../../theme';

import { flagRegenerate } from './threadRunSignals';

import type { Theme } from '../../../theme/colors';

/**
 * Inline failure state for an assistant turn — the native counterpart of web's
 * MessageErrorBanner.
 *
 * Without it every failure the adapter reported was INVISIBLE on the phone: the
 * message simply stopped growing and read as a short answer. Partial text stays
 * rendered above the banner — a half-written answer is still worth reading, it
 * just must not look finished.
 *
 * `ErrorPrimitive.Root` carries its own gate (`useMessageError()` → null when the
 * message has no error), so this costs nothing on healthy turns and needs no
 * `MessagePrimitive.Error` wrapper — @assistant-ui/react-native ships none.
 *
 * Retry goes through `flagRegenerate` before `reload`, exactly like the action
 * bar's regenerate: without the flag the failed turn stays behind in
 * `chat_messages` and the thread grows a duplicate on every attempt.
 */
export const MessageErrorBanner = memo(function MessageErrorBanner({ theme }: { theme: Theme }) {
  const aui = useAui();
  const isDark = useColorScheme() === 'dark';

  const handleRetry = useCallback(() => {
    flagRegenerate();
    aui.message.reload();
  }, [aui]);

  const tint = isDark ? colors.error[400] : colors.error[700];

  return (
    <ErrorPrimitive.Root
      style={[
        styles.banner,
        {
          backgroundColor: isDark ? colors.error[950] : colors.error[50],
          borderColor: isDark ? colors.error[800] : colors.error[200],
        },
      ]}
    >
      <View style={styles.row}>
        <Ionicons name="alert-circle-outline" size={15} color={tint} />
        <ErrorPrimitive.Message style={[styles.message, { color: tint }]} />
      </View>
      <Pressable
        onPress={handleRetry}
        testID="chat-message-error-retry"
        accessibilityRole="button"
        accessibilityLabel="Erneut versuchen"
        style={({ pressed }) => [
          styles.retry,
          { borderColor: theme.border, opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <Ionicons name="refresh-outline" size={14} color={theme.text} />
        <Text style={[styles.retryLabel, { color: theme.text }]}>Erneut versuchen</Text>
      </Pressable>
    </ErrorPrimitive.Root>
  );
});

const styles = StyleSheet.create({
  banner: {
    marginTop: spacing.xsmall,
    borderWidth: 1,
    borderRadius: borderRadius.medium,
    padding: spacing.small,
    gap: spacing.xsmall,
    alignItems: 'flex-start',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xxsmall,
  },
  message: {
    ...chatType.chatSecondary,
    flexShrink: 1,
  },
  retry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxsmall,
    borderWidth: 1,
    borderRadius: borderRadius.full,
    paddingVertical: spacing.xxsmall,
    paddingHorizontal: spacing.small,
  },
  retryLabel: {
    ...chatType.chatLabel,
    fontFamily: BODY_FONT,
    fontWeight: '600',
  },
});
