import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
} from '@gruenerator/ui';
import { formatRelativeTime } from '@gruenerator/shared/utils';
import {
  applySuggestion,
  applySuggestions,
  revertSuggestion,
  revertSuggestions,
  selectSuggestion,
} from '@handlewithcare/prosemirror-suggest-changes';
import { useCallback, useState } from 'react';
import { FiCheck, FiEdit3, FiPlusCircle, FiTrash2, FiX } from 'react-icons/fi';
import type { BlockNoteEditor } from '@blocknote/core';
import type { Command } from 'prosemirror-state';
import type * as Y from 'yjs';

import { useDocSuggestions } from '../../hooks/useDocSuggestions';
import {
  clearSuggestionMeta,
  deleteSuggestionMeta,
  findSuggestionMarkEl,
  type DocSuggestion,
  type SuggestionKind,
} from '../../lib/suggestionMode';

interface SuggestionsSidebarProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editor: BlockNoteEditor<any, any, any>;
  ydoc: Y.Doc | null | undefined;
  canEdit: boolean;
}

const KIND_META: Record<
  SuggestionKind,
  { label: string; icon: typeof FiEdit3; className: string }
> = {
  insertion: { label: 'Einfügung', icon: FiPlusCircle, className: 'text-primary-600' },
  deletion: { label: 'Löschung', icon: FiTrash2, className: 'text-red-500' },
  modification: { label: 'Formatierung', icon: FiEdit3, className: 'text-amber-500' },
};

function primaryKind(kinds: SuggestionKind[]): SuggestionKind {
  if (kinds.includes('deletion')) return 'deletion';
  if (kinds.includes('insertion')) return 'insertion';
  return kinds[0] ?? 'modification';
}

export function SuggestionsSidebar({ editor, ydoc, canEdit }: SuggestionsSidebarProps) {
  const { suggestions } = useDocSuggestions(editor, ydoc);
  const [confirmAll, setConfirmAll] = useState<'accept' | 'reject' | null>(null);

  const runOne = useCallback(
    (id: number, make: (id: number) => Command) => {
      const view = editor.prosemirrorView;
      if (!view || !ydoc) return;
      make(id)(view.state, view.dispatch);
      deleteSuggestionMeta(ydoc, [id]);
    },
    [editor, ydoc]
  );

  const runAll = useCallback(
    (command: Command) => {
      const view = editor.prosemirrorView;
      if (!view || !ydoc) return;
      command(view.state, view.dispatch);
      clearSuggestionMeta(ydoc);
    },
    [editor, ydoc]
  );

  const jumpTo = useCallback(
    (s: DocSuggestion) => {
      const view = editor.prosemirrorView;
      if (!view) return;
      selectSuggestion(s.id)(view.state, view.dispatch);
      view.focus();
      findSuggestionMarkEl(view, s.id)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    },
    [editor]
  );

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {canEdit && suggestions.length > 0 && (
        <div className="flex gap-xs border-b border-grey-200 px-md py-sm dark:border-grey-700">
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            onClick={() => setConfirmAll('accept')}
          >
            <FiCheck size={14} />
            Alle annehmen
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            onClick={() => setConfirmAll('reject')}
          >
            <FiX size={14} />
            Alle ablehnen
          </Button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {suggestions.length === 0 ? (
          <div className="px-md py-8 text-center text-sm text-grey-500 dark:text-grey-400">
            Keine offenen Änderungsvorschläge.
          </div>
        ) : (
          <div className="divide-y divide-grey-100 dark:divide-grey-700">
            {suggestions.map((s) => {
              const kind = KIND_META[primaryKind(s.kinds)];
              const KindIcon = kind.icon;
              return (
                <div key={s.id} className="px-md py-sm">
                  <button
                    onClick={() => jumpTo(s)}
                    className="flex w-full items-start gap-sm text-left"
                  >
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-grey-100 dark:bg-grey-700">
                      <KindIcon size={13} className={kind.className} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-xs">
                        <span className="text-sm font-medium text-foreground">{kind.label}</span>
                        {s.meta?.color && (
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: s.meta.color }}
                          />
                        )}
                      </div>
                      {s.excerpt && (
                        <div className="truncate text-xs text-grey-600 dark:text-grey-300">
                          „{s.excerpt}"
                        </div>
                      )}
                      <div className="text-xs text-grey-500 dark:text-grey-400">
                        {s.meta?.name ?? 'Unbekannt'}
                        {s.meta?.createdAt ? ` · ${formatRelativeTime(s.meta.createdAt)}` : ''}
                      </div>
                    </div>
                  </button>
                  {canEdit && (
                    <div className="mt-1.5 flex gap-2 pl-[calc(1.75rem+var(--spacing-sm,0.5rem))]">
                      <button
                        onClick={() => runOne(s.id, applySuggestion)}
                        className="text-xs font-medium text-primary-600 hover:underline"
                      >
                        Annehmen
                      </button>
                      <button
                        onClick={() => runOne(s.id, revertSuggestion)}
                        className="text-xs font-medium text-grey-500 hover:underline dark:text-grey-400"
                      >
                        Ablehnen
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <AlertDialog open={confirmAll !== null} onOpenChange={(open) => !open && setConfirmAll(null)}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAll === 'accept' ? 'Alle Änderungen annehmen?' : 'Alle Änderungen ablehnen?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAll === 'accept'
                ? 'Alle vorgeschlagenen Änderungen werden übernommen.'
                : 'Alle vorgeschlagenen Änderungen werden verworfen.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                runAll(confirmAll === 'accept' ? applySuggestions : revertSuggestions);
                setConfirmAll(null);
              }}
            >
              {confirmAll === 'accept' ? 'Annehmen' : 'Ablehnen'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
