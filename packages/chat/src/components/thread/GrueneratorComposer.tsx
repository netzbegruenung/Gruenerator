'use client';

import { memo, useRef, useState, useCallback } from 'react';
import { ComposerPrimitive, useComposerRuntime } from '@assistant-ui/react';
import { useAuiState } from '@assistant-ui/store';
import { ArrowUp, Mic, Square, X } from 'lucide-react';
import { ToolToggles } from '../ToolToggles';
import { ComposerAttachments } from '../assistant-ui/attachment';
import { MentionPopover } from './MentionPopover';
import { SkillPopover } from './SkillPopover';
import { detectMention } from '../../lib/mentionDetection';
import { getFilteredForMode } from '../../lib/mentionDetection';
import { computeMentionInsertion } from '../../lib/mentionInsertion';
import { FileMentionPopover } from './FileMentionPopover';
import { CollabDocMentionPopover, type CollabDocSelection } from './CollabDocMentionPopover';
import { PlusMenu } from './PlusMenu';
import { ModelPicker } from './ModelPicker';
import { getCaretCoords } from '../../lib/caretPosition';
import { registerDocumentSlug } from '../../lib/documentMentionables';
import { useMentionablesQuery } from '../../hooks/useMentionablesQuery';
import type { Mentionable } from '../../lib/mentionables';
import type { DocumentMention } from '../../lib/documentMentionables';
import { useUserProfileStore } from '../../stores/userProfileStore';

interface GrueneratorComposerProps {
  isRunning?: boolean;
  toolbarExtra?: React.ReactNode;
  onNavigate?: (path: string) => void;
  firstName?: string | null;
  placeholder?: string;
  disclaimer?: string;
  showMentions?: boolean;
  showPlusMenu?: boolean;
  showToolToggles?: boolean;
  /**
   * If true, the send button shows a spinner and is disabled until
   * `useUserProfileStore.isHydrated === true`. Use in apps where roles
   * must be loaded before the first message is sent. Default: false
   * (mobile/desktop consumers without a hydration bridge are unaffected).
   */
  requireProfileHydration?: boolean;
}

function SendButton({ requireProfileHydration }: { requireProfileHydration?: boolean }) {
  const isHydrated = useUserProfileStore((s) => s.isHydrated);

  if (requireProfileHydration && !isHydrated) {
    return (
      <button
        type="button"
        disabled
        aria-label="Profil wird geladen"
        title="Profil wird geladen…"
        className="m-2 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-white opacity-30"
      >
        <span className="block h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
      </button>
    );
  }

  return (
    <ComposerPrimitive.Send
      className="m-2 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-white transition-opacity disabled:opacity-30"
      aria-label="Nachricht senden"
    >
      <ArrowUp className="h-5 w-5" />
    </ComposerPrimitive.Send>
  );
}

function CancelButton() {
  return (
    <ComposerPrimitive.Cancel
      className="m-2 flex h-8 w-8 items-center justify-center rounded-full bg-error text-white transition-opacity"
      aria-label="Abbrechen"
    >
      <Square className="h-4 w-4" />
    </ComposerPrimitive.Cancel>
  );
}

function DictateButton() {
  return (
    <ComposerPrimitive.Dictate
      className="m-2 flex h-8 w-8 items-center justify-center rounded-full text-foreground-muted transition-colors hover:bg-grey-100 hover:text-foreground dark:hover:bg-grey-800"
      aria-label="Diktat starten"
    >
      <Mic className="h-5 w-5" />
    </ComposerPrimitive.Dictate>
  );
}

