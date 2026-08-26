'use client';

import {
  AuiIf,
  ComposerPrimitive,
  useAui,
  useAuiEvent,
  useVoiceControls,
  useVoiceState,
} from '@assistant-ui/react';
import { useAuiState } from '@assistant-ui/store';
import { useMobileKeyboardOffset } from '@gruenerator/shared/hooks';
import { mcpBrandColor } from '@gruenerator/shared/utils';
import { cn, useIsMobile, useMeasuredCornerReservation } from '@gruenerator/ui';
import { ArrowUp, Mic, Plug, Square, X } from 'lucide-react';
import { memo, useEffect, useRef, useState, useCallback, type ClipboardEvent } from 'react';
import { RiVoiceAiFill } from 'react-icons/ri';

import { useMentionablesQuery } from '../../hooks/useMentionablesQuery';
import { handleAttachmentAddError } from '../../lib/attachmentErrorHandler';
import { getCaretCoords } from '../../lib/caretPosition';
import { showsSearchDepth } from '../../lib/composerControls';
import { connectorBrandIcon } from '../../lib/connectorBrand';
import {
  registerDocumentSlug,
  buildDocumentMentionAttachment,
  buildCollabDocAttachment,
  type DocumentMention,
  type CollabDocSelection,
} from '../../lib/documentMentionables';
import {
  mentionableKey,
  type Mentionable,
  type WolkeFileToken,
  type ConnectFileToken,
  type CanvaDesignToken,
  type VorlageToken,
} from '../../lib/mentionables';
import {
  appendToDraft,
  buildConnectAttachment,
  buildWebpageAttachment,
  buildWolkeAttachment,
  canvaDesignsMarkdown,
} from '../../lib/mentionAttachments';
import { getFilteredMentionables, detectMention } from '../../lib/mentionDetection';
import { buildMentionPrefix, computePillMentionInsertion } from '../../lib/mentionInsertion';
import {
  PASTED_TEXT_ATTACHMENT_NAME,
  shouldCreatePastedTextAttachment,
} from '../../lib/pastedText';
import { useScopedAgentId } from '../../lib/useScopedAgentState';
import { useAgentStore } from '../../stores/chatStore';
import { useUserProfileStore } from '../../stores/userProfileStore';
import { ComposerAttachments } from '../assistant-ui/attachment';
import { SearchDepthToggle } from '../SearchDepthToggle';

import { CanvaMentionPopover } from './CanvaMentionPopover';
import { useChatDensity } from './chatDensityContext';
import { ComposerMentionPills } from './ComposerMentionPills';
import { ComposerToken } from './ComposerToken';
import { ConnectMentionPopover } from './ConnectMentionPopover';
import { FileMentionPopover } from './FileMentionPopover';
import { MentionPopover } from './MentionPopover';
import { ModelPicker } from './ModelPicker';
import { PlusMenu, type ComposerPreset } from './PlusMenu';
import { VorlagenMentionPopover } from './VorlagenMentionPopover';
import { WebMentionPopover } from './WebMentionPopover';
import { WolkeMentionPopover } from './WolkeMentionPopover';

interface GrueneratorComposerProps {
  isRunning?: boolean;
  toolbarExtra?: React.ReactNode;
  onNavigate?: (path: string) => void;
  firstName?: string | null;
  placeholder?: string;
  disclaimer?: string;
  disclaimerCompact?: string;
  showMentions?: boolean;
  showPlusMenu?: boolean;
  showToolToggles?: boolean;
  showModelPicker?: boolean;
  /** Forwarded to ModelPicker for surfaces without a ChatSurfaceProvider
   * (e.g. NotebookChatProvider) so auto-mode resolves to the surface's
   * implicit thread mode. */
  insideAgent?: boolean;
  /** Surface-specific prompt presets, shown as a "Vorlagen" submenu in the
   * plus menu (e.g. the workplace example prompts). */
  presets?: ComposerPreset[];
  /** 'card' (default): textarea with toolbar row below. 'pill': slim
   * single-row composer — plus menu, input, model picker and send inline —
   * that grows with the textarea (workplace hero). */
  variant?: 'card' | 'pill';
  /** Render-prop slots for surface-specific UI. */
  slots?: {
    /** Far-left control, where the plus menu sits. Lets a surface that turns
     * the plus menu off still place a button in that position. */
    leading?: React.ReactNode;
    /** Above the input — selection chips, contextual hints. */
    aboveInput?: React.ReactNode;
    /** Below the input/toolbar — quick actions, status rows. */
    belowInput?: React.ReactNode;
    /** Right side, adjacent to the Send button. */
    sendAdornment?: React.ReactNode;
  };
  /**
   * Gate the send button on `useUserProfileStore.isHydrated`. Shows a spinner
   * until profile data (roles, etc.) is loaded. Use in web where roles must
   * be in the request payload from the first message; off by default so
   * mobile/desktop without a hydration bridge are unaffected.
   */
  requireProfileHydration?: boolean;
  /** Turns substantial plain-text clipboard pastes into a compact reference card.
   * Explicit opt-in keeps search and notebook surfaces on their existing request paths. */
  enablePastedTextAttachments?: boolean;
}

const ROUND_BTN_BASE =
  'flex items-center justify-center rounded-full transition-[background-color,color,transform,opacity]';
const roundBtnSize = (isCompact: boolean) => (isCompact ? 'm-1.5 h-7 w-7' : 'm-2 h-8 w-8');

