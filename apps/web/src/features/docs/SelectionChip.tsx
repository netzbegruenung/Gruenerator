'use client';

import { useEditorStore } from '@gruenerator/docs';
import { useEffect, useState } from 'react';
import { FiCornerDownRight } from 'react-icons/fi';

interface SelectionChipProps {
  documentId: string;
}

function truncate(text: string, max = 60): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export function SelectionChip({ documentId }: SelectionChipProps) {
  const [selection, setSelection] = useState<string>('');

  // Poll the editor's selection every 400ms — BlockNote doesn't expose a
  // ref-stable subscription for selection text, and a focus listener would
  // miss the case where the user selects + immediately clicks the composer.
  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      const editor = useEditorStore.getState().getEditor(documentId);
      const next = editor?.getSelectedText() ?? '';
      if (!cancelled) setSelection((prev) => (prev === next ? prev : next));
    };
    tick();
    const id = window.setInterval(tick, 400);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [documentId]);

  if (!selection) return null;

  return (
    <div className="mx-4 mt-3 flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-1.5 text-[12px] text-foreground-muted">
      <FiCornerDownRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/70" />
      <span className="flex-1 italic">Auswahl: „{truncate(selection)}"</span>
    </div>
  );
}
