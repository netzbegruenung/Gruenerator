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
import { colors, spacing } from '../../theme';
import {
  ComposerShell,
  composerActionButtonStyle,
  composerIconButtonStyle,
  composerIconSize,
  composerInputStyle,
  COMPOSER_ACTION_FILL,
  type ComposerVariant,
} from '../common/ComposerShell';

import { ComposerAttachmentUI } from './AttachmentUI';
import { ComposerActionSheet } from './ComposerActionSheet';
import { MentionSuggestions } from './MentionSuggestions';

import type { Theme } from '../../theme/colors';
import type { NativeSyntheticEvent, TextInputSelectionChangeEventData } from 'react-native';

interface MentionState {
  visible: boolean;
  query: string;
  mentionStart: number;
}

/**
 * The in-thread composer is snug rather than the landings' focal box, so the
 * message list keeps the space.
 */
const THREAD_CARD_MIN_HEIGHT = 92;

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
  /** See `ComposerVariant`. Defaults to the `card` look the thread has always used. */
  variant?: ComposerVariant;
}

/**
 * @deprecated Use `Composer` (components/common) with `binding="runtime"`.
 *
 * Kept as a working fallback while the unified `Composer` beds in: it is the
 * assistant-ui-bound composer as it stood before the merge, already rendering
 * through `ComposerShell`, so swapping a call site back is a one-line import
 * change. Delete once `Composer` has shipped without regressions.
 */
export function AssistantComposer({
  theme,
  bottomInset = 0,
  onOpenDocBrowser,
  inputRef: externalInputRef,
  accessory,
  transparent,
  variant = 'card',
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
  const iconSize = composerIconSize(variant);

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
    <ComposerPrimitive.Root>
      <ComposerShell
        variant={variant}
        theme={theme}
        minHeight={THREAD_CARD_MIN_HEIGHT}
        style={[
          styles.root,
          {
            backgroundColor: transparent ? 'transparent' : theme.background,
            paddingBottom: bottomInset,
          },
        ]}
        aboveBox={
          <>
            {mention?.visible && (
              <MentionSuggestions
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
          </>
        }
        input={
          <TextInput
            ref={inputRef}
            testID="chat-composer-input"
            style={[composerInputStyle(variant), { color: theme.text }]}
            placeholder="Nachricht eingeben..."
            placeholderTextColor={theme.textSecondary}
            multiline
            textAlignVertical="top"
            onChangeText={onChangeText}
            onSelectionChange={onSelectionChange}
          />
        }
        leading={
          <Pressable
            onPress={() => setActionSheetVisible(true)}
            style={composerIconButtonStyle(variant)}
            hitSlop={6}
            accessibilityLabel="Anhänge und Werkzeuge"
          >
            <Ionicons name="add-circle-outline" size={iconSize} color={theme.textSecondary} />
          </Pressable>
        }
        toolbarExtra={
          accessory ? (
            <Pressable
              onPress={accessory.onPress}
              style={composerIconButtonStyle(variant)}
              hitSlop={6}
              accessibilityLabel={accessory.accessibilityLabel}
            >
              <Ionicons
                name={accessory.icon}
                size={iconSize}
                color={accessory.active ? colors.primary[600] : theme.textSecondary}
              />
            </Pressable>
          ) : null
        }
        // One merged button: cancel while running, mic while empty, send once
        // there's text.
        action={
          isRunning ? (
            <ComposerPrimitive.Cancel style={composerActionButtonStyle(variant)}>
              <ActivityIndicator size="small" color={colors.error[500]} />
            </ComposerPrimitive.Cancel>
          ) : hasText ? (
            <ComposerPrimitive.Send
              testID="chat-composer-send"
              style={[
                composerActionButtonStyle(variant),
                { backgroundColor: COMPOSER_ACTION_FILL },
              ]}
              onPressIn={() => {
                inputRef.current?.clear();
                textRef.current = '';
                setHasText(false);
                setMention(null);
              }}
            >
              <Ionicons name="arrow-forward" size={iconSize} color={colors.white} />
            </ComposerPrimitive.Send>
          ) : (
            <Pressable
              onPress={handleDictate}
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
});