function SearchDepthToggleSlot() {
  // The rule lives in `showsSearchDepth` (shared with mobile), not here — see
  // the note there on why the control is search-route only.
  const selectedAgentId = useScopedAgentId();
  if (!showsSearchDepth(selectedAgentId)) return null;
  return <SearchDepthToggle />;
}

function SendButton({
  requireProfileHydration,
  hasPillMentions,
  onFlushPillMentions,
  onSendWithPillMentions,
}: {
  requireProfileHydration?: boolean;
  hasPillMentions?: boolean;
  onFlushPillMentions?: () => void;
  onSendWithPillMentions?: () => void;
}) {
  const isCompact = useChatDensity() === 'compact';
  const isHydrated = useUserProfileStore((s) => s.isHydrated);
  // With pill mentions and an otherwise empty draft the primitive Send is
  // disabled (composer.canSend is false) — only then do we substitute our own
  // button. While something is genuinely blocking (attachment upload), text or
  // attachments are present, so this branch stays off and the primitive's
  // disabled logic keeps ruling.
  const emptyDraft = useAuiState(
    (s) => s.composer.text.trim() === '' && s.composer.attachments.length === 0
  );

  if (requireProfileHydration && !isHydrated) {
    return (
      <button
        type="button"
        disabled
        aria-label="Profil wird geladen"
        title="Profil wird geladen…"
        className={`${roundBtnSize(isCompact)} ${ROUND_BTN_BASE} bg-primary text-white opacity-30`}
      >
        <span className="block h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
      </button>
    );
  }

  if (hasPillMentions && emptyDraft) {
    return (
      <button
        type="button"
        onClick={onSendWithPillMentions}
        aria-label="Nachricht senden"
        className={`${roundBtnSize(isCompact)} ${ROUND_BTN_BASE} bg-primary text-white hover:bg-primary-600 active:scale-95`}
      >
        <ArrowUp className={isCompact ? 'h-4 w-4' : 'h-5 w-5'} />
      </button>
    );
  }

  return (
    <ComposerPrimitive.Send
      // Runs BEFORE the primitive's internal send (composeEventHandlers), so
      // the pills are already in the text when send() reads the state.
      onClick={hasPillMentions ? onFlushPillMentions : undefined}
      className={`${roundBtnSize(isCompact)} ${ROUND_BTN_BASE} bg-primary text-white enabled:hover:bg-primary-600 enabled:active:scale-95 disabled:opacity-30`}
      aria-label="Nachricht senden"
    >
      <ArrowUp className={isCompact ? 'h-4 w-4' : 'h-5 w-5'} />
    </ComposerPrimitive.Send>
  );
}

