import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@gruenerator/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FiArchive, FiCheck, FiCopy, FiMove, FiRotateCcw, FiTrash2 } from 'react-icons/fi';

import { CardMenuProvider, type OpenCardMenu } from '../context/CardMenuContext';
import { useCardActions } from '../hooks/useCardActions';
import { FIELD_IDS } from '../types';

import type { CellValue, Field, Row } from '../types';

interface CardContextMenuProps {
  boardId: string;
  fields: Field[];
  /** False on read-only boards: cards keep the browser's own menu. */
  enabled: boolean;
  onUpdateCell: (rowId: string, fieldId: string, value: CellValue) => void;
  onUpdateRow: (rowId: string, updates: Partial<Row>) => void;
  onDelete: (rowId: string) => void;
  onDuplicate: (rowId: string) => void;
  children: React.ReactNode;
}

interface MenuTarget {
  row: Row;
  returnFocus: HTMLElement;
}

/**
 * The right-click menu of every card on the board — one menu for the whole
 * board, not one per card: each mounted Radix menu root adds listeners to
 * `document` (same reasoning as the canvas editor's `CanvasContextMenu`).
 * Cards call `openCardMenu` from their `contextmenu` event; the menu then
 * re-fires that event at an invisible anchor, from which Radix takes the point.
 */
export function CardContextMenu({
  boardId,
  fields,
  enabled,
  onUpdateCell,
  onUpdateRow,
  onDelete,
  onDuplicate,
  children,
}: CardContextMenuProps) {
  const actions = useCardActions({
    boardId,
    fields,
    onUpdateCell,
    onUpdateRow,
    onDelete,
    onDuplicate,
  });
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);
  const [target, setTarget] = useState<MenuTarget | null>(null);

  const changeOpen = useCallback((next: boolean) => {
    openRef.current = next;
    setOpen(next);
  }, []);

  const openCardMenu = useCallback<OpenCardMenu>(
    (row, event) => {
      // Inside the inline title editor the browser menu (paste, spelling) wins.
      if ((event.target as HTMLElement).closest('input, textarea, [contenteditable="true"]')) {
        return;
      }
      event.preventDefault();
      const card = event.currentTarget;
      let { clientX, clientY } = event;
      // Keyboard (Shift+F10, menu key) reports no pointer: open under the card.
      if (clientX === 0 && clientY === 0) {
        const rect = card.getBoundingClientRect();
        clientX = rect.left + 12;
        clientY = rect.bottom;
      }
      const active = document.activeElement;
      setTarget({
        row,
        returnFocus: active instanceof HTMLElement && card.contains(active) ? active : card,
      });
      const fire = () =>
        anchorRef.current?.dispatchEvent(
          new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX, clientY })
        );
      // An open menu does not jump to a new point; close it first.
      if (openRef.current) {
        changeOpen(false);
        requestAnimationFrame(fire);
      } else {
        fire();
      }
    },
    [changeOpen]
  );

  // Columns and the page scroll under the menu: close it instead of leaving it
  // hanging next to a card that moved away.
  useEffect(() => {
    if (!open) return undefined;
    const close = (e: Event) => {
      if (e.target instanceof Element && e.target.closest('[data-slot^="context-menu"]')) return;
      changeOpen(false);
    };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open, changeOpen]);

  const row = target?.row ?? null;
  const { taskDone } = actions;
  const isDone = !!row && !!taskDone && row.cells[FIELD_IDS.STATUS] === taskDone.doneStatusId;
  const currentStatusId = row?.cells[FIELD_IDS.STATUS];
  const title = (row?.cells[FIELD_IDS.TITLE] as string) || 'Karte';

  return (
    <CardMenuProvider value={enabled ? openCardMenu : null}>
      {children}
      <ContextMenu open={open} onOpenChange={changeOpen} modal={false}>
        <ContextMenuTrigger asChild>
          <span ref={anchorRef} aria-hidden className="fixed left-0 top-0 size-0" />
        </ContextMenuTrigger>
        {row && (
          <ContextMenuContent
            className="min-w-[13rem]"
            aria-label={`Aktionen für „${title}“`}
            onContextMenu={(e) => e.preventDefault()}
            onCloseAutoFocus={(e) => {
              // Back to the card, not to the invisible anchor.
              e.preventDefault();
              if (target?.returnFocus.isConnected) target.returnFocus.focus();
            }}
          >
            {taskDone && (
              <>
                <ContextMenuItem onSelect={() => taskDone.setDone(row.id, !isDone)}>
                  {isDone ? <FiRotateCcw aria-hidden /> : <FiCheck aria-hidden />}
                  {isDone ? 'Wieder öffnen' : 'Als erledigt markieren'}
                </ContextMenuItem>
                <ContextMenuSeparator />
              </>
            )}
            {actions.statusOptions.length > 0 && (
              <ContextMenuSub>
                <ContextMenuSubTrigger className="gap-2">
                  <FiMove aria-hidden className="size-4 text-muted-foreground" />
                  Verschieben nach
                </ContextMenuSubTrigger>
                <ContextMenuSubContent className="min-w-[12rem]">
                  {actions.statusOptions.map((opt) => (
                    <ContextMenuItem
                      key={opt.id}
                      disabled={opt.id === currentStatusId}
                      onSelect={() => actions.moveTo(row, opt.id)}
                    >
                      <span
                        aria-hidden
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: opt.color }}
                      />
                      {opt.name}
                    </ContextMenuItem>
                  ))}
                </ContextMenuSubContent>
              </ContextMenuSub>
            )}
            {actions.duplicate && (
              <ContextMenuItem onSelect={() => actions.duplicate?.(row)}>
                <FiCopy aria-hidden />
                Duplizieren
              </ContextMenuItem>
            )}
            {row.archivedAt ? (
              <ContextMenuItem onSelect={() => actions.restore(row)}>
                <FiArchive aria-hidden />
                Wiederherstellen
              </ContextMenuItem>
            ) : (
              <ContextMenuItem onSelect={() => actions.archive(row)}>
                <FiArchive aria-hidden />
                Archivieren
              </ContextMenuItem>
            )}
            <ContextMenuSeparator />
            <ContextMenuItem
              variant="destructive"
              // The confirm dialog takes focus: open it once the menu has
              // handed focus back to the card, so the dialog returns it there.
              onSelect={() => requestAnimationFrame(() => void actions.remove(row))}
            >
              <FiTrash2 aria-hidden />
              Löschen
            </ContextMenuItem>
          </ContextMenuContent>
        )}
      </ContextMenu>
    </CardMenuProvider>
  );
}
