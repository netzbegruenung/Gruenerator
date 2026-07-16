import { useAui, useAuiState, ComposerPrimitive } from '@assistant-ui/react-native';
import { detectMention, computeMentionInsertion, type Mentionable } from '@gruenerator/chat';
import { Ionicons, type IoniconsIconName } from '@react-native-vector-icons/ionicons';
import { useCallback, useRef, useState } from 'react';
import { View, TextInput, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native';

import { useSpeechToText, appendTranscript } from '../../hooks/useSpeechToText';
import {
  pickDocument,
  pickImageFromLibrary,
  takePhoto,
  validatePickedDocument,
  pickedDocumentToAttachment,
  type PickedDocument,
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

/** Optional toolbar button a host can surface in the composer (e.g. a notebook
 *  filter/mode toggle), so its controls live in the composer instead of a chip bar. */
export interface ComposerAccessory {
  icon: IoniconsIconName;
  onPress: () => void;
  active?: boolean;
  accessibilityLabel?: string;
}

interface Props {
  theme: Theme;
  bottomInset?: number;
  onOpenDocBrowser?: () => void;
  inputRef?: React.RefObject<TextInput | null>;
  accessory?: ComposerAccessory;
  /** Transparent outer background so a screen-level gradient shows through. */
  transparent?: boolean;
}

export function AssistantComposer({
  theme,
  bottomInset = 0,
  onOpenDocBrowser,
  inputRef: externalInputRef,
  accessory,
  transparent,
}: Props) {
  const isRunning = useAuiState((s) => s.thread.isRunning);
  const aui = useAui();
  const internalInputRef = useRef<TextInput>(null);
  const inputRef = externalInputRef ?? internalInputRef;
  const textRef = useRef('');
  const selectionRef = useRef(0);
  const [mention, setMention] = useState<MentionState | null>(null);
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  // Mic/send merge: an empty composer shows the mic; the first character swaps it
  // for the send button.
  const [hasText, setHasText] = useState(false);
  const { isListening, toggle: toggleSpeech } = useSpeechToText();

  // Dictation (mirrors web's DictateButton): final transcripts are appended
  // to the draft and pushed into both the native input and the composer state.
  const handleDictate = useCallback(() => {
    void toggleSpeech((transcript) => {
      const newText = appendTranscript(textRef.current, transcript);
      textRef.current = newText;
      setHasText(newText.trim().length > 0);
      aui.composer().setText(newText);
      inputRef.current?.setNativeProps({ text: newText });
      selectionRef.current = newText.length;
    });
  }, [toggleSpeech, aui, inputRef]);

  const onChangeText = useCallback(
    (value: string) => {
      textRef.current = value;
      setHasText(value.trim().length > 0);
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
    [aui, mention, inputRef]
  );

  const attachPicked = useCallback(
    async (pending: Promise<PickedDocument | null>) => {
      // `await pending` is inside the try so a native picker/manipulator
      // rejection (camera unavailable, permission API throwing, HEIC→JPEG
      // failure) surfaces as an Alert instead of an unhandled promise rejection.
      try {
        const doc = await pending;
        if (!doc) return;
        if (!validatePickedDocument(doc)) return;
        const attachment = await pickedDocumentToAttachment(doc);
        await aui.composer().addAttachment(attachment);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Fehler beim Anhängen';
        Alert.alert('Anhang fehlgeschlagen', msg);
      }
    },
    [aui]
  );

  const handlePickFile = useCallback(() => attachPicked(pickDocument()), [attachPicked]);
  const handlePickImage = useCallback(() => attachPicked(pickImageFromLibrary()), [attachPicked]);
  const handleTakePhoto = useCallback(() => attachPicked(takePhoto()), [attachPicked]);

  return (
    <ComposerPrimitive.Root
      style={[
        styles.root,
        {
          backgroundColor: transparent ? 'transparent' : theme.background,
          paddingBottom: bottomInset,
        },
      ]}
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
      {/* Card-style composer (input on top, action toolbar below) — matches the
          start screen ComposerCard and the manuelle-Recherche composer. */}
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <TextInput
          ref={inputRef}
          style={[styles.input, { color: theme.text }]}
          placeholder="Nachricht eingeben..."
          placeholderTextColor={theme.textSecondary}
          multiline
          textAlignVertical="top"
          onChangeText={onChangeText}
          onSelectionChange={onSelectionChange}
        />
        <View style={styles.toolbar}>
          <Pressable
            onPress={() => setActionSheetVisible(true)}
            style={styles.iconButton}
            hitSlop={8}
          >
            <Ionicons name="add-circle-outline" size={24} color={theme.textSecondary} />
          </Pressable>
          {accessory && (
            <Pressable
              onPress={accessory.onPress}
              style={styles.iconButton}
              hitSlop={8}
              accessibilityLabel={accessory.accessibilityLabel}
            >
              <Ionicons
                name={accessory.icon}
                size={22}
                color={accessory.active ? colors.primary[600] : theme.textSecondary}
              />
            </Pressable>
          )}
          <View style={styles.spacer} />
          {/* One merged button: mic while empty, send once there's text. */}
          {isRunning ? (
            <ComposerPrimitive.Cancel style={styles.cancelButton}>
              <ActivityIndicator size="small" color={colors.error[500]} />
            </ComposerPrimitive.Cancel>
          ) : hasText ? (
            <ComposerPrimitive.Send
              style={styles.sendButton}
              onPressIn={() => {
                inputRef.current?.clear();
                textRef.current = '';
                setHasText(false);
                setMention(null);
              }}
            >
              <Ionicons name="arrow-forward" size={20} color={colors.white} />
            </ComposerPrimitive.Send>
          ) : (
            <Pressable
              onPress={handleDictate}
              style={[
                styles.sendButton,
                isListening
                  ? { backgroundColor: colors.error[500] }
                  : { backgroundColor: 'transparent' },
              ]}
              hitSlop={8}
              accessibilityLabel={isListening ? 'Diktat beenden' : 'Diktieren'}
            >
              <Ionicons
                name={isListening ? 'stop' : 'mic'}
                size={20}
                color={isListening ? colors.white : theme.textSecondary}
              />
            </Pressable>
          )}
        </View>
      </View>
      <ComposerActionSheet
        visible={actionSheetVisible}
        onClose={() => setActionSheetVisible(false)}
        onPickFile={handlePickFile}
        onPickImage={handlePickImage}
        onTakePhoto={handleTakePhoto}
        onOpenDocBrowser={onOpenDocBrowser}
      />
    </ComposerPrimitive.Root>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: spacing.medium,
    paddingTop: spacing.xsmall,
  },
  attachmentsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.xsmall,
  },
  card: {
    borderRadius: borderRadius.xlarge,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.medium,
    paddingTop: spacing.small,
    paddingBottom: spacing.xsmall,
    minHeight: 92,
  },
  input: {
    fontSize: 16,
    lineHeight: 22,
    minHeight: 36,
    maxHeight: 120,
    paddingVertical: 0,
    textAlignVertical: 'top',
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxsmall,
    marginTop: spacing.xsmall,
  },
  spacer: {
    flex: 1,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primary[600],
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