function StopDictationButton() {
  return (
    <ComposerPrimitive.StopDictation
      className="m-2 flex h-8 w-8 items-center justify-center rounded-full bg-error text-white transition-opacity animate-pulse"
      aria-label="Diktat beenden"
    >
      <Square className="h-4 w-4" />
    </ComposerPrimitive.StopDictation>
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
  mode: 'functions' | 'skills' | 'datei' | 'docs';
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
  showMentions = true,
  showPlusMenu = true,
  showToolToggles = true,
  requireProfileHydration = false,
}: GrueneratorComposerProps) {
  const composerRuntime = useComposerRuntime();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const uploadRef = useRef<HTMLButtonElement>(null);
  const [mention, setMention] = useState<MentionState>(INITIAL_MENTION_STATE);

  // Composer mount drives lazy fetching of mentionable data (custom agents,
  // boards, docs). The query is deduplicated across consumers via React Query.
  useMentionablesQuery();

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

      // When user selects the @docs trigger, switch to collab doc picker mode
      if (mentionable.type === 'doc' && mentionable.identifier === 'docs-picker-trigger') {
        setMention((prev) => ({ ...prev, mode: 'docs' }));
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

      composerRuntime.setText(newText);
      dismissPopover();

      requestAnimationFrame(() => {
        textarea.setSelectionRange(cursorPosition, cursorPosition);
        textarea.focus();
      });
    },
    [composerRuntime, mention.mentionStart, dismissPopover]
  );

  const handleDocumentSelect = useCallback(
    (doc: DocumentMention) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      registerDocumentSlug(doc.slug, doc);

      const currentText = composerRuntime.getState().text;
      const insertAt = mention.mentionStart >= 0 ? mention.mentionStart : currentText.length;
      const before = currentText.slice(0, insertAt);
      const after = mention.mentionStart >= 0 ? currentText.slice(textarea.selectionStart) : '';
      const prefix =
        before.length > 0 && !before.endsWith(' ') && mention.mentionStart < 0 ? ' ' : '';
      const mentionText = `@datei:${doc.slug}`;
      const newText = `${before}${prefix}${mentionText} ${after}`;

      composerRuntime.setText(newText);
      dismissPopover();

      requestAnimationFrame(() => {
        const cursorPos = before.length + prefix.length + mentionText.length + 1;
        textarea.setSelectionRange(cursorPos, cursorPos);
        textarea.focus();
      });
    },
    [composerRuntime, mention.mentionStart, dismissPopover]
  );

  const handleCollabDocSelect = useCallback(
    (doc: CollabDocSelection) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const currentText = composerRuntime.getState().text;
      const insertAt = mention.mentionStart >= 0 ? mention.mentionStart : currentText.length;
      const before = currentText.slice(0, insertAt);
      const after = mention.mentionStart >= 0 ? currentText.slice(textarea.selectionStart) : '';
      const prefix =
        before.length > 0 && !before.endsWith(' ') && mention.mentionStart < 0 ? ' ' : '';
      const mentionText = `@${doc.slug}`;
      const newText = `${before}${prefix}${mentionText} ${after}`;

      composerRuntime.setText(newText);
      dismissPopover();

      requestAnimationFrame(() => {
        const cursorPos = before.length + prefix.length + mentionText.length + 1;
        textarea.setSelectionRange(cursorPos, cursorPos);
        textarea.focus();
      });
    },
    [composerRuntime, mention.mentionStart, dismissPopover]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      // Don't interfere when file/doc browser is open
      if (mention.mode === 'datei' || mention.mode === 'docs') return;

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

      // In datei/docs mode, only handle Escape (cmdk handles arrow keys internally)
      if (mention.mode === 'datei' || mention.mode === 'docs') {
        if (e.key === 'Escape') {
          e.preventDefault();
          dismissPopover();
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

  const handlePlusMenuOpenDocBrowser = useCallback(() => {
    setMention((prev) => ({ ...prev, mode: 'docs', visible: true, mentionStart: -1 }));
  }, []);

  return (
    <div className="px-4 pb-[max(0.25rem,env(safe-area-inset-bottom))] sm:pb-[max(1rem,env(safe-area-inset-bottom))]">
      <ComposerPrimitive.Root className="composer-root relative mx-auto flex w-full max-w-3xl flex-col rounded-3xl border border-border bg-white shadow-lg transition-shadow focus-within:shadow-xl focus-within:border-primary/30 dark:bg-surface dark:shadow-sm dark:focus-within:shadow-md">
        <ComposerPrimitive.Quote className="mx-4 mt-4 flex items-start gap-2 rounded-r-lg border-l-4 border-primary/40 bg-primary/5 px-3 py-2 text-sm">
          <ComposerPrimitive.QuoteText className="line-clamp-2 flex-1 italic text-foreground-muted" />
          <ComposerPrimitive.QuoteDismiss className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-foreground-muted hover:text-foreground">
            <X className="h-3 w-3" />
          </ComposerPrimitive.QuoteDismiss>
        </ComposerPrimitive.Quote>

        <ComposerAttachments />

        {showMentions &&
          (mention.mode === 'docs' ? (
            <CollabDocMentionPopover
              visible={mention.visible}
              onSelect={handleCollabDocSelect}
              onDismiss={dismissPopover}
            />
          ) : mention.mode === 'datei' ? (
            <FileMentionPopover
              visible={mention.visible}
              onSelect={handleDocumentSelect}
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
          maxRows={8}
          className="min-h-0 w-full flex-grow resize-none bg-transparent px-5 pt-3.5 pb-2.5 text-foreground outline-none placeholder:text-foreground-muted/60"
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
                onOpenDocBrowser={handlePlusMenuOpenDocBrowser}
                onUploadFile={handlePlusMenuUpload}
              />
            )}
            {showToolToggles && <ToolToggles onNavigate={onNavigate} firstName={firstName} />}
            {toolbarExtra}
          </div>
          <div className="flex items-center gap-0.5">
            <ModelPicker />
            <ComposerButtons
              isRunning={isRunning}
              requireProfileHydration={requireProfileHydration}
            />
          </div>
        </div>
      </ComposerPrimitive.Root>
      <p className="mt-1 hidden text-center text-xs text-foreground-muted sm:block">{disclaimer}</p>
    </div>
  );
});
