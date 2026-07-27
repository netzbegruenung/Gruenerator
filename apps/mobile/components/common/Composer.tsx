import { useAui, useAuiState, ComposerPrimitive } from '@assistant-ui/react-native';
import { detectMention, computeMentionInsertion, type Mentionable } from '@gruenerator/chat';
import { Ionicons, type IoniconsIconName } from '@react-native-vector-icons/ionicons';
import { useCallback, useRef, useState } from 'react';
import {
  View,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Keyboard,
} from 'react-native';

import { useMentionablesSync } from '../../hooks/useMentionablesSync';
import { useSpeechToText, appendTranscript } from '../../hooks/useSpeechToText';
import { useTheme } from '../../hooks/useTheme';
import {
  pickDocument,
  pickImageFromLibrary,
  takePhoto,
  validatePickedDocument,
  pickedDocumentToAttachment,
  type PickedDocument,
} from '../../services/documentPicker';
import { colors, spacing } from '../../theme';
import { SCREEN_EDGE } from '../../theme/layout';
import { ComposerAttachmentUI } from '../chat/AttachmentUI';
import { ComposerActionSheet } from '../chat/ComposerActionSheet';
import { MentionSuggestions } from '../chat/MentionSuggestions';

import {
  ComposerShell,
  composerActionButtonStyle,
  composerIconButtonStyle,
  composerIconSize,
  composerInputStyle,
  COMPOSER_ACTION_FILL,
  type ComposerVariant,
} from './ComposerShell';

import type { Theme } from '../../theme/colors';
import type {
  NativeSyntheticEvent,
  TextInputSelectionChangeEventData,
  StyleProp,
  ViewStyle,
} from 'react-native';

/**
 * The app's composer. Every input that sends a message or a prompt goes through
 * this component — there is no second implementation to keep in sync.
 *
 * Two things vary, and only two:
 *
 * - **Look** — `variant`, handled entirely by `ComposerShell` (`card` | `bar`).
 * - **Where the text lives** — `binding`. `local` (default) keeps the draft in
 *   this component and hands the finished text to `onSubmit`. `runtime` writes
 *   through to the surrounding assistant-ui thread, which unlocks attachments
 *   and the cancel-while-running state.
 *
 * `binding` exists because the chat runtime is a *single global* one, mounted
 * once in `AppDrawer`. A composer on the Start/Arbeiten/Recherche tab does not
 * send into the chat thread — it routes, or generates a document — so writing
 * its draft into `aui.composer()` would leak that text into the user's actual
 * chat draft. Everything else — mentions, dictation, the mic/send merge, the
 * chrome — is shared by both bindings.
 */

/** Optional toolbar button a host can surface in the composer (e.g. a notebook
 *  filter/mode toggle), so its controls live in the composer instead of a chip bar. */
export interface ComposerAccessory {
  icon: IoniconsIconName;
  onPress: () => void;
  active?: boolean;
  accessibilityLabel?: string;
}

interface ComposerProps {
  /** `local` (default) drafts here and calls `onSubmit`. `runtime` writes through
   *  to the surrounding assistant-ui thread. */
  binding?: 'local' | 'runtime';
  /** Receives the finished text. Required for `local`; under `runtime` it
   *  overrides sending, so the surface can route the text somewhere else. */
  onSubmit?: (text: string) => void;
  variant?: ComposerVariant;
  placeholder?: string;
  /** Overrides `useTheme()` for surfaces that thread their own theme. */
  theme?: Theme;
  /** Wrapper style — padding, backdrop, safe-area inset. See `ComposerShell`. */
  style?: StyleProp<ViewStyle>;
  /** `card` only. Height of the box at rest. */
  minHeight?: number;
  /** `@`-mentions. On by default; off for surfaces where a mention is meaningless. */
  showMentions?: boolean;
  /** Left toolbar button opening the attach/tools sheet. Requires `runtime`
   *  (file pickers write into the thread's attachments). */
  showActionSheet?: boolean;
  /** Left toolbar button for a caller-owned settings sheet. Ignored when
   *  `showActionSheet` is on — the two share the same slot. */
  onSettings?: () => void;
  /** Second left-aligned button, beside the plus/settings one. */
  accessory?: ComposerAccessory;
  /** Adds the "Dokument" entry to the action sheet. */
  onOpenDocBrowser?: () => void;
  inputRef?: React.RefObject<TextInput | null>;
  /** Enables `<prefix>-input` / `<prefix>-send` testIDs for the Maestro flows. */
  testIDPrefix?: string;
  autoFocus?: boolean;
  /**
   * Called when the input loses focus while empty — for composers revealed on
   * demand (the Wissen tab's FAB) that fold away again when the user dismisses
   * the keyboard without typing.
   */
  onDismissEmpty?: () => void;
  /**
   * Renders a close button in the leading slot (where the settings button would
   * sit) — a way back that does not depend on the field being empty. Ignored
   * when `showActionSheet` or `onSettings` claim that slot.
   */
  onClose?: () => void;
}

