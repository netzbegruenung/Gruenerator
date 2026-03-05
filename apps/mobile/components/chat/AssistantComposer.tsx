import {
  ComposerRoot,
  ComposerSend,
  ComposerCancel,
  useThreadIsRunning,
  useAui,
} from '@assistant-ui/react-native';
import { Ionicons } from '@expo/vector-icons';
import { detectMention, computeMentionInsertion, type Mentionable } from '@gruenerator/chat';
import { useCallback, useMemo, useRef, useState } from 'react';
import { View, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';

import { colors, spacing, borderRadius } from '../../theme';

import { MentionSuggestions } from './MentionSuggestions';

import type { Theme } from '../../theme/colors';
import type { NativeSyntheticEvent, TextInputSelectionChangeEventData } from 'react-native';

interface MentionState {
  visible: boolean;
  mode: 'functions' | 'skills';
  query: string;
  mentionStart: number;
}

interface Props {
  theme: Theme;
  bottomInset?: number;
  onOpenDocBrowser?: () => void;
}

const stickyOffset = { closed: 0, opened: 0 };

export function AssistantComposer({ theme, bottomInset = 0, onOpenDocBrowser }: Props) {
  const isRunning = useThreadIsRunning();
  const aui = useAui();
  const inputRef = useRef<TextInput>(null);
  const textRef = useRef('');
  const selectionRef = useRef(0);
  const [mention, setMention] = useState<MentionState | null>(null);

  const onChangeText = useCallback(
    (value: string) => {
      textRef.current = value;
      aui.composer().setText(value);

      const cursorPos = selectionRef.current <= value.length ? selectionRef.current : value.length;
      const detected = detectMention(value, cursorPos);
      if (detected) {
        setMention({
          visible: true,
          mode: detected.mode,
          query: detected.query,
          mentionStart: detected.mentionStart,
        });
      } else {
        setMention(null);
      }
    },
    [aui]
  );

  const onSelectionChange = useCallback(
    (e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
      selectionRef.current = e.nativeEvent.selection.end;
    },
    []
  );

  const handleMentionSelect = useCallback(
    (mentionable: Mentionable) => {
      if (!mention) return;

      const { newText, cursorPosition } = computeMentionInsertion(
        textRef.current,
        mentionable,
        mention.mentionStart,
        selectionRef.current
      );

      textRef.current = newText;
      aui.composer().setText(newText);
      inputRef.current?.setNativeProps({ text: newText });
      selectionRef.current = cursorPosition;
      setMention(null);
    },
    [aui, mention]
  );

  const bottomPadding = useMemo(() => ({ paddingBottom: bottomInset }), [bottomInset]);

  return (
    <KeyboardStickyView offset={stickyOffset}>
      <ComposerRoot
        style={[styles.root, { backgroundColor: theme.background, borderTopColor: theme.border }]}
      >
        {mention?.visible && (
          <MentionSuggestions
            mode={mention.mode}
            query={mention.query}
            visible={mention.visible}
            theme={theme}
            onSelect={handleMentionSelect}
            onDismiss={() => setMention(null)}
          />
        )}
        <View style={[styles.inputRow, { backgroundColor: theme.surface }]}>
          {onOpenDocBrowser && (
            <Pressable onPress={onOpenDocBrowser} style={styles.attachButton} hitSlop={8}>
              <Ionicons name="document-attach-outline" size={20} color={theme.textSecondary} />
            </Pressable>
          )}
          <TextInput
            ref={inputRef}
            style={[styles.input, { color: theme.text }]}
            placeholder="Nachricht — @bundestag, /presse..."
            placeholderTextColor={theme.textSecondary}
            multiline
            onChangeText={onChangeText}
            onSelectionChange={onSelectionChange}
          />
          {isRunning ? (
            <ComposerCancel style={styles.cancelButton}>
              <ActivityIndicator size="small" color={colors.error[500]} />
            </ComposerCancel>
          ) : (
            <ComposerSend
              style={styles.sendButton}
              onPressIn={() => {
                inputRef.current?.clear();
                textRef.current = '';
                setMention(null);
              }}
            >
              <Ionicons name="send" size={18} color={colors.white} />
            </ComposerSend>
          )}
        </View>
      </ComposerRoot>
      <View style={bottomPadding} />
    </KeyboardStickyView>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderRadius: borderRadius.large,
    paddingLeft: spacing.medium,
    paddingRight: spacing.xsmall,
    paddingVertical: spacing.xsmall,
    minHeight: 44,
  },
  attachButton: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 32,
    height: 36,
  },
  input: {
    flex: 1,
    fontSize: 16,
    maxHeight: 120,
    paddingVertical: spacing.xsmall,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary[600],
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: spacing.xsmall,
  },
  cancelButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: spacing.xsmall,
  },
});
