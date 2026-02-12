'use client';

import { useRef, useState, useCallback } from 'react';
import { ComposerPrimitive, useComposerRuntime } from '@assistant-ui/react';
import { ArrowUp, Square, X } from 'lucide-react';
import { ToolToggles } from '../ToolToggles';
import { ComposerAttachments, ComposerAddAttachment } from '../assistant-ui/attachment';
import { MentionPopover, filterAgents } from './MentionPopover';
import { getCaretCoords } from '../../lib/caretPosition';
import type { AgentListItem } from '../../lib/agents';

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
  query: string;
  selectedIndex: number;
  anchorRect: { x: number; y: number } | null;
  mentionStart: number;
}

const INITIAL_MENTION_STATE: MentionState = {
  visible: false,
  query: '',
  selectedIndex: 0,
  anchorRect: null,
  mentionStart: -1,
};

export function GrueneratorComposer({ isRunning }: GrueneratorComposerProps) {
  const composerRuntime = useComposerRuntime();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [mention, setMention] = useState<MentionState>(INITIAL_MENTION_STATE);

  const dismissPopover = useCallback(() => setMention(INITIAL_MENTION_STATE), []);

  const handleSelect = useCallback(
    (agent: AgentListItem) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const currentText = composerRuntime.getState().text;
      const before = currentText.slice(0, mention.mentionStart);
      const after = currentText.slice(textarea.selectionStart);
      const newText = `${before}@${agent.mention} ${after}`;

      composerRuntime.setText(newText);
      dismissPopover();

      requestAnimationFrame(() => {
        const cursorPos = before.length + agent.mention.length + 2; // +2 for @ and space
        textarea.setSelectionRange(cursorPos, cursorPos);
        textarea.focus();
      });
    },
    [composerRuntime, mention.mentionStart, dismissPopover]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const textarea = e.target;
      const text = textarea.value;
      const caret = textarea.selectionStart;

      // Look backward from caret for an '@' trigger
      const textBeforeCaret = text.slice(0, caret);
      const atIndex = textBeforeCaret.lastIndexOf('@');

      if (atIndex >= 0) {
        // Only trigger if '@' is at start of text or preceded by whitespace
        const charBefore = atIndex > 0 ? text[atIndex - 1] : ' ';
        const queryStr = textBeforeCaret.slice(atIndex + 1);
        const hasSpace = queryStr.includes(' ');

        if ((charBefore === ' ' || charBefore === '\n' || atIndex === 0) && !hasSpace) {
          const coords = getCaretCoords(textarea, atIndex);
          setMention({
            visible: true,
            query: queryStr,
            selectedIndex: 0,
            anchorRect: coords,
            mentionStart: atIndex,
          });
          return;
        }
      }

      dismissPopover();
    },
    [dismissPopover]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (!mention.visible) return;

      const filtered = filterAgents(mention.query);
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
    [mention.visible, mention.query, mention.selectedIndex, handleSelect, dismissPopover]
  );

  return (
    <div className="px-4 pb-4">
      <ComposerPrimitive.Root className="relative mx-auto flex w-full max-w-3xl flex-col rounded-3xl border border-border bg-surface">
        <ComposerPrimitive.Quote className="mx-3 mt-3 flex items-start gap-2 rounded-r-lg border-l-4 border-primary/40 bg-primary/5 px-3 py-2 text-sm">
          <ComposerPrimitive.QuoteText className="line-clamp-2 flex-1 italic text-foreground-muted" />
          <ComposerPrimitive.QuoteDismiss className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-foreground-muted hover:text-foreground">
            <X className="h-3 w-3" />
          </ComposerPrimitive.QuoteDismiss>
        </ComposerPrimitive.Quote>

        <ComposerAttachments />

        <MentionPopover
          query={mention.query}
          visible={mention.visible}
          onSelect={handleSelect}
          onDismiss={dismissPopover}
          selectedIndex={mention.selectedIndex}
          anchorRect={mention.anchorRect}
        />

        <div className="flex items-end">
          <div className="input-tools-button flex items-center gap-1">
            <ComposerAddAttachment />
            <ToolToggles />
          </div>
          <ComposerPrimitive.Input
            ref={textareaRef}
            autoFocus
            placeholder="Nachricht schreiben — @presse, @antrag, @rede..."
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
