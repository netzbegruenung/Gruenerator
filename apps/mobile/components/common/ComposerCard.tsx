import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useCallback, useState } from 'react';
import { TextInput, Pressable } from 'react-native';

import { useSpeechToText, appendTranscript } from '../../hooks/useSpeechToText';
import { useTheme } from '../../hooks/useTheme';
import { colors } from '../../theme';

import {
  ComposerShell,
  composerActionButtonStyle,
  composerIconButtonStyle,
  composerIconSize,
  composerInputStyle,
  COMPOSER_ACTION_FILL,
  type ComposerVariant,
} from './ComposerShell';

interface ComposerCardProps {
  placeholder?: string;
  onSend: (text: string) => void;
  onSettings?: () => void;
  /** See `ComposerVariant` — `card` (default) for landing heroes, `bar` for the
   *  bottom-pinned tab composer. */
  variant?: ComposerVariant;
  /** Enables `<prefix>-input` / `<prefix>-send` testIDs for the Maestro flows. */
  testIDPrefix?: string;
}

/**
 * @deprecated Use `Composer` (same folder) with its default `local` binding.
 *
 * Kept as a working fallback while the unified `Composer` beds in: it is the
 * runtime-free composer as it stood before the merge, already rendering through
 * `ComposerShell`, so swapping a call site back is a one-line import change.
 * Delete once `Composer` has shipped without regressions.
 */
export function ComposerCard({
  placeholder = 'Nachricht eingeben...',
  onSend,
  onSettings,
  variant = 'card',
  testIDPrefix,
}: ComposerCardProps) {
  const theme = useTheme();
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
  const isBar = variant === 'bar';
  const iconSize = composerIconSize(variant);

  return (
    <ComposerShell
      variant={variant}
      theme={theme}
      input={
        <TextInput
          testID={testIDPrefix ? `${testIDPrefix}-input` : undefined}
          style={[composerInputStyle(variant), { color: theme.text }]}
          placeholder={placeholder}
          placeholderTextColor={theme.textSecondary}
          value={text}
          onChangeText={setText}
          multiline
          returnKeyType={isBar ? 'send' : 'default'}
          blurOnSubmit={isBar}
          onSubmitEditing={isBar ? handleSend : undefined}
          textAlignVertical="top"
        />
      }
      leading={
        onSettings ? (
          <Pressable onPress={onSettings} style={composerIconButtonStyle(variant)} hitSlop={6}>
            <Ionicons name="options-outline" size={iconSize} color={theme.textSecondary} />
          </Pressable>
        ) : null
      }
      // One merged button: mic while empty, send once there's text.
      action={
        hasText ? (
          <Pressable
            testID={testIDPrefix ? `${testIDPrefix}-send` : undefined}
            onPress={handleSend}
            style={[composerActionButtonStyle(variant), { backgroundColor: COMPOSER_ACTION_FILL }]}
          >
            <Ionicons
              name={isBar ? 'arrow-up' : 'arrow-forward'}
              size={iconSize}
              color={colors.white}
            />
          </Pressable>
        ) : (
          <Pressable
            onPress={handleVoice}
            style={[
              composerActionButtonStyle(variant),
              isListening
                ? { backgroundColor: colors.error[500] }
                : { backgroundColor: 'transparent' },
            ]}
            hitSlop={6}
            accessibilityLabel={isListening ? 'Diktat beenden' : 'Diktieren'}
          >
            <Ionicons
              name={isListening ? 'stop' : 'mic'}
              size={iconSize}
              color={isListening ? colors.white : theme.textSecondary}
            />
          </Pressable>
        )
      }
    />
  );
}