function CancelButton() {
  const isCompact = useChatDensity() === 'compact';
  return (
    <ComposerPrimitive.Cancel
      className={`${roundBtnSize(isCompact)} ${ROUND_BTN_BASE} bg-error text-white hover:bg-error/90 active:scale-95`}
      aria-label="Abbrechen"
    >
      <Square className={isCompact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
    </ComposerPrimitive.Cancel>
  );
}

function DictateButton() {
  const isCompact = useChatDensity() === 'compact';
  return (
    <ComposerPrimitive.Dictate
      className={`${roundBtnSize(isCompact)} flex items-center justify-center rounded-full text-foreground-muted transition-colors hover:bg-grey-100 hover:text-foreground active:bg-grey-200 dark:hover:bg-grey-800 dark:active:bg-grey-700`}
      aria-label="Diktat starten"
    >
      <Mic className={isCompact ? 'h-4 w-4' : 'h-5 w-5'} />
    </ComposerPrimitive.Dictate>
  );
}

function StopDictationButton() {
  const isCompact = useChatDensity() === 'compact';
  return (
    <ComposerPrimitive.StopDictation
      className={`${roundBtnSize(isCompact)} ${ROUND_BTN_BASE} bg-error text-white animate-pulse hover:bg-error/90`}
      aria-label="Diktat beenden"
    >
      <Square className={isCompact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
    </ComposerPrimitive.StopDictation>
  );
}

function ComposerVoiceToggle() {
  const isCompact = useChatDensity() === 'compact';
  const voiceState = useVoiceState();
  const { connect, disconnect } = useVoiceControls();
  const status = voiceState?.status.type;
  const isActive = status === 'running' || status === 'starting';
  const isStarting = status === 'starting';

  return (
    <AuiIf condition={(s) => s.thread.capabilities.voice}>
      <button
        type="button"
        onClick={() => (isActive ? disconnect() : connect())}
        aria-label={isActive ? 'Sprachsitzung beenden' : 'Sprachsitzung starten'}
        aria-pressed={isActive}
        className={cn(
          'flex items-center justify-center rounded-full transition-colors',
          isCompact ? 'm-1.5 h-7 w-7' : 'm-2 h-8 w-8',
          isActive
            ? 'bg-primary text-white'
            : 'text-foreground-muted hover:bg-grey-100 hover:text-foreground dark:hover:bg-grey-800',
          isStarting && 'animate-pulse'
        )}
      >
        <RiVoiceAiFill className={isCompact ? 'h-4 w-4' : 'h-5 w-5'} />
      </button>
    </AuiIf>
  );
}

function ComposerButtons({
  isRunning,
  requireProfileHydration,
  hasPillMentions,
  onFlushPillMentions,
  onSendWithPillMentions,
}: {
  isRunning?: boolean;
  requireProfileHydration?: boolean;
  hasPillMentions?: boolean;
  onFlushPillMentions?: () => void;
  onSendWithPillMentions?: () => void;
}) {
  const isDictating = useAuiState((s) => s.composer.dictation != null);
  const hasDictation = useAuiState((s) => s.thread.capabilities.dictation);
  const isEmpty = useAuiState((s) => s.composer.isEmpty);

  if (isRunning) return <CancelButton />;
  if (isDictating) return <StopDictationButton />;
  if (hasDictation && isEmpty && !hasPillMentions) return <DictateButton />;
  return (
    <SendButton
      requireProfileHydration={requireProfileHydration}
      hasPillMentions={hasPillMentions}
      onFlushPillMentions={onFlushPillMentions}
      onSendWithPillMentions={onSendWithPillMentions}
    />
  );
}

interface MentionState {
  visible: boolean;
  mode: 'functions' | 'datei' | 'wolke' | 'connect' | 'canva' | 'vorlagen' | 'web';
  query: string;
  selectedIndex: number;
  anchorRect: { x: number; y: number } | null;
  mentionStart: number;
}

const INITIAL_MENTION_STATE: MentionState = {
  visible: false,
  mode: 'functions',
  query: '',
  selectedIndex: 0,
  anchorRect: null,
  mentionStart: -1,
};

const COMPOSER_CORNERS = ['bottom-left', 'bottom-right'] as const;

export const GrueneratorComposer = memo(function GrueneratorComposer({
  isRunning,
  toolbarExtra,
  onNavigate,
  firstName,
  placeholder,
  disclaimer = 'KI-generierte Ergebnisse vor der Veröffentlichung prüfen — sie können fehlerhaft, unvollständig oder irreführend sein.',
  disclaimerCompact = 'KI-Ergebnisse vor der Veröffentlichung prüfen.',
  showMentions = true,
  showPlusMenu = true,
  showToolToggles = true,
  showModelPicker = true,
  insideAgent = false,
  presets,
  variant = 'card',
  slots,
  requireProfileHydration = false,
  enablePastedTextAttachments = false,
}: GrueneratorComposerProps) {
  const composerAreaRef = useRef<HTMLDivElement>(null);
  const composerRuntime = useAui().composer;
  const isCompact = useChatDensity() === 'compact';
  const isMobile = useIsMobile();
  const effectivePlaceholder = placeholder ?? (isMobile ? 'Schreibe...' : 'Nachricht schreiben...');
  const isMistral = useAgentStore((s) => s.selectedProvider === 'mistral');
  const pinnedConnector = useAgentStore((s) => s.pinnedConnector);
  const setPinnedConnector = useAgentStore((s) => s.setPinnedConnector);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const uploadRef = useRef<HTMLButtonElement>(null);
  const [mention, setMention] = useState<MentionState>(INITIAL_MENTION_STATE);
  // Function/agent mentions picked from the popover or plus menu live here as
  // chips ("pills") instead of raw `@websuche` text in the textarea. At send
  // time they are flushed back into the text as exactly that plain-mention
  // prefix, so parsing, routing, persistence and the message-bubble chips all
  // stay on today's path (see buildMentionPrefix).
  const [pillMentions, setPillMentions] = useState<Mentionable[]>([]);
  const pillMentionsRef = useRef(pillMentions);
  pillMentionsRef.current = pillMentions;

  // Pills are a draft property of the current thread's composer — a thread
  // switch (or new chat, which nulls the id) starts from a clean slate, same
  // as the store does for activeSkillMention/pinnedConnector.
  const currentThreadId = useAgentStore((s) => s.currentThreadId);
  useEffect(() => {
    setPillMentions([]);
  }, [currentThreadId]);

  // `interactive-widget=resizes-visual` (apps/web/index.html) keeps the layout
  // viewport at full height when the on-screen keyboard opens, so no `dvh` box
  // and no flex column notices it. This publishes the keyboard height as
  // `--mobile-keyboard-offset` on `:root`; the surfaces that own the composer's
  // bottom edge shrink themselves by it.
  useMobileKeyboardOffset(textareaRef);

  // Auf dem Handy klebt der Composer an der unteren Kante, und sein
  // Senden-/Stop-Knopf sitzt genau dort, wo der Feedback-Button verankert ist.
  // Gemessen statt deklariert, weil die Höhe am Inhalt hängt (bis zu 6 Zeilen,
  // Anhänge, umbrechende Mention-Pills). Auf breiten Schirmen endet der
  // zentrierte `max-w-3xl`-Composer weit vor der Ecke und meldet von selbst
  // nichts an — ebenso in Dialogen und Einstellungen, die denselben Composer
  // mitten auf der Seite zeigen.
  useMeasuredCornerReservation(composerAreaRef, {
    corner: COMPOSER_CORNERS,
    axis: 'vertical',
  });

  // Composer mount drives lazy fetching of mentionable data (custom agents,
  // boards, docs). The query is deduplicated across consumers via React Query.
  useMentionablesQuery();

  // AUI's file-input handler validates against the adapter's `accept` list and
  // throws a raw English error before our adapter's add() runs. Subscribe to
  // the structured event so the user sees a clean German toast instead.
  useAuiEvent('composer.attachmentAddError', handleAttachmentAddError);

  const dismissPopover = useCallback(() => setMention(INITIAL_MENTION_STATE), []);

  const removePillMention = useCallback((m: Mentionable) => {
    setPillMentions((prev) => prev.filter((p) => mentionableKey(p) !== mentionableKey(m)));
    // A skill pill carries its per-turn prompt fragment via the store — removing
    // the chip must also drop that, or the skill would still fire invisibly.
    if (m.category === 'skill' && useAgentStore.getState().activeSkillMention === m.mention) {
      useAgentStore.getState().setActiveSkillMention(null);
    }
  }, []);

  /** Rewrite the draft to `@mention… <text>` and clear the chips. Must run
   *  synchronously before whatever triggers composer.send() reads the state. */
  const flushPillMentions = useCallback(() => {
    const pills = pillMentionsRef.current;
    if (pills.length === 0) return;
    const prefix = buildMentionPrefix(pills);
    const text = composerRuntime.getState().text;
    composerRuntime.setText(text.length > 0 ? `${prefix} ${text}` : `${prefix} `);
    setPillMentions([]);
  }, [composerRuntime]);

  /** Explicit send for the pills-only case: with an empty draft, canSend is
   *  false, so the primitive Send/Root submit path is inert — flush first,
   *  then send the now non-empty draft ourselves. */
  const sendWithPillMentions = useCallback(() => {
    flushPillMentions();
    composerRuntime.send();
  }, [composerRuntime, flushPillMentions]);

  const handlePaste = useCallback(
    (event: ClipboardEvent<HTMLTextAreaElement>) => {
      if (!enablePastedTextAttachments) return;

      const clipboard = event.clipboardData;
      // Substantial text wins over clipboard FILES on purpose. Word, PDF
      // viewers and website copies put a bitmap RENDER of the copied text next
      // to `text/plain`, and the previous "any file → native paste" early
      // return turned such a paste into an IMAGE upload (live 12.08.2026: a
      // pasted role-definition prompt arrived as "hochgeladenes Bild" and got
      // described instead of executed). Genuine image pastes are unaffected —
      // screenshots and copied images carry no qualifying text, and a real
      // file paste's text flavor is at most a short path — so those still fall
      // through to assistant-ui's native file/image-paste behaviour.
      const text = clipboard.getData('text/plain');
      if (!shouldCreatePastedTextAttachment(text)) return;

      event.preventDefault();
      const file = new File([text], PASTED_TEXT_ATTACHMENT_NAME, { type: 'text/plain' });
      void composerRuntime.addAttachment(file);
    },
    [composerRuntime, enablePastedTextAttachments]
  );

  const handleSelect = useCallback(
    (mentionable: Mentionable) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      // When user selects the @datei trigger, switch to file browser mode
      if (mentionable.type === 'document' && mentionable.identifier === 'datei-trigger') {
        setMention((prev) => ({ ...prev, mode: 'datei' }));
        return;
      }

      // When user selects the @docs trigger, also open the unified file/doc picker
      if (mentionable.type === 'doc' && mentionable.identifier === 'docs-picker-trigger') {
        setMention((prev) => ({ ...prev, mode: 'datei' }));
        return;
      }

      // When user selects the @wolke trigger, swap to the Wolke file picker
      if (mentionable.type === 'wolke') {
        // Strip the in-progress "@wolk…" trigger from the textarea — the picker
        // inserts one @wolke:<token> per chosen file via handleWolkeSelect.
        if (mention.mentionStart >= 0) {
          const currentText = composerRuntime.getState().text;
          const before = currentText.slice(0, mention.mentionStart);
          const after = currentText.slice(textarea.selectionStart);
          composerRuntime.setText(`${before}${after}`);
          requestAnimationFrame(() => {
            const pos = before.length;
            textarea.setSelectionRange(pos, pos);
          });
        }
        setMention((prev) => ({ ...prev, mode: 'wolke', visible: true, mentionStart: -1 }));
        return;
      }

      // When user selects the @connect trigger, swap to the connected-account picker
      if (mentionable.type === 'connect') {
        // Strip the in-progress "@conn…" trigger from the textarea — the picker
        // inserts one @connect:<token> per chosen file via handleConnectSelect.
        if (mention.mentionStart >= 0) {
          const currentText = composerRuntime.getState().text;
          const before = currentText.slice(0, mention.mentionStart);
          const after = currentText.slice(textarea.selectionStart);
          composerRuntime.setText(`${before}${after}`);
          requestAnimationFrame(() => {
            const pos = before.length;
            textarea.setSelectionRange(pos, pos);
          });
        }
        setMention((prev) => ({ ...prev, mode: 'connect', visible: true, mentionStart: -1 }));
        return;
      }

      // When user selects the @canva trigger, swap to the Canva design picker
      if (mentionable.type === 'canva') {
        // Strip the in-progress "@canv…" trigger from the textarea — the picker
        // inserts a markdown link per chosen design via handleCanvaSelect.
        if (mention.mentionStart >= 0) {
          const currentText = composerRuntime.getState().text;
          const before = currentText.slice(0, mention.mentionStart);
          const after = currentText.slice(textarea.selectionStart);
          composerRuntime.setText(`${before}${after}`);
          requestAnimationFrame(() => {
            const pos = before.length;
            textarea.setSelectionRange(pos, pos);
          });
        }
        setMention((prev) => ({ ...prev, mode: 'canva', visible: true, mentionStart: -1 }));
        return;
      }

      // When user selects the @vorlagen trigger, swap to the Vorlagen picker.
      if (mentionable.type === 'vorlagen') {
        if (mention.mentionStart >= 0) {
          const currentText = composerRuntime.getState().text;
          const before = currentText.slice(0, mention.mentionStart);
          const after = currentText.slice(textarea.selectionStart);
          composerRuntime.setText(`${before}${after}`);
          requestAnimationFrame(() => {
            const pos = before.length;
            textarea.setSelectionRange(pos, pos);
          });
        }
        setMention((prev) => ({ ...prev, mode: 'vorlagen', visible: true, mentionStart: -1 }));
        return;
      }

      // When user selects the @link trigger, swap to the URL input popover
      if (mentionable.type === 'webpage') {
        if (mention.mentionStart >= 0) {
          const currentText = composerRuntime.getState().text;
          const before = currentText.slice(0, mention.mentionStart);
          const after = currentText.slice(textarea.selectionStart);
          composerRuntime.setText(`${before}${after}`);
          requestAnimationFrame(() => {
            const pos = before.length;
            textarea.setSelectionRange(pos, pos);
          });
        }
        setMention((prev) => ({ ...prev, mode: 'web', visible: true, mentionStart: -1 }));
        return;
      }

      // Everything else (agents, skills, tools, notebooks, boards, sheets,
      // docs, MCP servers) becomes a chip instead of `@websuche` text: strip
      // the typed trigger, keep only the promptTemplate in the draft, and park
      // the mention itself in pillMentions until send.
      const currentText = composerRuntime.getState().text;
      const caretPosition =
        mention.mentionStart >= 0 ? textarea.selectionStart : currentText.length;
      const { newText, cursorPosition } = computePillMentionInsertion(
        currentText,
        mentionable,
        mention.mentionStart,
        caretPosition
      );

      // Skill mentions activate a per-turn prompt fragment on the backend.
      // Capture the mention key in the chat store so the next request includes it.
      if (mentionable.category === 'skill') {
        useAgentStore.getState().setActiveSkillMention(mentionable.mention);
      }

      setPillMentions((prev) =>
        prev.some((p) => mentionableKey(p) === mentionableKey(mentionable))
          ? prev
          : [...prev, mentionable]
      );
      composerRuntime.setText(newText);
      dismissPopover();

      requestAnimationFrame(() => {
        textarea.setSelectionRange(cursorPosition, cursorPosition);
        textarea.focus();
      });
    },
    [composerRuntime, mention.mentionStart, dismissPopover]
  );

  const stripTriggerText = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea || mention.mentionStart < 0) return;
    const currentText = composerRuntime.getState().text;
    const before = currentText.slice(0, mention.mentionStart);
    const after = currentText.slice(textarea.selectionStart);
    composerRuntime.setText(`${before}${after}`);
  }, [composerRuntime, mention.mentionStart]);

  const handleDocumentSelect = useCallback(
    (doc: DocumentMention) => {
      registerDocumentSlug(doc.slug, doc);

      void composerRuntime.addAttachment(buildDocumentMentionAttachment(doc));

      stripTriggerText();
      dismissPopover();
      requestAnimationFrame(() => textareaRef.current?.focus());
    },
    [composerRuntime, dismissPopover, stripTriggerText]
  );

  const handleCollabDocSelect = useCallback(
    (doc: CollabDocSelection) => {
      void composerRuntime.addAttachment(buildCollabDocAttachment(doc));

      stripTriggerText();
      dismissPopover();
      requestAnimationFrame(() => textareaRef.current?.focus());
    },
    [composerRuntime, dismissPopover, stripTriggerText]
  );

  const handleWolkeSelect = useCallback(
    (files: WolkeFileToken[]) => {
      if (files.length === 0) return;
      for (const f of files) {
        void composerRuntime.addAttachment(buildWolkeAttachment(f));
      }
      dismissPopover();
      requestAnimationFrame(() => textareaRef.current?.focus());
    },
    [composerRuntime, dismissPopover]
  );

  const handleConnectSelect = useCallback(
    (files: ConnectFileToken[]) => {
      if (files.length === 0) return;
      for (const f of files) {
        void composerRuntime.addAttachment(buildConnectAttachment(f));
      }
      dismissPopover();
      requestAnimationFrame(() => textareaRef.current?.focus());
    },
    [composerRuntime, dismissPopover]
  );

  const handleWebSelect = useCallback(
    (url: string) => {
      void composerRuntime.addAttachment(buildWebpageAttachment(url));
      dismissPopover();
      requestAnimationFrame(() => textareaRef.current?.focus());
    },
    [composerRuntime, dismissPopover]
  );

  const handleCanvaSelect = useCallback(
    (designs: CanvaDesignToken[]) => {
      if (designs.length === 0) return;
      // Insert each chosen design as a markdown link — a direct, durable
      // reference (view URLs are valid 30 days) the user/agent can act on.
      const newText = appendToDraft(composerRuntime.getState().text, canvaDesignsMarkdown(designs));
      composerRuntime.setText(newText);
      dismissPopover();
      requestAnimationFrame(() => {
        const textarea = textareaRef.current;
        if (textarea) {
          textarea.setSelectionRange(newText.length, newText.length);
          textarea.focus();
        }
      });
    },
    [composerRuntime, dismissPopover]
  );

  const handleVorlagenSelect = useCallback(
    (vorlagen: VorlageToken[]) => {
      if (vorlagen.length === 0) return;
      // Insert each chosen template as a markdown link — a direct reference
      // the user/agent can act on (mirrors @canva).
      const links = vorlagen
        .map((v) => (v.url ? `[📋 ${v.title}](${v.url})` : `📋 ${v.title}`))
        .join(' ');
      const currentText = composerRuntime.getState().text;
      const needsSpace = currentText.length > 0 && !currentText.endsWith(' ');
      const newText = `${currentText}${needsSpace ? ' ' : ''}${links} `;
      composerRuntime.setText(newText);
      dismissPopover();
      requestAnimationFrame(() => {
        const textarea = textareaRef.current;
        if (textarea) {
          textarea.setSelectionRange(newText.length, newText.length);
          textarea.focus();
        }
      });
    },
    [composerRuntime, dismissPopover]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      // Don't interfere when file/doc browser, wolke, connect, canva, or vorlagen picker is open
      if (
        mention.mode === 'datei' ||
        mention.mode === 'wolke' ||
        mention.mode === 'connect' ||
        mention.mode === 'canva' ||
        mention.mode === 'vorlagen' ||
        mention.mode === 'web'
      )
        return;

      const textarea = e.target;
      const text = textarea.value;
      const caret = textarea.selectionStart;

      const detected = detectMention(text, caret);
      if (detected) {
        const coords = getCaretCoords(textarea, detected.mentionStart);
        setMention({
          visible: true,
          // Reset to the combined list: the state may still hold a picker mode
          // (datei/wolke/…) from a previous, now-edited-away mention.
          mode: 'functions',
          query: detected.query,
          selectedIndex: 0,
          anchorRect: coords,
          mentionStart: detected.mentionStart,
        });
        return;
      }

      dismissPopover();
    },
    [mention.mode, dismissPopover]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (!mention.visible) {
        if (pillMentionsRef.current.length === 0) return;
        const state = composerRuntime.getState();
        // Enter on a pills-only draft: the primitive's Enter→submit path is
        // inert (canSend false on empty text), so send explicitly. Non-empty
        // drafts keep the normal path — the Root onSubmit flush covers them.
        if (
          e.key === 'Enter' &&
          !e.shiftKey &&
          !e.nativeEvent.isComposing &&
          !isRunning &&
          state.text.trim() === '' &&
          state.attachments.length === 0
        ) {
          e.preventDefault();
          sendWithPillMentions();
          return;
        }
        // Backspace at the very start of the draft eats the last pill,
        // mirroring how deleting into typed `@websuche ` text behaves.
        const textarea = e.currentTarget;
        if (e.key === 'Backspace' && textarea.selectionStart === 0 && textarea.selectionEnd === 0) {
          e.preventDefault();
          const last = pillMentionsRef.current[pillMentionsRef.current.length - 1];
          if (last) removePillMention(last);
        }
        return;
      }

      // In datei/docs mode, only handle Escape (cmdk handles arrow keys internally).
      // Enter is swallowed so the textarea doesn't submit the form while the picker
      // is open — the user must select via the picker or dismiss with Escape first.
      if (
        mention.mode === 'datei' ||
        mention.mode === 'wolke' ||
        mention.mode === 'connect' ||
        mention.mode === 'canva' ||
        mention.mode === 'vorlagen' ||
        mention.mode === 'web'
      ) {
        if (e.key === 'Escape') {
          e.preventDefault();
          dismissPopover();
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
        }
        return;
      }

      const filtered = getFilteredMentionables(mention.query);
      if (filtered.length === 0) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setMention((prev) => ({
            ...prev,
            selectedIndex: (prev.selectedIndex + 1) % filtered.length,
          }));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setMention((prev) => ({
            ...prev,
            selectedIndex: (prev.selectedIndex - 1 + filtered.length) % filtered.length,
          }));
          break;
        case 'Enter':
        case 'Tab':
          e.preventDefault();
          handleSelect(filtered[mention.selectedIndex]);
          break;
        case 'Escape':
          e.preventDefault();
          dismissPopover();
          break;
        default:
          break;
      }
    },
    [
      mention.visible,
      mention.mode,
      mention.query,
      mention.selectedIndex,
      handleSelect,
      dismissPopover,
      composerRuntime,
      isRunning,
      sendWithPillMentions,
      removePillMention,
    ]
  );

  const openFilePicker = useCallback(() => {
    uploadRef.current?.click();
  }, []);

  const handlePlusMenuOpenFileBrowser = useCallback(() => {
    setMention((prev) => ({ ...prev, mode: 'datei', visible: true, mentionStart: -1 }));
  }, []);

  const handleApplyPreset = useCallback(
    (text: string) => {
      composerRuntime.setText(text);
      requestAnimationFrame(() => {
        const textarea = textareaRef.current;
        if (textarea) {
          textarea.setSelectionRange(text.length, text.length);
          textarea.focus();
        }
      });
    },
    [composerRuntime]
  );

  const isPill = variant === 'pill';

  const hiddenUploadButton = (
    <ComposerPrimitive.AddAttachment asChild>
      <button ref={uploadRef} className="hidden" aria-hidden="true" />
    </ComposerPrimitive.AddAttachment>
  );

  const plusMenuNode = showPlusMenu ? (
    <PlusMenu
      onInsertMention={handleSelect}
      onOpenFileBrowser={handlePlusMenuOpenFileBrowser}
      includeModes={showToolToggles}
      insideAgent={insideAgent}
      firstName={firstName ?? null}
      {...(presets && presets.length > 0 && { presets, onApplyPreset: handleApplyPreset })}
      {...(onNavigate ? { onNavigate, onOpenSkillsPage: () => onNavigate('/agentura') } : {})}
    />
  ) : null;

  // Sticky connector chip (web-only for now): a compact INLINE token at the
  // start of the input line (ChatGPT-style), with the connector's real brand
  // logo. The × unpins. Rendered inside the input row below.
  const pinnedConnectorChip = pinnedConnector ? (
    <ComposerToken
      icon={connectorBrandIcon(pinnedConnector.label) ?? Plug}
      brandColor={mcpBrandColor(pinnedConnector.label)}
      label={pinnedConnector.label}
      removeLabel={`${pinnedConnector.label} lösen`}
      onRemove={() => setPinnedConnector(null)}
    />
  ) : null;

  const modelPickerNode = showModelPicker ? <ModelPicker /> : null;

  const composerInput = (
    <ComposerPrimitive.Input
      ref={textareaRef}
      autoFocus={typeof window !== 'undefined' && !window.matchMedia('(pointer: coarse)').matches}
      placeholder={effectivePlaceholder}
      minRows={1}
      maxRows={isPill ? 6 : isCompact ? 4 : 8}
      className={
        isPill
          ? 'min-h-0 w-full min-w-0 flex-1 resize-none bg-transparent px-1.5 py-3 text-foreground outline-none placeholder:text-foreground-muted/60'
          : isCompact
            ? 'min-h-0 w-full flex-grow resize-none bg-transparent px-3 pt-2 pb-1.5 text-[13px] text-foreground outline-none placeholder:text-foreground-muted/60'
            : 'min-h-0 w-full flex-grow resize-none bg-transparent px-5 pt-3.5 pb-2.5 text-foreground outline-none placeholder:text-foreground-muted/60'
      }
      onChange={showMentions ? handleChange : undefined}
      // Not gated on showMentions: the pill handling (Enter/Backspace) must
      // also work on surfaces whose pills come from the plus menu only. The
      // popover branches inside are inert there (mention.visible stays false).
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
    />
  );

  return (
    <div
      ref={composerAreaRef}
      className="px-4 pb-[max(0.25rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-[max(1rem,env(safe-area-inset-bottom))] lg:px-8"
    >
      <ComposerPrimitive.Root
        // Runs before the Root's internal submit handler (composeEventHandlers),
        // so an Enter-submitted draft carries the pills when send() reads it.
        // Guarded on canSend: when the submit will be a no-op (attachment still
        // uploading), the pills must not be dumped into the text either.
        onSubmit={() => {
          if (composerRuntime.getState().canSend) flushPillMentions();
        }}
        className={cn(
          'composer-root relative mx-auto flex w-full max-w-3xl flex-col border bg-white transition-shadow dark:bg-surface',
          // The keyboard-focus indicator. The composer had none: the textarea
          // carries an unconditional `outline-none` (see below), and the app's
          // global `:focus-visible` ring lives in the `legacy` layer, which
          // Tailwind's `utilities` layer outranks. What was left was a shadow
          // stepping up one size — a blur difference, not a contrast one, so it
          // could not meet the 3:1 that WCAG 1.4.11 asks of a focus indicator.
          //
          // `outline`, not a ring: `box-shadow` is dropped entirely under
          // `forced-colors: active` (Windows-Kontrastmodus), where this surface
          // already loses its tint. An outline survives — the system recolours
          // it and keeps drawing it — so the one property covers both cases and
          // needs no `@media` companion.
          //
          // `has-[textarea:focus]` rather than `focus-within`: the toolbar
          // buttons inside carry their own ring from the global rule, and
          // outlining the whole capsule while tabbing through them would read as
          // noise. What a person means by "the composer has focus" is the text
          // field.
          //
          // `kbd:` in front of it, because :focus was never the whole story: the
          // CSS spec exempts text entry from the mouse-click rule, so a textarea
          // matches :focus AND :focus-visible when clicked into. Swapping one for
          // the other changes nothing here — only the input modality does. See
          // focusModality.ts.
          //
          // Two colours because no single one clears 3:1 on both grounds. Light:
          // primary-600 (#316049) at 7.2:1 on white and 6.3:1 on the glow band's
          // strongest tint. Dark: primary-300 (#8AC9B0) at 8.0:1 on the page and
          // 7.0:1 on the composer's own fill. The app's usual ring colour,
          // primary-500, drops to ~3.2:1 against the band — it was chosen for
          // plain surfaces, not for a tinted one.
          'kbd:has-[textarea:focus]:outline-2 kbd:has-[textarea:focus]:outline-offset-2',
          'kbd:has-[textarea:focus]:outline-primary-600 dark:kbd:has-[textarea:focus]:outline-primary-300',
          // Design v2: the pill keeps its resting border/shadow on focus.
          //
          // 1.875rem is half the composer's resting one-row height, so the shape
          // is a true pill while it's one row — but stays a rounded rect once an
          // attachment tile or extra text rows make it taller. `rounded-full`
          // would keep tracking half the GROWN height (86px at one image tile)
          // and sweep the corner arc straight across the tile.
          isPill
            ? 'rounded-[1.875rem] shadow-md focus-within:shadow-lg dark:shadow-sm'
            : 'rounded-3xl shadow-lg focus-within:border-primary/30 focus-within:shadow-xl dark:shadow-sm dark:focus-within:shadow-md',
          // The Mistral brand border reads as a focus ring on the slim pill —
          // card layout only.
          //
          // Otherwise the border colour comes from a variable, not from the
          // token directly: a surface that supplies its own tinted ground under
          // the composer (the chat backgrounds, the thread's glow band) sets
          // `--chat-composer-border: transparent` and the fill alone separates
          // it — which is how the app draws it. Surfaces that set nothing (the
          // notebook composer, /suche) fall back to the token and keep their
          // border, so this stays a per-surface decision rather than a prop
          // threaded through four call sites.
          isMistral && !isPill
            ? 'border-[#003399]'
            : 'border-[color:var(--chat-composer-border,var(--color-border))]'
        )}
      >
        <ComposerPrimitive.Quote
          className={cn(
            'mx-4 mt-4 flex items-start gap-2 rounded-r-lg border-l-4 border-primary/40 bg-primary/5',
            isCompact ? 'px-2.5 py-1.5 text-[13px]' : 'px-3 py-2 text-sm'
          )}
        >
          <ComposerPrimitive.QuoteText className="line-clamp-2 flex-1 italic text-foreground-muted" />
          <ComposerPrimitive.QuoteDismiss className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-foreground-muted hover:text-foreground">
            <X className="h-3 w-3" />
          </ComposerPrimitive.QuoteDismiss>
        </ComposerPrimitive.Quote>

        {/* Inset mirrors the input's horizontal padding per variant, so the
            tile's left edge lines up with the first character of the draft. */}
        <ComposerAttachments className={isPill ? 'mx-3.5' : isCompact ? 'mx-3' : 'mx-5'} />

        {slots?.aboveInput}

        {showMentions &&
          (mention.mode === 'datei' ? (
            <FileMentionPopover
              visible={mention.visible}
              onSelect={(s) =>
                s.kind === 'document' ? handleDocumentSelect(s.doc) : handleCollabDocSelect(s.doc)
              }
              onDismiss={dismissPopover}
              onUploadFile={openFilePicker}
            />
          ) : mention.mode === 'wolke' ? (
            <WolkeMentionPopover
              visible={mention.visible}
              onSelect={handleWolkeSelect}
              onDismiss={dismissPopover}
            />
          ) : mention.mode === 'connect' ? (
            <ConnectMentionPopover
              visible={mention.visible}
              onSelect={handleConnectSelect}
              onDismiss={dismissPopover}
            />
          ) : mention.mode === 'canva' ? (
            <CanvaMentionPopover
              visible={mention.visible}
              onSelect={handleCanvaSelect}
              onDismiss={dismissPopover}
            />
          ) : mention.mode === 'vorlagen' ? (
            <VorlagenMentionPopover
              visible={mention.visible}
              onSelect={handleVorlagenSelect}
              onDismiss={dismissPopover}
            />
          ) : mention.mode === 'web' ? (
            <WebMentionPopover
              visible={mention.visible}
              onSelect={handleWebSelect}
              onDismiss={dismissPopover}
            />
          ) : (
            <MentionPopover
              query={mention.query}
              visible={mention.visible}
              onSelect={handleSelect}
              onDismiss={dismissPopover}
              selectedIndex={mention.selectedIndex}
              anchorRect={mention.anchorRect}
            />
          ))}

        {isPill ? (
          <div className="flex items-center gap-0.5 px-1.5 py-1 max-sm:flex-wrap">
            {hiddenUploadButton}
            {plusMenuNode}
            {slots?.leading}
            {pinnedConnectorChip}
            {/* Bis `sm` nehmen die Pills per order/basis eine eigene Zeile über
                der Eingabezeile ein (wie in der Card-Variante) — inline ließen
                die shrink-0-Pills der Textarea nur wenige Zeichen Breite. */}
            <ComposerMentionPills
              mentions={pillMentions}
              onRemove={removePillMention}
              className="ml-0.5 max-sm:order-first max-sm:basis-full max-sm:px-1 max-sm:pt-1.5 sm:flex-nowrap sm:overflow-hidden"
            />
            {composerInput}
            {showToolToggles && <SearchDepthToggleSlot />}
            {toolbarExtra}
            {modelPickerNode}
            {slots?.sendAdornment}
            <ComposerButtons
              isRunning={isRunning}
              requireProfileHydration={requireProfileHydration}
              hasPillMentions={pillMentions.length > 0}
              onFlushPillMentions={flushPillMentions}
              onSendWithPillMentions={sendWithPillMentions}
            />
          </div>
        ) : (
          <>
            <ComposerMentionPills
              mentions={pillMentions}
              onRemove={removePillMention}
              className={isCompact ? 'mx-3 mt-2' : 'mx-5 mt-3'}
            />
            {composerInput}

            <div className="flex items-center justify-between px-2 pb-1">
              <div className="flex items-center gap-1">
                {hiddenUploadButton}
                {plusMenuNode}
                {slots?.leading}
                {pinnedConnectorChip}
                {showToolToggles && <SearchDepthToggleSlot />}
                {toolbarExtra}
              </div>
              <div className="flex items-center gap-0.5">
                {modelPickerNode}
                {/* TODO: re-enable when realtime voice agent is ready for users
                <ComposerVoiceToggle />
                */}
                {slots?.sendAdornment}
                <ComposerButtons
                  isRunning={isRunning}
                  requireProfileHydration={requireProfileHydration}
                  hasPillMentions={pillMentions.length > 0}
                  onFlushPillMentions={flushPillMentions}
                  onSendWithPillMentions={sendWithPillMentions}
                />
              </div>
            </div>
          </>
        )}
        {slots?.belowInput}
      </ComposerPrimitive.Root>
      {/* Erinnerungshinweis nach Art. 50 Abs. 4 KI-VO — er begründet die
          Ausnahme von der Kennzeichnungspflicht für KI-Text und muss deshalb an
          jedem Eingabefeld stehen, auch auf dem Telefon. Bis `sm` steht die
          Kurzfassung, damit der Hinweis über der Tastatur nicht drei Zeilen
          frisst; darüber die volle. */}
      <p
        className={cn(
          'mt-1 text-center text-foreground-muted',
          isCompact ? 'text-[11px]' : 'text-xs'
        )}
      >
        <span className="sm:hidden">{disclaimerCompact}</span>
        <span className="hidden sm:inline">{isCompact ? disclaimerCompact : disclaimer}</span>
      </p>
    </div>
  );
});
