'use client';

import { memo, useRef, useState, useCallback, useEffect } from 'react';
import {
  AuiIf,
  ComposerPrimitive,
  useComposerRuntime,
  useVoiceControls,
  useVoiceState,
} from '@assistant-ui/react';
import { useAuiState } from '@assistant-ui/store';
import { ArrowUp, Mic, Square, X } from 'lucide-react';
import { RiVoiceAiFill } from 'react-icons/ri';
import { cn } from '@gruenerator/ui';
import { useScopedAgentId } from '../../lib/useScopedAgentState';
import { useAgentStore, type ThreadMode } from '../../stores/chatStore';
import { ToolToggles } from '../ToolToggles';
import { SearchDepthToggle } from '../SearchDepthToggle';
import { getSystemAgent } from '@gruenerator/shared/agents';
import { ComposerAttachments } from '../assistant-ui/attachment';
import { MentionPopover } from './MentionPopover';
import { SkillPopover } from './SkillPopover';
import { detectMention } from '../../lib/mentionDetection';
import { getFilteredForMode } from '../../lib/mentionDetection';
import { computeMentionInsertion } from '../../lib/mentionInsertion';
import { FileMentionPopover } from './FileMentionPopover';
import { WolkeMentionPopover } from './WolkeMentionPopover';
import { ConnectMentionPopover } from './ConnectMentionPopover';
import { CanvaMentionPopover } from './CanvaMentionPopover';
import { VorlagenMentionPopover } from './VorlagenMentionPopover';
import type { CollabDocSelection } from '../../lib/documentMentionables';
import type {
  WolkeFileToken,
  ConnectFileToken,
  CanvaDesignToken,
  VorlageToken,
} from '../../lib/mentionables';
import { PlusMenu } from './PlusMenu';
import { ModelPicker } from './ModelPicker';
import { getCaretCoords } from '../../lib/caretPosition';
import { registerDocumentSlug } from '../../lib/documentMentionables';
import { useMentionablesQuery } from '../../hooks/useMentionablesQuery';
import { useChatDensity } from './chatDensityContext';
import type { Mentionable } from '../../lib/mentionables';
import type { DocumentMention } from '../../lib/documentMentionables';
import { useUserProfileStore } from '../../stores/userProfileStore';
import { handleAttachmentAddError } from '../../lib/attachmentErrorHandler';

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
  modelPickerThreadModeOverride?: ThreadMode;
  insideAgent?: boolean;
  /** Render-prop slots for surface-specific UI. */
  slots?: {
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
}

const ROUND_BTN_BASE = 'flex items-center justify-center rounded-full transition-opacity';
const roundBtnSize = (isCompact: boolean) => (isCompact ? 'm-1.5 h-7 w-7' : 'm-2 h-8 w-8');

function SearchDepthToggleSlot() {
  const selectedAgentId = useScopedAgentId();
  const agent = selectedAgentId ? getSystemAgent(selectedAgentId) : null;
  if (agent?.routeTo !== 'search') return null;
  return <SearchDepthToggle />;
}

function SendButton({ requireProfileHydration }: { requireProfileHydration?: boolean }) {
  const isCompact = useChatDensity() === 'compact';
  const isHydrated = useUserProfileStore((s) => s.isHydrated);

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

  return (
    <ComposerPrimitive.Send
      className={`${roundBtnSize(isCompact)} ${ROUND_BTN_BASE} bg-primary text-white disabled:opacity-30`}
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
      className={`${roundBtnSize(isCompact)} ${ROUND_BTN_BASE} bg-error text-white`}
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
      className={`${roundBtnSize(isCompact)} flex items-center justify-center rounded-full text-foreground-muted transition-colors hover:bg-grey-100 hover:text-foreground dark:hover:bg-grey-800`}
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
      className={`${roundBtnSize(isCompact)} ${ROUND_BTN_BASE} bg-error text-white animate-pulse`}
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
}: {
  isRunning?: boolean;
  requireProfileHydration?: boolean;
}) {
  const isDictating = useAuiState((s) => s.composer.dictation != null);
  const hasDictation = useAuiState((s) => s.thread.capabilities.dictation);
  const isEmpty = useAuiState((s) => s.composer.isEmpty);

  if (isRunning) return <CancelButton />;
  if (isDictating) return <StopDictationButton />;
  if (hasDictation && isEmpty) return <DictateButton />;
  return <SendButton requireProfileHydration={requireProfileHydration} />;
}