interface MentionState {
  visible: boolean;
  query: string;
  mentionStart: number;
}

/**
 * Everything about the composer that does not depend on where the text lives:
 * draft tracking, `@`-mention detection and insertion, dictation, and the
 * has-text flag driving the mic/send merge. Both bindings drive their store
 * through the `setText` they pass in.
 */
function useComposerInput({
  setText,
  inputRef,
}: {
  setText: (value: string) => void;
  inputRef: React.RefObject<TextInput | null>;
}) {
  const textRef = useRef('');
  const selectionRef = useRef(0);
  const [hasText, setHasText] = useState(false);
  const [mention, setMention] = useState<MentionState | null>(null);
  const { isListening, toggle: toggleSpeech } = useSpeechToText();

  /** Push text the user did not type (dictation, mention insertion) into both
   *  the native input and the binding's store. */
  const pushText = useCallback(
    (value: string, cursor: number) => {
      textRef.current = value;
      setHasText(value.trim().length > 0);
      setText(value);
      inputRef.current?.setNativeProps({ text: value });
      selectionRef.current = cursor;
    },
    [setText, inputRef]
  );

  const onChangeText = useCallback(
    (value: string) => {
      textRef.current = value;
      setHasText(value.trim().length > 0);
      setText(value);

      const cursorPos = selectionRef.current <= value.length ? selectionRef.current : value.length;
      const detected = detectMention(value, cursorPos);
      setMention(
        detected
          ? { visible: true, query: detected.query, mentionStart: detected.mentionStart }
          : null
      );
    },
    [setText]
  );

  const onSelectionChange = useCallback(
    (e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
      selectionRef.current = e.nativeEvent.selection.end;
    },
    []
  );

  const onMentionSelect = useCallback(
    (mentionable: Mentionable) => {
      if (!mention) return;
      const { newText, cursorPosition } = computeMentionInsertion(
        textRef.current,
        mentionable,
        mention.mentionStart,
        selectionRef.current
      );
      pushText(newText, cursorPosition);
      setMention(null);
    },
    [mention, pushText]
  );

  // Dictation (mirrors web's DictateButton): final transcripts are appended to
  // the draft rather than replacing it.
  const onDictate = useCallback(() => {
    void toggleSpeech((transcript) => {
      const newText = appendTranscript(textRef.current, transcript);
      pushText(newText, newText.length);
    });
  }, [toggleSpeech, pushText]);

  /** Reset after the text has been handed off. */
  const reset = useCallback(() => {
    inputRef.current?.clear();
    textRef.current = '';
    setHasText(false);
    setMention(null);
    selectionRef.current = 0;
  }, [inputRef]);

  return {
    textRef,
    hasText,
    mention,
    dismissMention: useCallback(() => setMention(null), []),
    onChangeText,
    onSelectionChange,
    onMentionSelect,
    isListening,
    onDictate,
    reset,
  };
}

type ComposerInput = ReturnType<typeof useComposerInput>;

/**
 * The rendered composer. Receives the binding-specific pieces as nodes — the
 * attachments strip and the send/cancel buttons — and owns everything else, so
 * the two bindings cannot drift.
 */
