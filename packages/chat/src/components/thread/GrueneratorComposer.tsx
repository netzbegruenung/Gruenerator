'use client';

import { useRef, useState, useCallback } from 'react';
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
import { PlusMenu } from './PlusMenu';
import { getCaretCoords } from '../../lib/caretPosition';
import { registerDocumentSlug } from '../../lib/documentMentionables';
import type { Mentionable } from '../../lib/mentionables';
import type { DocumentMention } from '../../lib/documentMentionables';

interface GrueneratorComposerProps {
  isRunning?: boolean;
  toolbarExtra?: React.ReactNode;
}

function SendButton() {
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

function ComposerButtons({ isRunning }: { isRunning?: boolean }) {
  const isDictating = useAuiState((s) => s.composer.dictation != null);
  const hasDictation = useAuiState((s) => s.thread.capabilities.dictation);
  const isEmpty = useAuiState((s) => s.composer.isEmpty);

  if (isRunning) return <CancelButton />;
  if (isDictating) return <StopDictationButton />;
  if (hasDictation && isEmpty) return <DictateButton />;
  return <SendButton />;
}

interface MentionState {
  visible: boolean;
  mode: 'functions' | 'skills' | 'datei';
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

export function GrueneratorComposer({ isRunning, toolbarExtra }: GrueneratorComposerProps) {
  const composerRuntime = useComposerRuntime();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const uploadRef = useRef<HTMLButtonElement>(null);
  const [mention, setMention] = useState<MentionState>(INITIAL_MENTION_STATE);

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

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      // Don't interfere when file browser is open
      if (mention.mode === 'datei') return;

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

      // In datei mode, only handle Escape (cmdk handles arrow keys internally)
      if (mention.mode === 'datei') {
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

  return (
    <div className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <ComposerPrimitive.Root className="composer-root relative mx-auto flex w-full max-w-3xl flex-col rounded-3xl border border-border bg-surface shadow-sm transition-shadow focus-within:shadow-md focus-within:border-primary/30">
        <ComposerPrimitive.Quote className="mx-4 mt-4 flex items-start gap-2 rounded-r-lg border-l-4 border-primary/40 bg-primary/5 px-3 py-2 text-sm">
          <ComposerPrimitive.QuoteText className="line-clamp-2 flex-1 italic text-foreground-muted" />
          <ComposerPrimitive.QuoteDismiss className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-foreground-muted hover:text-foreground">
            <X className="h-3 w-3" />
          </ComposerPrimitive.QuoteDismiss>
        </ComposerPrimitive.Quote>

        <ComposerAttachments />

        {mention.mode === 'datei' ? (
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
        )}

        <ComposerPrimitive.Input
          ref={textareaRef}
          autoFocus
          placeholder="Nachricht schreiben..."
          className="min-h-[3rem] max-h-40 w-full flex-grow resize-none bg-transparent px-5 pt-4 pb-2 text-foreground outline-none placeholder:text-foreground-muted/60"
          onChange={handleChange}
          onKeyDown={handleKeyDown}
        />

        <div className="flex items-center justify-between px-2 pb-2">
          <div className="flex items-center gap-0.5">
            <ComposerPrimitive.AddAttachment asChild>
              <button ref={uploadRef} className="hidden" aria-hidden="true" />
            </ComposerPrimitive.AddAttachment>
            <PlusMenu
              onInsertMention={handleSelect}
              onOpenFileBrowser={handlePlusMenuOpenFileBrowser}
              onUploadFile={handlePlusMenuUpload}
            />
            <ToolToggles />
            {toolbarExtra}
          </div>
          <ComposerButtons isRunning={isRunning} />
        </div>
      </ComposerPrimitive.Root>
      <p className="mt-2 text-center text-xs text-foreground-muted">
        Grünerator kann Fehler machen. Wichtige Infos bitte prüfen.
      </p>
    </div>
  );
}
