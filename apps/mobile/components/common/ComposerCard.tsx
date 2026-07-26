import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useCallback, useState } from 'react';
import { View, TextInput, Pressable, StyleSheet, Keyboard, useColorScheme } from 'react-native';

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
  autoFocus?: boolean;
  /**
   * Called when the input loses focus while empty — for composers that are
   * revealed on demand (the Wissen tab's FAB) and should fold away again when
   * the user dismisses the keyboard without typing.
   */
  onDismissEmpty?: () => void;
  /**
   * Renders a close button in the left slot (where `onSettings` would sit) — for
   * composers that are revealed on demand and need a way back that does not
   * depend on the field being empty.
   */
  onClose?: () => void;
}

export function ComposerCard({
  placeholder = 'Nachricht eingeben...',
  onSend,
  onSettings,
  variant = 'card',
  autoFocus = false,
  onDismissEmpty,
  onClose,
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

  const iconSize = compact ? 20 : 18;

  const handleClose = useCallback(() => {
    Keyboard.dismiss();
    onClose?.();
  }, [onClose]);

  // The left slot holds one or the other: a settings trigger for the permanent
  // composers, a close button for the ones that fold away.
  const leadingButton = onSettings ? (
    <Pressable
      onPress={onSettings}
      style={[styles.settingsButton, compact && styles.settingsButtonCompact]}
      hitSlop={6}
    >
      <Ionicons name="options-outline" size={iconSize} color={theme.textSecondary} />
    </Pressable>
  ) : onClose ? (
    <Pressable
      onPress={handleClose}
      style={[styles.settingsButton, compact && styles.settingsButtonCompact]}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel="Eingabe schließen"
    >
      <Ionicons name="close" size={iconSize} color={theme.textSecondary} />
    </Pressable>
  ) : null;

  const sendOrMic = hasText ? (
    <Pressable
      onPress={handleSend}
      style={[styles.actionButton, compact && styles.actionButtonCompact]}
    >
      <Ionicons
        name={compact ? 'arrow-up' : 'arrow-forward'}
        size={iconSize}
        color={colors.white}
      />
    </Pressable>
  ) : (
    <Pressable
      onPress={handleVoice}
      style={[
        styles.actionButton,
        compact && styles.actionButtonCompact,
        isListening ? { backgroundColor: colors.error[500] } : styles.actionButtonMuted,
      ]}
    >
      <Ionicons
        name={isListening ? 'stop' : 'mic'}
        size={iconSize}
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
      autoFocus={autoFocus}
      onBlur={() => {
        if (!text.trim()) onDismissEmpty?.();
      }}
      returnKeyType={compact ? 'send' : 'default'}
      blurOnSubmit={compact}
      onSubmitEditing={compact ? handleSend : undefined}
      textAlignVertical="top"
    />
  );

  if (compact) {
    return (
      <View style={[styles.compactContainer, { backgroundColor: theme.surface }]}>
        {leadingButton}
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
        {leadingButton}
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
  // No border and no shadow: the bar sits on the sunrise gradient, and the
  // surface fill alone carries enough contrast to read as a distinct surface.
  //
  // Sizing is ~10% up from the original 52dp bar. minHeight is deliberately the
  // natural content height (input 48 + 5/5 padding), not a round number above
  // it: the row is `alignItems: 'flex-end'`, so any minHeight in excess of the
  // content becomes slack that lands on TOP and pushes everything down.
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderRadius: borderRadius.pill,
    paddingLeft: spacing.xsmall,
    paddingRight: spacing.xxsmall,
    paddingVertical: 5,
    minHeight: 58,
    gap: spacing.xxsmall,
  },
  inputCompact: {
    flex: 1,
    fontSize: 17,
    lineHeight: 24,
    maxHeight: 132,
    paddingTop: 12,
    paddingBottom: 12,
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

  // Compact-only. The row is `alignItems: 'flex-end'` so the buttons stay beside
  // the LAST line once the input grows — but that bottom-aligns them against the
  // input, which is taller than either button (lineHeight 24 + 12/12 padding =
  // 48). Without compensation both sit below the text they belong to, and 2dp
  // apart from each other, since they are not the same size.
  //
  // marginBottom lifts each button's centre onto the text line's centre, which
  // sits paddingBottom(12) + lineHeight/2(12) = 24dp above the content bottom:
  //   settings: 24 - 38/2 = 5      action: 24 - 42/2 = 3
  // Correct for the multi-line case too — the target is the last line, not the
  // input's outer box.
  //
  // The `card` variant centres its actions in a row of its own and needs none of
  // this, which is why these are separate styles rather than edits above.
  settingsButtonCompact: {
    width: 38,
    height: 38,
    borderRadius: 19,
    marginBottom: 5,
  },
  actionButtonCompact: {
    width: 42,
    height: 42,
    borderRadius: 21,
    marginBottom: 3,
  },
  actionButtonMuted: {
    backgroundColor: 'transparent',
  },
});