function ComposerBody({
  props,
  input,
  inputRef,
  onSubmitEditing,
  attachments,
  sendButton,
  cancelButton,
}: {
  props: ComposerProps;
  input: ComposerInput;
  inputRef: React.RefObject<TextInput | null>;
  /** Wired to the keyboard's send key, which the `bar` variant surfaces. */
  onSubmitEditing: () => void;
  attachments?: React.ReactNode;
  sendButton: React.ReactNode;
  /** Runtime binding only — a local composer has no request to cancel. */
  cancelButton?: React.ReactNode;
}) {
  const resolvedTheme = useTheme();
  const theme = props.theme ?? resolvedTheme;
  const variant = props.variant ?? 'card';
  const isBar = variant === 'bar';
  const iconSize = composerIconSize(variant);
  const showMentions = props.showMentions ?? true;
  const [actionSheetVisible, setActionSheetVisible] = useState(false);

  // Mounting the composer warms the dynamic mentionable lists, as on web.
  useMentionablesSync();

  const leading = props.showActionSheet ? (
    <Pressable
      onPress={() => setActionSheetVisible(true)}
      style={composerIconButtonStyle(variant)}
      hitSlop={6}
      accessibilityLabel="Anhänge und Werkzeuge"
    >
      <Ionicons name="add-circle-outline" size={iconSize} color={theme.textSecondary} />
    </Pressable>
  ) : props.onSettings ? (
    <Pressable
      onPress={props.onSettings}
      style={composerIconButtonStyle(variant)}
      hitSlop={6}
      accessibilityLabel="Einstellungen"
    >
      <Ionicons name="options-outline" size={iconSize} color={theme.textSecondary} />
    </Pressable>
  ) : props.onClose ? (
    <Pressable
      onPress={() => {
        Keyboard.dismiss();
        props.onClose?.();
      }}
      style={composerIconButtonStyle(variant)}
      hitSlop={6}
      accessibilityLabel="Eingabe schließen"
    >
      <Ionicons name="close" size={iconSize} color={theme.textSecondary} />
    </Pressable>
  ) : null;

  return (
    <>
      <ComposerShell
        variant={variant}
        theme={theme}
        minHeight={props.minHeight}
        style={props.style}
        aboveBox={
          <>
            {showMentions && input.mention?.visible && (
              <MentionSuggestions
                query={input.mention.query}
                visible={input.mention.visible}
                theme={theme}
                onSelect={input.onMentionSelect}
                onDismiss={input.dismissMention}
              />
            )}
            {attachments}
          </>
        }
        input={
          <TextInput
            ref={inputRef}
            testID={props.testIDPrefix ? `${props.testIDPrefix}-input` : undefined}
            style={[composerInputStyle(variant), { color: theme.text }]}
            placeholder={props.placeholder ?? 'Nachricht eingeben...'}
            placeholderTextColor={theme.textSecondary}
            multiline
            textAlignVertical="top"
            returnKeyType={isBar ? 'send' : 'default'}
            blurOnSubmit={isBar}
            onSubmitEditing={isBar ? onSubmitEditing : undefined}
            onChangeText={input.onChangeText}
            onSelectionChange={input.onSelectionChange}
            autoFocus={props.autoFocus}
            onBlur={
              props.onDismissEmpty
                ? () => {
                    if (!input.hasText) props.onDismissEmpty?.();
                  }
                : undefined
            }
          />
        }
        leading={leading}
        toolbarExtra={
          props.accessory ? (
            <Pressable
              onPress={props.accessory.onPress}
              style={composerIconButtonStyle(variant)}
              hitSlop={6}
              accessibilityLabel={props.accessory.accessibilityLabel}
            >
              <Ionicons
                name={props.accessory.icon}
                size={iconSize}
                color={props.accessory.active ? colors.primary[600] : theme.textSecondary}
              />
            </Pressable>
          ) : null
        }
        // One merged button: cancel while a request runs, mic while empty, send
        // once there is text.
        action={
          cancelButton ??
          (input.hasText ? (
            sendButton
          ) : (
            <Pressable
              onPress={input.onDictate}
              style={[
                composerActionButtonStyle(variant),
                input.isListening
                  ? { backgroundColor: colors.error[500] }
                  : { backgroundColor: 'transparent' },
              ]}
              hitSlop={6}
              accessibilityLabel={input.isListening ? 'Diktat beenden' : 'Diktieren'}
            >
              <Ionicons
                name={input.isListening ? 'stop' : 'mic'}
                size={iconSize}
                color={input.isListening ? colors.white : theme.textSecondary}
              />
            </Pressable>
          ))
        }
      />
      {props.showActionSheet && (
        <ActionSheetHost
          visible={actionSheetVisible}
          onClose={() => setActionSheetVisible(false)}
          onOpenDocBrowser={props.onOpenDocBrowser}
        />
      )}
    </>
  );
}

/** Attaching writes into the thread's composer state, so this only mounts under
 *  the runtime binding. */
function ActionSheetHost({
  visible,
  onClose,
  onOpenDocBrowser,
}: {
  visible: boolean;
  onClose: () => void;
  onOpenDocBrowser?: () => void;
}) {
  const aui = useAui();

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

  return (
    <ComposerActionSheet
      visible={visible}
      onClose={onClose}
      onPickFile={() => attachPicked(pickDocument())}
      onPickImage={() => attachPicked(pickImageFromLibrary())}
      onTakePhoto={() => attachPicked(takePhoto())}
      onOpenDocBrowser={onOpenDocBrowser}
    />
  );
}