interface MentionState {
  visible: boolean;
  mode: 'functions' | 'skills' | 'datei' | 'wolke' | 'connect' | 'canva' | 'vorlagen';
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

export const GrueneratorComposer = memo(function GrueneratorComposer({
  isRunning,
  toolbarExtra,
  onNavigate,
  firstName,
  placeholder = 'Nachricht schreiben...',
  disclaimer = 'Grünerator kann Fehler machen. Wichtige Infos bitte prüfen.',
  disclaimerCompact = 'Kann Fehler machen.',
  showMentions = true,
  showPlusMenu = true,
  showToolToggles = true,
  showModelPicker = true,
  modelPickerThreadModeOverride,
  insideAgent = false,
  slots,
  requireProfileHydration = false,
}: GrueneratorComposerProps) {
  const composerRuntime = useComposerRuntime();
  const isCompact = useChatDensity() === 'compact';
  const isMistral = useAgentStore((s) => s.selectedProvider === 'mistral');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const uploadRef = useRef<HTMLButtonElement>(null);
  const [mention, setMention] = useState<MentionState>(INITIAL_MENTION_STATE);

  // Composer mount drives lazy fetching of mentionable data (custom agents,
  // boards, docs). The query is deduplicated across consumers via React Query.
  useMentionablesQuery();

  // AUI's file-input handler validates against the adapter's `accept` list and
  // throws a raw English error before our adapter's add() runs. Subscribe to
  // the structured event so the user sees a clean German toast instead.
  useEffect(
    () => composerRuntime.unstable_on('attachmentAddError', handleAttachmentAddError),
    [composerRuntime]
  );

  const dismissPopover = useCallback(() => setMention(INITIAL_MENTION_STATE), []);

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

      const currentText = composerRuntime.getState().text;
      const caretPosition =
        mention.mentionStart >= 0 ? textarea.selectionStart : currentText.length;
      const { newText, cursorPosition } = computeMentionInsertion(
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

      void composerRuntime.addAttachment({
        id: `gruenerator-datei-${doc.documentId}`,
        type: 'document',
        name: doc.documentTitle,
        contentType: `application/x-gruenerator-datei-${doc.sourceType}`,
        content: [
          {
            type: 'data',
            name: 'gruenerator-mention',
            data: {
              kind: 'document',
              documentId: doc.documentId,
              documentTitle: doc.documentTitle,
              collectionId: doc.collectionId,
              collectionName: doc.collectionName,
              slug: doc.slug,
              sourceType: doc.sourceType,
            },
          },
        ],
      });

      stripTriggerText();
      dismissPopover();
      requestAnimationFrame(() => textareaRef.current?.focus());
    },
    [composerRuntime, dismissPopover, stripTriggerText]
  );

  const handleCollabDocSelect = useCallback(
    (doc: CollabDocSelection) => {
      void composerRuntime.addAttachment({
        id: `gruenerator-collab-${doc.id}`,
        type: 'document',
        name: doc.title,
        contentType: 'application/x-gruenerator-collab-doc',
        content: [
          {
            type: 'data',
            name: 'gruenerator-mention',
            data: { kind: 'collab', id: doc.id, slug: doc.slug, title: doc.title },
          },
        ],
      });

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
        void composerRuntime.addAttachment({
          id: `gruenerator-wolke-${f.shareLinkId}:${f.path}`,
          type: 'document',
          name: f.name,
          contentType: 'application/x-gruenerator-wolke',
          content: [
            {
              type: 'data',
              name: 'gruenerator-mention',
              data: {
                kind: 'wolke',
                shareLinkId: f.shareLinkId,
                path: f.path,
                name: f.name,
              },
            },
          ],
        });
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
        void composerRuntime.addAttachment({
          id: `gruenerator-connect-${f.provider}:${f.fileId}`,
          type: 'document',
          name: f.name,
          contentType: 'application/x-gruenerator-connect',
          content: [
            {
              type: 'data',
              name: 'gruenerator-mention',
              data: {
                kind: 'connect',
                provider: f.provider,
                fileId: f.fileId,
                name: f.name,
                ...(f.mimeType ? { mimeType: f.mimeType } : {}),
              },
            },
          ],
        });
      }
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
      const links = designs.map((d) => `[🎨 ${d.title}](${d.viewUrl})`).join(' ');
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
        mention.mode === 'vorlagen'
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
          mode: detected.mode,
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
      if (!mention.visible) return;

      // In datei/docs mode, only handle Escape (cmdk handles arrow keys internally).
      // Enter is swallowed so the textarea doesn't submit the form while the picker
      // is open — the user must select via the picker or dismiss with Escape first.
      if (
        mention.mode === 'datei' ||
        mention.mode === 'wolke' ||
        mention.mode === 'connect' ||
        mention.mode === 'canva' ||
        mention.mode === 'vorlagen'
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

      const filtered = getFilteredForMode(mention.mode, mention.query);
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
      }
    },
    [
      mention.visible,
      mention.mode,
      mention.query,
      mention.selectedIndex,
      handleSelect,
      dismissPopover,
    ]
  );

