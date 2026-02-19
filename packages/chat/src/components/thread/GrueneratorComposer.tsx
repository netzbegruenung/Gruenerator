'use client';

import { useRef, useState, useCallback } from 'react';
import { ComposerPrimitive, useComposerRuntime } from '@assistant-ui/react';
import { ArrowUp, Square, X } from 'lucide-react';
import { ToolToggles } from '../ToolToggles';
import { ComposerAttachments } from '../assistant-ui/attachment';
import { MentionPopover, filterMentionables } from './MentionPopover';
import { SkillPopover, getFilteredSkills } from './SkillPopover';
import { FileMentionPopover } from './FileMentionPopover';
import { DocumentChatPicker } from './DocumentChatPicker';
import { PlusMenu } from './PlusMenu';
import { getCaretCoords } from '../../lib/caretPosition';
import { registerDocumentSlug } from '../../lib/documentMentionables';
import { useDocumentChatStore } from '../../stores/documentChatStore';
import type { Mentionable } from '../../lib/mentionables';
import type { DocumentMention } from '../../lib/documentMentionables';

interface GrueneratorComposerProps {
  isRunning?: boolean;
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

interface MentionState {
  visible: boolean;
  mode: 'functions' | 'skills' | 'datei' | 'documentchat';
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

export function GrueneratorComposer({ isRunning }: GrueneratorComposerProps) {
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

      // When user selects @dokumentchat, switch to document chat picker
      if (mentionable.type === 'tool' && mentionable.identifier === 'documentchat') {
        setMention((prev) => ({ ...prev, mode: 'documentchat' }));
        return;
      }

      const currentText = composerRuntime.getState().text;
      const trigger = mentionable.category === 'skill' ? '/' : '@';

      // If coming from PlusMenu (mentionStart === -1), insert at end of text
      const insertAt = mention.mentionStart >= 0 ? mention.mentionStart : currentText.length;
      const before = currentText.slice(0, insertAt);
      const after = mention.mentionStart >= 0 ? currentText.slice(textarea.selectionStart) : '';
      const prefix =
        before.length > 0 && !before.endsWith(' ') && mention.mentionStart < 0 ? ' ' : '';
      const ctxSuffix = mentionable.contextPrefix ? `${mentionable.contextPrefix} ` : '';
      const newText = `${before}${prefix}${trigger}${mentionable.mention} ${ctxSuffix}${after}`;

      composerRuntime.setText(newText);
      dismissPopover();

      requestAnimationFrame(() => {
        const cursorPos =
          before.length + prefix.length + mentionable.mention.length + 2 + ctxSuffix.length; // +2 for trigger and space
        textarea.setSelectionRange(cursorPos, cursorPos);
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
      // Don't interfere when file browser or document chat picker is open
      if (mention.mode === 'datei' || mention.mode === 'documentchat') return;

      const textarea = e.target;
      const text = textarea.value;
      const caret = textarea.selectionStart;
      const textBeforeCaret = text.slice(0, caret);

      // Look backward from caret for a trigger character (@ or /)
      const atIndex = textBeforeCaret.lastIndexOf('@');
      const slashIndex = textBeforeCaret.lastIndexOf('/');

      // Pick the closest trigger to the caret
      const candidates: { index: number; trigger: '@' | '/'; mode: 'functions' | 'skills' }[] = [];

      if (atIndex >= 0) {
        const charBefore = atIndex > 0 ? text[atIndex - 1] : ' ';
        const queryStr = textBeforeCaret.slice(atIndex + 1);
        const hasSpace = queryStr.includes(' ');
        if ((charBefore === ' ' || charBefore === '\n' || atIndex === 0) && !hasSpace) {
          candidates.push({ index: atIndex, trigger: '@', mode: 'functions' });
        }
      }

      if (slashIndex >= 0) {
        const charBefore = slashIndex > 0 ? text[slashIndex - 1] : ' ';
        const queryStr = textBeforeCaret.slice(slashIndex + 1);
        const hasSpace = queryStr.includes(' ');
        if ((charBefore === ' ' || charBefore === '\n' || slashIndex === 0) && !hasSpace) {
          // Skip if this looks like a URL (has :// before the /)
          const textBeforeSlash = text.slice(0, slashIndex);
          const isUrl = textBeforeSlash.endsWith(':') || textBeforeSlash.endsWith(':/');
          if (!isUrl) {
            candidates.push({ index: slashIndex, trigger: '/', mode: 'skills' });
          }
        }
      }

      if (candidates.length > 0) {
        // Use the candidate closest to the caret (highest index)
        const best = candidates.reduce((a, b) => (a.index > b.index ? a : b));
        const queryStr = textBeforeCaret.slice(best.index + 1);
        const coords = getCaretCoords(textarea, best.index);
        setMention({
          visible: true,
          mode: best.mode,
          query: queryStr,
          selectedIndex: 0,
          anchorRect: coords,
          mentionStart: best.index,
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

      // In datei/documentchat mode, only handle Escape (cmdk handles arrow keys internally)
      if (mention.mode === 'datei' || mention.mode === 'documentchat') {
        if (e.key === 'Escape') {
          e.preventDefault();
          dismissPopover();
        }
        return;
      }

      const filtered =
        mention.mode === 'skills'
          ? getFilteredSkills(mention.query)
          : filterMentionables(mention.query);
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

  const documentChatIds = useDocumentChatStore((s) => s.documentChatIds);
  const setDocumentChatIds = useDocumentChatStore((s) => s.setDocumentChatIds);
  const removeDocumentChatId = useDocumentChatStore((s) => s.removeDocumentChatId);

  const handleDocumentChatConfirm = useCallback(
    (ids: string[]) => {
      const textarea = textareaRef.current;
      setDocumentChatIds(ids);

      const currentText = composerRuntime.getState().text;
      const insertAt = mention.mentionStart >= 0 ? mention.mentionStart : currentText.length;
      const before = currentText.slice(0, insertAt);
      const after =
        mention.mentionStart >= 0
          ? textarea
            ? currentText.slice(textarea.selectionStart)
            : ''
          : '';
      const prefix =
        before.length > 0 && !before.endsWith(' ') && mention.mentionStart < 0 ? ' ' : '';
      const newText = `${before}${prefix}@dokumentchat ${after}`;

      composerRuntime.setText(newText);
      dismissPopover();

      requestAnimationFrame(() => {
        if (!textarea) return;
        const cursorPos = before.length + prefix.length + '@dokumentchat '.length;
        textarea.setSelectionRange(cursorPos, cursorPos);
        textarea.focus();
      });
    },
    [composerRuntime, mention.mentionStart, dismissPopover, setDocumentChatIds]
  );

  const handlePlusMenuUpload = useCallback(() => {
    uploadRef.current?.click();
  }, []);

  const handlePlusMenuOpenFileBrowser = useCallback(() => {
    setMention((prev) => ({ ...prev, mode: 'datei', visible: true, mentionStart: -1 }));
  }, []);

  return (
    <div className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <ComposerPrimitive.Root className="relative mx-auto flex w-full max-w-3xl flex-col rounded-3xl border border-border bg-surface">
        <ComposerPrimitive.Quote className="mx-3 mt-3 flex items-start gap-2 rounded-r-lg border-l-4 border-primary/40 bg-primary/5 px-3 py-2 text-sm">
          <ComposerPrimitive.QuoteText className="line-clamp-2 flex-1 italic text-foreground-muted" />
          <ComposerPrimitive.QuoteDismiss className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-foreground-muted hover:text-foreground">
            <X className="h-3 w-3" />
          </ComposerPrimitive.QuoteDismiss>
        </ComposerPrimitive.Quote>

        <ComposerAttachments />

        {documentChatIds.length > 0 && (
          <div className="mx-3 mt-2 flex flex-wrap gap-1.5">
            {documentChatIds.map((id) => (
              <span
                key={id}
                className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"
              >
                <span>💬</span>
                <span className="max-w-[120px] truncate">{id.slice(0, 8)}...</span>
                <button
                  type="button"
                  onClick={() => removeDocumentChatId(id)}
                  className="ml-0.5 rounded-full p-0.5 hover:bg-indigo-200 dark:hover:bg-indigo-800"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {mention.mode === 'documentchat' ? (
          <DocumentChatPicker
            visible={mention.visible}
            onConfirm={handleDocumentChatConfirm}
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
        )}

        <div className="flex items-center">
          <div className="input-tools-button flex items-center gap-1">
            <ComposerPrimitive.AddAttachment asChild>
              <button ref={uploadRef} className="hidden" aria-hidden="true" />
            </ComposerPrimitive.AddAttachment>
            <PlusMenu
              onInsertMention={handleSelect}
              onOpenFileBrowser={handlePlusMenuOpenFileBrowser}
              onUploadFile={handlePlusMenuUpload}
            />
            <ToolToggles />
          </div>
          <ComposerPrimitive.Input
            ref={textareaRef}
            autoFocus
            placeholder="Nachricht schreiben — /presse, @websearch, @bundestag..."
            className="h-12 max-h-40 flex-grow resize-none bg-transparent p-3.5 pl-2 text-foreground outline-none placeholder:text-foreground-muted"
            onChange={handleChange}
            onKeyDown={handleKeyDown}
          />
          {isRunning ? <CancelButton /> : <SendButton />}
        </div>
      </ComposerPrimitive.Root>
      <p className="mt-2 text-center text-xs text-foreground-muted">
        Grünerator kann Fehler machen. Wichtige Infos bitte prüfen.
      </p>
    </div>
  );
}
