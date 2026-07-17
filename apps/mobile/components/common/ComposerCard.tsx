import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useCallback, useState } from 'react';
import { View, TextInput, Pressable, StyleSheet, useColorScheme } from 'react-native';

import { useSpeechToText, appendTranscript } from '../../hooks/useSpeechToText';
import { colors, spacing, borderRadius, lightTheme, darkTheme } from '../../theme';

type ComposerVariant = 'card' | 'compact';

interface ComposerCardProps {
  placeholder?: string;
  onSend: (text: string) => void;
  onSettings?: () => void;
  /**
   * `card` (default) = the tall input-on-top/actions-below card (start hero, notebook
   * hero). `compact` = a single-row bar (input grows, actions inline right) for the
   * smaller web-style composer and the bottom-pinned composer bars.
   */
  variant?: ComposerVariant;
}

export function ComposerCard({
  placeholder = 'Nachricht eingeben...',
  onSend,
  onSettings,
  variant = 'card',
}: ComposerCardProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const [text, setText] = useState('');
  const { isListening, toggle: toggleSpeech } = useSpeechToText();

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
  }, [text, onSend]);

  const handleVoice = useCallback(() => {
    void toggleSpeech((transcript) => {
      setText((prev) => appendTranscript(prev, transcript));
    });
  }, [toggleSpeech]);

  const hasText = text.trim().length > 0;
  const compact = variant === 'compact';

  const settingsButton = onSettings ? (
    <Pressable onPress={onSettings} style={styles.settingsButton} hitSlop={6}>
      <Ionicons name="options-outline" size={18} color={theme.textSecondary} />
    </Pressable>
  ) : null;

  const sendOrMic = hasText ? (
    <Pressable onPress={handleSend} style={styles.actionButton}>
      <Ionicons name={compact ? 'arrow-up' : 'arrow-forward'} size={18} color={colors.white} />
    </Pressable>
  ) : (
    <Pressable
      onPress={handleVoice}
      style={[
        styles.actionButton,
        isListening ? { backgroundColor: colors.error[500] } : styles.actionButtonMuted,
      ]}
    >
      <Ionicons
        name={isListening ? 'stop' : 'mic'}
        size={18}
        color={isListening ? colors.white : theme.textSecondary}
      />
    </Pressable>
  );

  const input = (
    <TextInput
      style={[compact ? styles.inputCompact : styles.input, { color: theme.text }]}
      placeholder={placeholder}
      placeholderTextColor={theme.textSecondary}
      value={text}
      onChangeText={setText}
      multiline
      returnKeyType={compact ? 'send' : 'default'}
      blurOnSubmit={compact}
      onSubmitEditing={compact ? handleSend : undefined}
      textAlignVertical="top"
    />
  );

  if (compact) {
    return (
      <View
        style={[
          styles.compactContainer,
          { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: colors.black },
        ]}
      >
        {settingsButton}
        {input}
        <View style={styles.actions}>{sendOrMic}</View>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: colors.black },
      ]}
    >
      {input}
      <View style={[styles.actions, styles.actionsCard]}>
        {settingsButton}
        {sendOrMic}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // card variant (default)
  container: {
    borderRadius: borderRadius.xlarge,
    borderWidth: 1,
    paddingLeft: spacing.medium,
    paddingRight: spacing.small,
    paddingTop: spacing.medium,
    paddingBottom: spacing.small,
    minHeight: 130,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  input: {
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    maxHeight: 120,
    paddingVertical: 0,
    textAlignVertical: 'top',
  },
  actionsCard: {
    justifyContent: 'flex-end',
    marginTop: spacing.xxsmall,
  },
  // compact variant (bar)
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderRadius: borderRadius.pill,
    borderWidth: 1,
    paddingLeft: spacing.xsmall,
    paddingRight: spacing.xxsmall,
    paddingVertical: spacing.xxsmall,
    minHeight: 52,
    gap: spacing.xxsmall,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  inputCompact: {
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    maxHeight: 120,
    paddingTop: 10,
    paddingBottom: 10,
    paddingLeft: spacing.xxsmall,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  settingsButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primary[600],
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionButtonMuted: {
    backgroundColor: 'transparent',
  },
});