  const handlePlusMenuUpload = useCallback(() => {
    uploadRef.current?.click();
  }, []);

  const handlePlusMenuOpenFileBrowser = useCallback(() => {
    setMention((prev) => ({ ...prev, mode: 'datei', visible: true, mentionStart: -1 }));
  }, []);

  return (
    <div className="px-4 pb-[max(0.25rem,env(safe-area-inset-bottom))] sm:pb-[max(1rem,env(safe-area-inset-bottom))]">
      <ComposerPrimitive.Root
        className={cn(
          'composer-root relative mx-auto flex w-full max-w-3xl flex-col rounded-3xl border bg-white shadow-lg transition-shadow focus-within:shadow-xl focus-within:border-primary/30 dark:bg-surface dark:shadow-sm dark:focus-within:shadow-md',
          isMistral ? 'border-[#003399]' : 'border-border'
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

        <ComposerAttachments />

        {slots?.aboveInput}

        {showMentions &&
          (mention.mode === 'datei' ? (
            <FileMentionPopover
              visible={mention.visible}
              onSelect={(s) =>
                s.kind === 'document' ? handleDocumentSelect(s.doc) : handleCollabDocSelect(s.doc)
              }
              onDismiss={dismissPopover}
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
          ) : mention.mode === 'skills' ? (
            <SkillPopover
              query={mention.query}
              visible={mention.visible}
              onSelect={handleSelect}
              onDismiss={dismissPopover}
              selectedIndex={mention.selectedIndex}
              anchorRect={mention.anchorRect}
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

        <ComposerPrimitive.Input
          ref={textareaRef}
          autoFocus={
            typeof window !== 'undefined' && !window.matchMedia('(pointer: coarse)').matches
          }
          placeholder={placeholder}
          minRows={1}
          maxRows={isCompact ? 4 : 8}
          className={
            isCompact
              ? 'min-h-0 w-full flex-grow resize-none bg-transparent px-3 pt-2 pb-1.5 text-[13px] text-foreground outline-none placeholder:text-foreground-muted/60'
              : 'min-h-0 w-full flex-grow resize-none bg-transparent px-5 pt-3.5 pb-2.5 text-foreground outline-none placeholder:text-foreground-muted/60'
          }
          onChange={showMentions ? handleChange : undefined}
          onKeyDown={showMentions ? handleKeyDown : undefined}
        />

        <div className="flex items-center justify-between px-2 pb-1">
          <div className="flex items-center gap-0.5">
            <ComposerPrimitive.AddAttachment asChild>
              <button ref={uploadRef} className="hidden" aria-hidden="true" />
            </ComposerPrimitive.AddAttachment>
            {showPlusMenu && (
              <PlusMenu
                onInsertMention={handleSelect}
                onOpenFileBrowser={handlePlusMenuOpenFileBrowser}
                onUploadFile={handlePlusMenuUpload}
                {...(onNavigate ? { onOpenSkillsPage: () => onNavigate('/agents') } : {})}
              />
            )}
            {showToolToggles && (
              <ToolToggles
                onNavigate={onNavigate}
                firstName={firstName}
                insideAgent={insideAgent}
              />
            )}
            {showToolToggles && <SearchDepthToggleSlot />}
            {toolbarExtra}
          </div>
          <div className="flex items-center gap-0.5">
            {showModelPicker && (
              <ModelPicker
                {...(modelPickerThreadModeOverride && {
                  threadModeOverride: modelPickerThreadModeOverride,
                })}
              />
            )}
            {/* TODO: re-enable when realtime voice agent is ready for users
            <ComposerVoiceToggle />
            */}
            {slots?.sendAdornment}
            <ComposerButtons
              isRunning={isRunning}
              requireProfileHydration={requireProfileHydration}
            />
          </div>
        </div>
        {slots?.belowInput}
      </ComposerPrimitive.Root>
      <p
        className={cn(
          'mt-1 hidden text-center text-foreground-muted sm:block',
          isCompact ? 'text-[11px]' : 'text-xs'
        )}
      >
        {isCompact ? disclaimerCompact : disclaimer}
      </p>
    </div>
  );
});
