import {
  useAui,
  useAuiState,
  ComposerPrimitive,
  type CreateAttachment,
} from '@assistant-ui/react-native';
import {
  buildDocumentMentionAttachment,
  computeMentionInsertion,
  detectMention,
  useAgentStore,
  type Mentionable,
} from '@gruenerator/chat';
import { Ionicons, type IoniconsIconName } from '@react-native-vector-icons/ionicons';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Keyboard,
} from 'react-native';

import { useContentColumn } from '../../hooks/useLayout';
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
import { ComposerAttachmentUI } from '../chat/AttachmentUI';
import { ComposerActionSheet } from '../chat/ComposerActionSheet';
import { DocumentBrowserSheet } from '../chat/DocumentBrowserSheet';
import { MentionPickerSheet, type MentionPickerSource } from '../chat/MentionPickerSheet';
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

/** Module-level so the memoized primitive sees a stable children reference. */
const renderComposerAttachment = () => <ComposerAttachmentUI />;

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

export interface ComposerProps {
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
  /** Left toolbar "+" button opening `ComposerActionSheet`. Under the `runtime`
   *  binding it also offers the attach tiles (file pickers write into the
   *  thread's attachments); a local composer gets the settings rows only. */
  showActionSheet?: boolean;
  /** Left toolbar button for a caller-owned settings sheet. Ignored when
   *  `showActionSheet` is on — the two share the same slot. */
  onSettings?: () => void;
  /** Second left-aligned button, beside the plus/settings one. */
  accessory?: ComposerAccessory;
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
   * Local binding only: what to do with a file or document the user picked.
   * A local composer has no thread to attach to, so its screen decides — the
   * start screen queues the attachment and opens a new conversation with it.
   * Omit it and the "+" sheet shows no attach tiles.
   */
  onAttach?: (attachment: CreateAttachment) => void;
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

/** The mention types that open a source picker instead of inserting text. */
function asPickerSource(type: Mentionable['type']): MentionPickerSource | null {
  return type === 'wolke' || type === 'connect' || type === 'canva' ? type : null;
}

/**
 * A picked recipe has to be remembered, not just typed: the `/mention` token is
 * stripped from the message on the way out, and everything the recipe actually
 * does downstream — its `skillSystemPrompt`, a learned text form, the owning
 * agent's filter and tool restrictions — hangs off `activeSkillMention` instead.
 * Web does this in its composer (`GrueneratorComposer`); without it a recipe
 * only swapped the agent id here, and a text form did nothing at all.
 */
function rememberSkill(mentionable: Mentionable): void {
  if (mentionable.category === 'skill') {
    useAgentStore.getState().setActiveSkillMention(mentionable.mention);
  }
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
      rememberSkill(mentionable);
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

  // Picked from the "+" sheet rather than typed: there is no `@` in the text to
  // replace, so `mentionStart: -1` appends the mention (with a leading space)
  // at the end of the draft.
  const insertMention = useCallback(
    (mentionable: Mentionable) => {
      rememberSkill(mentionable);
      const { newText, cursorPosition } = computeMentionInsertion(
        textRef.current,
        mentionable,
        -1,
        textRef.current.length
      );
      pushText(newText, cursorPosition);
    },
    [pushText]
  );

  /** Appends to the draft with a separating space (the doc browser's `@datei:`). */
  const appendText = useCallback(
    (value: string) => {
      const current = textRef.current;
      const separator = current.length > 0 && !current.endsWith(' ') ? ' ' : '';
      const newText = `${current}${separator}${value}`;
      pushText(newText, newText.length);
    },
    [pushText]
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
    insertMention,
    appendText,
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
  addAttachment,
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
  /**
   * Where a picked file or document reference goes. Supplied by the binding —
   * the runtime composer hands it to the thread, a local one to whatever its
   * screen does with it — so the picking, validating and error handling below
   * exist once instead of once per binding. Absent ⇒ no attach affordance.
   */
  addAttachment?: (attachment: CreateAttachment) => void;
}) {
  const resolvedTheme = useTheme();
  const theme = props.theme ?? resolvedTheme;
  const variant = props.variant ?? 'card';
  const isBar = variant === 'bar';
  const iconSize = composerIconSize(variant);
  const showMentions = props.showMentions ?? true;
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [docBrowserVisible, setDocBrowserVisible] = useState(false);
  const [pickerSource, setPickerSource] = useState<MentionPickerSource | null>(null);

  // Three mention types are not text to insert but a source to browse. Web
  // opens a separate floating popover per type; on a phone they are the same
  // gesture and the same list, so one sheet serves all three. Without an
  // `addAttachment` there is nothing to attach to, and the mention falls back
  // to being plain text.
  const handleMentionSelect = useCallback(
    (mentionable: Mentionable) => {
      const source = asPickerSource(mentionable.type);
      if (source && addAttachment) {
        input.dismissMention();
        setPickerSource(source);
        return;
      }
      input.onMentionSelect(mentionable);
    },
    [input, addAttachment]
  );

  const attachPicked = useCallback(
    async (pending: Promise<PickedDocument | null>) => {
      // `await pending` inside the try so a native picker/manipulator rejection
      // (camera unavailable, permission API throwing, HEIC→JPEG failure)
      // surfaces as an Alert instead of an unhandled promise rejection.
      try {
        const doc = await pending;
        if (!doc) return;
        if (!validatePickedDocument(doc)) return;
        addAttachment?.(await pickedDocumentToAttachment(doc));
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Fehler beim Anhängen';
        Alert.alert('Anhang fehlgeschlagen', msg);
      }
    },
    [addAttachment]
  );

  // Mounting the composer warms the dynamic mentionable lists, as on web.
  useMentionablesSync();

  const leading = props.showActionSheet ? (
    <Pressable
      onPress={() => setActionSheetVisible(true)}
      style={composerIconButtonStyle(variant)}
      hitSlop={6}
      accessibilityLabel="Anhänge und Werkzeuge"
    >
      <Ionicons name="add" size={iconSize + 2} color={theme.textSecondary} />
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
                onSelect={handleMentionSelect}
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
            accessibilityLabel="Nachricht eingeben"
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
        <>
          <ComposerActionSheet
            visible={actionSheetVisible}
            onClose={() => setActionSheetVisible(false)}
            {...(addAttachment
              ? {
                  onPickFile: () => void attachPicked(pickDocument()),
                  onPickImage: () => void attachPicked(pickImageFromLibrary()),
                  onTakePhoto: () => void attachPicked(takePhoto()),
                  onOpenDocBrowser: () => setDocBrowserVisible(true),
                }
              : {})}
            onInsertMention={input.insertMention}
          />
          <DocumentBrowserSheet
            visible={docBrowserVisible}
            theme={theme}
            onSelect={(doc) => {
              // Web's shape exactly: the attachment carries the real document id,
              // which the model adapter turns into `documentIds`/`textIds`. The
              // former `@datei:<slug>` text went through an in-memory map that a
              // reload empties — an unresolvable slug was dropped in silence.
              addAttachment?.(buildDocumentMentionAttachment(doc) as CreateAttachment);
              setDocBrowserVisible(false);
            }}
            onDismiss={() => setDocBrowserVisible(false)}
          />
          <MentionPickerSheet
            source={pickerSource}
            theme={theme}
            onClose={() => setPickerSource(null)}
            onAttach={(attachment) => addAttachment?.(attachment)}
            onInsertText={input.appendText}
          />
        </>
      )}
    </>
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
      // No thread of its own to attach to — only a screen that passed `onAttach`
      // gets the attach tiles (see the prop's note).
      addAttachment={props.onAttach}
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

