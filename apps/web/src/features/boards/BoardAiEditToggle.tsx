'use client';

import { composerToolbarButtonClass, useChatDensity } from '@gruenerator/chat';
import { Pencil, PencilOff } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

const STORAGE_PREFIX = 'gruenerator.boards.ai-edit.';

function storageKey(boardId: string): string {
  return `${STORAGE_PREFIX}${boardId}`;
}

function readInitial(boardId: string): boolean {
  if (typeof window === 'undefined') return true;
  const raw = window.localStorage.getItem(storageKey(boardId));
  if (raw === null) return true;
  return raw === 'true';
}

/**
 * Per-board "AI may edit the board" toggle. When off, the assistant answers
 * questions but does not mutate the board (the classifier gates on
 * `enabledTools.edit_current_board`). Mirrors useDocAiEditEnabled.
 */
export function useBoardAiEditEnabled(boardId: string): {
  enabled: boolean;
  toggle: () => void;
} {
  const [enabled, setEnabled] = useState<boolean>(() => readInitial(boardId));

  useEffect(() => {
    // Re-read the persisted per-board toggle when switching boards; intentional sync.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEnabled(readInitial(boardId));
  }, [boardId]);

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(storageKey(boardId), String(next));
      }
      return next;
    });
  }, [boardId]);

  return { enabled, toggle };
}

interface BoardAiEditToggleProps {
  enabled: boolean;
  onToggle: () => void;
}

export function BoardAiEditToggle({ enabled, onToggle }: BoardAiEditToggleProps) {
  const isCompact = useChatDensity() === 'compact';
  const Icon = enabled ? Pencil : PencilOff;
  const label = isCompact ? (enabled ? 'An' : 'Aus') : enabled ? 'Bearbeiten an' : 'Nur lesen';
  const title = enabled
    ? 'KI darf dieses Board bearbeiten. Klicken zum Sperren.'
    : 'KI ist im Lesemodus. Klicken, damit die KI das Board bearbeiten darf.';

  return (
    <button
      type="button"
      onClick={onToggle}
      className={composerToolbarButtonClass(isCompact)}
      aria-pressed={enabled}
      title={title}
    >
      <Icon className={isCompact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
      <span>{label}</span>
    </button>
  );
}