/** Draft lives here; the finished text goes to `onSubmit`. No runtime touched. */
function LocalComposer(props: ComposerProps) {
  const internalInputRef = useRef<TextInput>(null);
  const inputRef = props.inputRef ?? internalInputRef;

  // The hook's own `textRef` already holds the current draft, so a local
  // composer has no store to write through to.
  const noop = useCallback(() => {}, []);
  const input = useComposerInput({ setText: noop, inputRef });
  const variant = props.variant ?? 'card';
  const onSubmit = props.onSubmit;

  const handleSubmit = useCallback(() => {
    const trimmed = input.textRef.current.trim();
    if (!trimmed) return;
    onSubmit?.(trimmed);
    input.reset();
  }, [onSubmit, input]);

  return (
    <ComposerBody
      props={props}
      input={input}
      inputRef={inputRef}
      onSubmitEditing={handleSubmit}
      sendButton={
        <Pressable
          testID={props.testIDPrefix ? `${props.testIDPrefix}-send` : undefined}
          onPress={handleSubmit}
          style={[composerActionButtonStyle(variant), { backgroundColor: COMPOSER_ACTION_FILL }]}
          accessibilityLabel="Senden"
        >
          <Ionicons
            name={variant === 'bar' ? 'arrow-up' : 'arrow-forward'}
            size={composerIconSize(variant)}
            color={colors.white}
          />
        </Pressable>
      }
    />
  );
}

/** Draft is the surrounding thread's composer state — unlocks attachments and
 *  the cancel-while-running button. */
function RuntimeComposer(props: ComposerProps) {
  const aui = useAui();
  const isRunning = useAuiState((s) => s.thread.isRunning);
  const internalInputRef = useRef<TextInput>(null);
  const inputRef = props.inputRef ?? internalInputRef;

  const setText = useCallback((value: string) => aui.composer().setText(value), [aui]);
  const input = useComposerInput({ setText, inputRef });
  const variant = props.variant ?? 'card';
  const onSubmit = props.onSubmit;

  // A surface can intercept the text instead of sending it into this thread
  // (the chat landing hands off to a fresh conversation screen).
  // Clear before handing off, not after: a surface is free to write a fresh
  // draft and send it (the chat landing does exactly that), and a trailing
  // reset would wipe what it just staged.
  const handleIntercept = useCallback(() => {
    const trimmed = input.textRef.current.trim();
    if (!trimmed) return;
    aui.composer().setText('');
    input.reset();
    onSubmit?.(trimmed);
  }, [onSubmit, aui, input]);

  return (
    <ComposerBody
      props={props}
      input={input}
      inputRef={inputRef}
      onSubmitEditing={onSubmit ? handleIntercept : () => aui.composer().send()}
      attachments={
        <View style={styles.attachmentsRow}>
          <ComposerPrimitive.Attachments components={{ Attachment: ComposerAttachmentUI }} />
        </View>
      }
      cancelButton={
        isRunning ? (
          <ComposerPrimitive.Cancel style={composerActionButtonStyle(variant)}>
            <ActivityIndicator size="small" color={colors.error[500]} />
          </ComposerPrimitive.Cancel>
        ) : undefined
      }
      sendButton={
        onSubmit ? (
          <Pressable
            testID={props.testIDPrefix ? `${props.testIDPrefix}-send` : undefined}
            onPress={handleIntercept}
            style={[composerActionButtonStyle(variant), { backgroundColor: COMPOSER_ACTION_FILL }]}
            accessibilityLabel="Senden"
          >
            <Ionicons
              name={variant === 'bar' ? 'arrow-up' : 'arrow-forward'}
              size={composerIconSize(variant)}
              color={colors.white}
            />
          </Pressable>
        ) : (
          <ComposerPrimitive.Send
            testID={props.testIDPrefix ? `${props.testIDPrefix}-send` : undefined}
            style={[composerActionButtonStyle(variant), { backgroundColor: COMPOSER_ACTION_FILL }]}
            // `onPressIn`, not `onPress`: the primitive reads the composer state
            // on press, so the reset has to land before that read to clear the
            // native input without racing the send.
            onPressIn={input.reset}
          >
            <Ionicons
              name={variant === 'bar' ? 'arrow-up' : 'arrow-forward'}
              size={composerIconSize(variant)}
              color={colors.white}
            />
          </ComposerPrimitive.Send>
        )
      }
    />
  );
}

export function Composer(props: ComposerProps) {
  // Split rather than branched inside one component: `useAui()` throws outside a
  // provider, and hooks cannot be called conditionally.
  return props.binding === 'runtime' ? (
    <ComposerPrimitive.Root>
      <RuntimeComposer {...props} />
    </ComposerPrimitive.Root>
  ) : (
    <LocalComposer {...props} />
  );
}

const styles = StyleSheet.create({
  attachmentsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.xsmall,
  },
  edge: {
    paddingHorizontal: SCREEN_EDGE,
    paddingTop: spacing.xsmall,
  },
});

/** Padding for a composer pinned to the screen edge (chat thread, tab bars). */
export const composerEdgeStyle = styles.edge;