  /**
   * Send into this thread.
   *
   * Reads the draft, writes it to the runtime composer, sends, and only THEN
   * clears — the same order `LocalComposer.handleSubmit` uses, and the reason
   * that one never broke.
   *
   * It used to be `ComposerPrimitive.Send` with `onPressIn={input.reset}`, on the
   * assumption that `reset()` touches only the native input. It does not:
   * `reset()` calls `TextInput.clear()`, which under the New Architecture comes
   * back as `onChangeText('')` and so empties the RUNTIME composer as well.
   * `onPressIn` fires before `onPress`, so the primitive then read an empty
   * composer and sent nothing. The message simply vanished — no error, no
   * request. The primitive takes no `onPress` (`Omit<PressableProps,"onPress">`),
   * so this calls the `aui.composer().send()` it wraps, one step later — the same
   * shape `MessageEditComposer` already uses for the same reason.
   */
  const handleSend = useCallback(() => {
    const trimmed = input.textRef.current.trim();
    if (!trimmed) return;
    aui.composer().setText(trimmed);
    aui.composer().send();
    input.reset();
  }, [aui, input]);

  return (
    <ComposerBody
      props={props}
      input={input}
      inputRef={inputRef}
      onSubmitEditing={onSubmit ? handleIntercept : handleSend}
      addAttachment={(attachment) => void aui.composer().addAttachment(attachment)}
      attachments={
        <View style={styles.attachmentsRow}>
          <ComposerPrimitive.Attachments>{renderComposerAttachment}</ComposerPrimitive.Attachments>
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
          <Pressable
            testID={props.testIDPrefix ? `${props.testIDPrefix}-send` : undefined}
            onPress={handleSend}
            style={[composerActionButtonStyle(variant), { backgroundColor: COMPOSER_ACTION_FILL }]}
            accessibilityLabel="Senden"
          >
            <Ionicons
              name={variant === 'bar' ? 'arrow-up' : 'arrow-forward'}
              size={composerIconSize(variant)}
              color={colors.white}
            />
          </Pressable>
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
    paddingTop: spacing.xsmall,
  },
});

/**
 * Where a composer pinned to the screen edge sits (chat thread, tab bars).
 *
 * A hook rather than the exported `StyleSheet` entry it used to be: the
 * horizontal half of it is now the reading column, whose width and margin depend
 * on the live window. `StyleSheet.create` runs once at import and would have
 * frozen both at whatever the app booted in.
 */
export function useComposerEdge(): StyleProp<ViewStyle> {
  const column = useContentColumn('reading');

  return useMemo(() => [column, styles.edge], [column]);
}
