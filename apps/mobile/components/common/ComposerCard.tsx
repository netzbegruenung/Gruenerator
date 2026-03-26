import { Ionicons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import { View, TextInput, Pressable, StyleSheet, useColorScheme } from 'react-native';

import { useSpeechToText, appendTranscript } from '../../hooks/useSpeechToText';
import { colors, spacing, borderRadius, lightTheme, darkTheme } from '../../theme';

interface ComposerCardProps {
  placeholder?: string;
  onSend: (text: string) => void;
  onSettings?: () => void;
}

export function ComposerCard({ placeholder = 'Nachricht eingeben...', onSend, onSettings }: ComposerCardProps) {
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
    toggleSpeech((transcript) => {
      setText((prev) => appendTranscript(prev, transcript));
    });
  }, [toggleSpeech]);

  const hasText = text.trim().length > 0;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.surface,
          borderColor: theme.border,
          shadowColor: colors.black,
        },
      ]}
    >
      <TextInput
        style={[styles.input, { color: theme.text }]}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        value={text}
        onChangeText={setText}
        multiline
        returnKeyType="send"
        blurOnSubmit
        onSubmitEditing={handleSend}
        textAlignVertical="top"
      />
      <View style={styles.actions}>
        {onSettings && (
          <Pressable onPress={onSettings} style={styles.settingsButton}>
            <Ionicons name="options-outline" size={18} color={theme.textSecondary} />
          </Pressable>
        )}
        {hasText ? (
          <Pressable onPress={handleSend} style={styles.actionButton}>
            <Ionicons name="arrow-forward" size={18} color={colors.white} />
          </Pressable>
        ) : (
          <Pressable
            onPress={handleVoice}
            style={[
              styles.actionButton,
              isListening
                ? { backgroundColor: colors.error[500] }
                : { backgroundColor: 'transparent' },
            ]}
          >
            <Ionicons
              name={isListening ? 'stop' : 'mic'}
              size={18}
              color={isListening ? colors.white : theme.textSecondary}
            />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.xxsmall,
    marginTop: spacing.xxsmall,
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
});
