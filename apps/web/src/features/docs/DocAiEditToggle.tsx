'use client';

import { composerToolbarButtonClass, useChatDensity } from '@gruenerator/chat';
import { Pencil, PencilOff } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

const STORAGE_PREFIX = 'gruenerator.docs.ai-edit.';

function storageKey(documentId: string): string {
  return `${STORAGE_PREFIX}${documentId}`;
}

function readInitial(documentId: string): boolean {
  if (typeof window === 'undefined') return true;
  const raw = window.localStorage.getItem(storageKey(documentId));
  if (raw === null) return true;
  return raw === 'true';
}

export function useDocAiEditEnabled(documentId: string): {
  enabled: boolean;
  toggle: () => void;
} {
  const [enabled, setEnabled] = useState<boolean>(() => readInitial(documentId));

  useEffect(() => {
    setEnabled(readInitial(documentId));
  }, [documentId]);

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(storageKey(documentId), String(next));
      }
      return next;
    });
  }, [documentId]);

  return { enabled, toggle };
}

interface DocAiEditToggleProps {
  enabled: boolean;
  onToggle: () => void;
}

export function DocAiEditToggle({ enabled, onToggle }: DocAiEditToggleProps) {
  const isCompact = useChatDensity() === 'compact';
  const Icon = enabled ? Pencil : PencilOff;
  const label = isCompact ? (enabled ? 'An' : 'Aus') : enabled ? 'Bearbeiten an' : 'Nur lesen';
  const title = enabled
    ? 'KI darf dieses Dokument bearbeiten. Klicken zum Sperren.'
    : 'KI ist im Lesemodus. Klicken, damit die KI das Dokument bearbeiten darf.';

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
