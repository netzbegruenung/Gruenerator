import { useCallback, useEffect, useState } from 'react';
import { autoUpdate, flip, offset, shift, useFloating } from '@floating-ui/react';
import { formatRelativeTime } from '@gruenerator/shared/utils';
import { FiCheck, FiX } from 'react-icons/fi';
import type { BlockNoteEditor } from '@blocknote/core';
import type { EditorView } from 'prosemirror-view';
import type * as Y from 'yjs';

import {
  acceptSuggestionById,
  findSuggestionMarkEl,
  getSuggestionIdAtSelection,
  observeSuggestionMeta,
  rejectSuggestionById,
  type SuggestionMeta,
} from '../../lib/suggestionMode';

interface SuggestionPopoverProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editor: BlockNoteEditor<any, any, any>;
  ydoc: Y.Doc | null | undefined;
  canEdit: boolean;
}

/**
 * Floating review card for the track-changes suggestion under the cursor. Shows
 * the author + time; editors get Annehmen/Ablehnen, viewers see it read-only.
 */
export function SuggestionPopover({ editor, ydoc, canEdit }: SuggestionPopoverProps) {
  const [activeId, setActiveId] = useState<number | null>(null);
  const [meta, setMeta] = useState<SuggestionMeta | null>(null);

  const { refs, floatingStyles } = useFloating({
    placement: 'top',
    strategy: 'fixed',
    middleware: [offset(6), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
    open: activeId !== null,
  });

  useEffect(() => {
    if (!editor || !ydoc) return;

    const close = () => {
      setActiveId(null);
      setMeta(null);
      refs.setReference(null);
    };

    const recompute = () => {
      const view = editor.prosemirrorView;
      if (!view) return close();
      const id = getSuggestionIdAtSelection(view.state);
      if (id == null) return close();
      // Only open once we've anchored to a real element — otherwise floating-ui
      // would pin the card to (0,0) with a null reference.
      const el = findSuggestionMarkEl(view, id);
      if (!el) return close();
      setMeta(ydoc.getMap<SuggestionMeta>('suggestions').get(String(id)) ?? null);
      setActiveId(id);
      refs.setReference(el);
    };

    const unsubSelection = editor.onSelectionChange(recompute);
    const unsubChange = editor.onChange(recompute);
    // Re-read when attribution metadata changes (author/color arriving, remote
    // updates) so the open card refreshes without needing a reselect.
    const unsubMeta = observeSuggestionMeta(ydoc, recompute);
    recompute();

    return () => {
      unsubSelection?.();
      unsubChange?.();
      unsubMeta();
    };
  }, [editor, ydoc, refs]);

  const runAction = useCallback(
    (action: (view: EditorView, ydoc: Y.Doc, id: number) => void) => {
      if (activeId == null || !ydoc) return;
      const view = editor.prosemirrorView;
      if (!view) return;
      action(view, ydoc, activeId);
      setActiveId(null);
      view.focus();
    },
    [activeId, editor, ydoc]
  );

  if (activeId == null) return null;

  return (
    <div
      ref={refs.setFloating}
      style={floatingStyles}
      className="z-[500] min-w-[220px] rounded-xl border border-black/8 bg-white/95 p-3 shadow-[0_4px_24px_rgba(0,0,0,0.12)] backdrop-blur-xl dark:border-white/10 dark:bg-grey-900/95"
    >
      <div className="text-[0.6875rem] font-medium uppercase tracking-wide text-grey-400">
        Änderungsvorschlag
      </div>
      <div className="mt-1 flex items-center gap-2">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: meta?.color ?? '#9ca3af' }}
        />
        <span className="text-sm font-medium text-foreground">{meta?.name ?? 'Unbekannt'}</span>
      </div>
      {meta?.createdAt && (
        <div className="mt-0.5 pl-[1.125rem] text-xs text-grey-500 dark:text-grey-400">
          {formatRelativeTime(meta.createdAt)}
        </div>
      )}
      {canEdit && (
        <div className="mt-2.5 flex gap-2">
          <button
            onClick={() => runAction(acceptSuggestionById)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary-600 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-700 [&_svg]:h-3.5 [&_svg]:w-3.5"
          >
            <FiCheck />
            Annehmen
          </button>
          <button
            onClick={() => runAction(rejectSuggestionById)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-grey-200 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-grey-100 dark:border-grey-700 dark:hover:bg-grey-800 [&_svg]:h-3.5 [&_svg]:w-3.5"
          >
            <FiX />
            Ablehnen
          </button>
        </div>
      )}
    </div>
  );
}
