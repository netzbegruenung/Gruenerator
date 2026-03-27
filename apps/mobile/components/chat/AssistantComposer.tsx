import { useAui, useAuiState, ComposerPrimitive } from '@assistant-ui/react-native';
import { Ionicons } from '@expo/vector-icons';
import { detectMention, computeMentionInsertion, type Mentionable } from '@gruenerator/chat';
import { useCallback, useRef, useState } from 'react';
import { View, TextInput, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native';

import {
  pickDocument,
  validatePickedDocument,
  pickedDocumentToAttachment,
} from '../../services/documentPicker';
import { colors, spacing, borderRadius } from '../../theme';

import { ComposerAttachmentUI } from './AttachmentUI';
import { ComposerActionSheet } from './ComposerActionSheet';
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
  inputRef?: React.RefObject<TextInput | null>;
}

export function AssistantComposer({
  theme,
  bottomInset = 0,
  onOpenDocBrowser,
  inputRef: externalInputRef,
}: Props) {
  const isRunning = useAuiState((s) => s.thread.isRunning);
  const aui = useAui();
  const internalInputRef = useRef<TextInput>(null);
  const inputRef = externalInputRef ?? internalInputRef;
  const textRef = useRef('');
  const selectionRef = useRef(0);
  const [mention, setMention] = useState<MentionState | null>(null);
  const [actionSheetVisible, setActionSheetVisible] = useState(false);

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

  /* eslint-disable react-hooks/preserve-manual-memoization -- inputRef is stable (ref identity) */
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
  /* eslint-enable react-hooks/preserve-manual-memoization */

  const handlePickFile = useCallback(async () => {
    const doc = await pickDocument();
    if (!doc) return;
    if (!validatePickedDocument(doc)) return;

    try {
      const attachment = await pickedDocumentToAttachment(doc);
      await aui.composer().addAttachment(attachment);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Fehler beim Anhängen';
      Alert.alert('Anhang fehlgeschlagen', msg);
    }
  }, [aui]);

  return (
    <ComposerPrimitive.Root
      style={[styles.root, { backgroundColor: theme.background, paddingBottom: bottomInset }]}
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
      <View style={styles.attachmentsRow}>
        <ComposerPrimitive.Attachments components={{ Attachment: ComposerAttachmentUI }} />
      </View>
      <View
        style={[styles.inputRow, { backgroundColor: theme.surface }, styles.inputRowWithActions]}
      >
        <Pressable
          onPress={() => setActionSheetVisible(true)}
          style={styles.actionButton}
          hitSlop={8}
        >
          <Ionicons name="add-circle-outline" size={22} color={theme.textSecondary} />
        </Pressable>
        <TextInput
          ref={inputRef}
          style={[styles.input, { color: theme.text }]}
          placeholder="Nachricht eingeben..."
          placeholderTextColor={theme.textSecondary}
          multiline
          onChangeText={onChangeText}
          onSelectionChange={onSelectionChange}
        />
        {isRunning ? (
          <ComposerPrimitive.Cancel style={styles.cancelButton}>
            <ActivityIndicator size="small" color={colors.error[500]} />
          </ComposerPrimitive.Cancel>
        ) : (
          <ComposerPrimitive.Send
            style={styles.sendButton}
            onPressIn={() => {
              inputRef.current?.clear();
              textRef.current = '';
              setMention(null);
            }}
          >
            <Ionicons name="send" size={16} color={colors.white} />
          </ComposerPrimitive.Send>
        )}
      </View>
      <ComposerActionSheet
        visible={actionSheetVisible}
        onClose={() => setActionSheetVisible(false)}
        onPickFile={handlePickFile}
        onOpenDocBrowser={onOpenDocBrowser}
      />
    </ComposerPrimitive.Root>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.xsmall,
  },
  attachmentsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.xsmall,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderRadius: borderRadius.pill,
    paddingLeft: spacing.medium,
    paddingRight: spacing.xsmall,
    paddingVertical: 6,
    minHeight: 42,
  },
  inputRowWithActions: {
    paddingLeft: spacing.xsmall,
  },
  actionButton: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 28,
    height: 34,
  },
  input: {
    flex: 1,
    fontSize: 15,
    maxHeight: 120,
    paddingVertical: 5,
  },
  sendButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primary[600],
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: spacing.xsmall,
  },
  cancelButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: spacing.xsmall,
  },
});
