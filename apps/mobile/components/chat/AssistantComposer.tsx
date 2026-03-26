import {
  useAui,
  useAuiState,
  ComposerPrimitive,
  AttachmentPrimitive,
} from '@assistant-ui/react-native';
import { Ionicons } from '@expo/vector-icons';
import { detectMention, computeMentionInsertion, type Mentionable } from '@gruenerator/chat';
import { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  Modal,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';

import {
  pickDocument,
  validatePickedDocument,
  pickedDocumentToAttachment,
} from '../../services/documentPicker';
import { colors, spacing, borderRadius } from '../../theme';

import { ComposerAttachmentUI } from './AttachmentUI';
import { ChatSettingsSheet } from './ChatSettingsSheet';
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
  showSettings?: boolean;
}

export function AssistantComposer({
  theme,
  bottomInset = 0,
  onOpenDocBrowser,
  inputRef: externalInputRef,
  showSettings = true,
}: Props) {
  const isRunning = useAuiState((s) => s.thread.isRunning);
  const aui = useAui();
  const internalInputRef = useRef<TextInput>(null);
  const inputRef = externalInputRef ?? internalInputRef;
  const textRef = useRef('');
  const selectionRef = useRef(0);
  const [mention, setMention] = useState<MentionState | null>(null);
  const [plusMenuVisible, setPlusMenuVisible] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);

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
    console.log('[Attachment] Step 1: picking document...');
    const doc = await pickDocument();
    if (!doc) {
      console.log('[Attachment] Cancelled');
      return;
    }
    console.log('[Attachment] Step 2: picked', doc.name, doc.mimeType, doc.size);
    if (!validatePickedDocument(doc)) {
      console.log('[Attachment] Validation failed');
      return;
    }

    try {
      console.log('[Attachment] Step 3: converting to CreateAttachment...');
      const attachment = await pickedDocumentToAttachment(doc);
      console.log('[Attachment] Step 4: converted', {
        name: attachment.name,
        type: attachment.type,
        contentLength: attachment.content?.length,
      });

      console.log('[Attachment] Step 5: calling addAttachment...');
      await aui.composer().addAttachment(attachment);
      console.log('[Attachment] Step 6: done.');
    } catch (err) {
      console.error('[Attachment] ERROR:', err);
      const msg = err instanceof Error ? err.message : 'Fehler beim Anhängen';
      Alert.alert('Anhang fehlgeschlagen', msg);
    }
  }, [aui]);

  const handlePlusMenuAction = useCallback(
    (action: 'file' | 'doc') => {
      setPlusMenuVisible(false);
      if (action === 'file') handlePickFile();
      else onOpenDocBrowser?.();
    },
    [handlePickFile, onOpenDocBrowser]
  );

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
        <Pressable onPress={() => setPlusMenuVisible(true)} style={styles.actionButton} hitSlop={8}>
          <Ionicons name="add-circle-outline" size={22} color={theme.textSecondary} />
        </Pressable>
        {showSettings && (
          <Pressable onPress={() => setSettingsVisible(true)} style={styles.actionButton} hitSlop={8}>
            <Ionicons name="options-outline" size={20} color={theme.textSecondary} />
          </Pressable>
        )}
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
      <Modal
        visible={plusMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPlusMenuVisible(false)}
      >
        <Pressable style={styles.sheetOverlay} onPress={() => setPlusMenuVisible(false)}>
          <View style={[styles.sheetContainer, { backgroundColor: theme.surface }]}>
            <Pressable style={styles.sheetOption} onPress={() => handlePlusMenuAction('file')}>
              <Ionicons name="document-outline" size={22} color={theme.text} />
              <Text style={[styles.sheetOptionText, { color: theme.text }]}>Datei anhängen</Text>
            </Pressable>
            {onOpenDocBrowser && (
              <Pressable style={styles.sheetOption} onPress={() => handlePlusMenuAction('doc')}>
                <Ionicons name="search-outline" size={22} color={theme.text} />
                <Text style={[styles.sheetOptionText, { color: theme.text }]}>Dokument suchen</Text>
              </Pressable>
            )}
            <Pressable
              style={[styles.sheetOption, styles.sheetCancel]}
              onPress={() => setPlusMenuVisible(false)}
            >
              <Text style={[styles.sheetOptionText, { color: theme.textSecondary }]}>
                Abbrechen
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
      {showSettings && (
        <ChatSettingsSheet
          visible={settingsVisible}
          onDismiss={() => setSettingsVisible(false)}
        />
      )}
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
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheetContainer: {
    borderTopLeftRadius: borderRadius.large,
    borderTopRightRadius: borderRadius.large,
    paddingTop: spacing.small,
    paddingBottom: spacing.xlarge,
    paddingHorizontal: spacing.medium,
  },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: spacing.small,
    gap: spacing.small,
  },
  sheetCancel: {
    justifyContent: 'center',
    marginTop: spacing.xsmall,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(128,128,128,0.3)',
  },
  sheetOptionText: {
    fontSize: 16,
  },
});
