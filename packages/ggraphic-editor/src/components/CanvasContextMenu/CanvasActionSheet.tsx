// SPDX-License-Identifier: MPL-2.0
import { Dialog } from 'radix-ui';
import React, { useImperativeHandle, useRef, useState } from 'react';
import {
  PiAlignBottom,
  PiAlignCenterHorizontal,
  PiAlignCenterVertical,
  PiAlignLeft,
  PiAlignRight,
  PiAlignTop,
  PiArrowCounterClockwise,
  PiArrowDown,
  PiArrowLineDown,
  PiArrowLineUp,
  PiArrowUp,
  PiArrowsClockwise,
  PiCaretLeft,
  PiCaretRight,
  PiClipboardText,
  PiColumns,
  PiCopy,
  PiFiles,
  PiFlipHorizontal,
  PiFlipVertical,
  PiFrameCorners,
  PiImage,
  PiImageSquare,
  PiLockSimple,
  PiLockSimpleOpen,
  PiRows,
  PiScissors,
  PiSelectionAll,
  PiSlidersHorizontal,
  PiStack,
  PiTextT,
  PiTrash,
} from 'react-icons/pi';

import {
  AFTER_CLOSE,
  type CanvasContextMenuHandle,
  type CanvasMenuRequest,
} from '@ggraphic/editor/components/CanvasContextMenu/CanvasContextMenu';
import {
  compact,
  type CanvasMenuEntry,
  type CanvasSubmenuKey,
} from '@ggraphic/editor/components/CanvasContextMenu/canvasMenuModel';
import { useMessages } from '@ggraphic/editor/i18n/messages';
import { cn } from '@ggraphic/editor/utils/cn';

import type { CanvasCommandId } from '@ggraphic/editor/utils/canvasCommandRegistry';
import type { IconType } from 'react-icons';

type ItemEntry = Extract<CanvasMenuEntry, { kind: 'item' }>;
type SubEntry = Extract<CanvasMenuEntry, { kind: 'sub' }>;

/** Die Zwischenablage steht oben als Kacheln, wie bei Canva: das, was man am häufigsten tippt. */
const QUICK: ReadonlySet<CanvasCommandId> = new Set([
  'copy',
  'cut',
  'paste',
  'pasteHere',
  'duplicate',
]);

/** Duplizieren und Löschen wie in der Pille (`SelectionPill`), damit beide Orte gleich aussehen. */
const ICONS: Partial<Record<CanvasCommandId, IconType>> = {
  copy: PiFiles,
  cut: PiScissors,
  paste: PiClipboardText,
  pasteHere: PiClipboardText,
  duplicate: PiCopy,
  delete: PiTrash,
  selectAll: PiSelectionAll,
  toggleLock: PiLockSimple,
  editText: PiTextT,
  editImage: PiSlidersHorizontal,
  insertFrameImage: PiImage,
  bringToFront: PiArrowLineUp,
  bringForward: PiArrowUp,
  sendBackward: PiArrowDown,
  sendToBack: PiArrowLineDown,
  flipHorizontal: PiFlipHorizontal,
  flipVertical: PiFlipVertical,
  resetRotation: PiArrowCounterClockwise,
  alignLeft: PiAlignLeft,
  alignCenterH: PiAlignCenterHorizontal,
  alignRight: PiAlignRight,
  alignTop: PiAlignTop,
  alignMiddle: PiAlignCenterVertical,
  alignBottom: PiAlignBottom,
  distributeHorizontal: PiColumns,
  distributeVertical: PiRows,
  replaceBackground: PiImageSquare,
  cropBackground: PiFrameCorners,
  removeBackground: PiTrash,
  duplicatePage: PiCopy,
  deletePage: PiTrash,
};

const SUB_ICONS: Record<CanvasSubmenuKey, IconType> = {
  layer: PiStack,
  orient: PiArrowsClockwise,
  align: PiAlignLeft,
};

const ROW =
  'flex w-full h-12 items-center gap-4 rounded-lg border-none bg-transparent px-3 text-left text-[15px] text-[var(--editor-text)] cursor-pointer active:bg-[var(--editor-active-bg)] disabled:opacity-40 disabled:cursor-not-allowed';

const TILE =
  'flex flex-1 min-w-0 flex-col items-center gap-1.5 rounded-xl border-none bg-transparent px-1 py-2.5 text-[12px] font-medium text-[var(--editor-text)] cursor-pointer active:bg-[var(--editor-active-bg)] disabled:opacity-40 disabled:cursor-not-allowed';

const ICON = 'flex-none text-[var(--editor-text-secondary)]';

/**
 * Die Ansicht eines Menüs im Sheet: oben die Zwischenablage als Kacheln, darunter
 * die übrigen Befehle als Liste, Löschen zuletzt und für sich — wer weiter
 * unten tippt, soll nicht versehentlich löschen. Untermenüs zeigen ihre
 * Einträge unverändert.
 */
function arrange(entries: CanvasMenuEntry[], root: boolean) {
  if (!root) return { quick: [] as ItemEntry[], list: entries };
  const isQuick = (e: CanvasMenuEntry) => e.kind === 'item' && QUICK.has(e.id);
  const isDestructive = (e: CanvasMenuEntry) => e.kind === 'item' && e.destructive;
  const rest = entries.filter((e) => !isQuick(e));
  return {
    quick: entries.filter((e): e is ItemEntry => isQuick(e)),
    list: compact([
      ...rest.filter((e) => !isDestructive(e)),
      { kind: 'separator' },
      ...rest.filter(isDestructive),
    ]),
  };
}

/**
 * Das Kontextmenü am Handy — wie bei Canva ein Sheet vom unteren Rand, geöffnet
 * über „…“ in der Pille. Inhalt und Befehle sind dieselben wie am Desktop
 * (`buildCanvasMenu`, `useCanvasContextMenu`); nur die Form ist eine andere:
 * Kacheln und Zeilen mit Icons statt Menüpunkte, Gruppen durch Linien
 * getrennt, Untermenüs als eigene Ansicht mit „Zurück“, keine Tastenkürzel.
 */
export function CanvasActionSheet({
  handleRef,
}: {
  handleRef: React.Ref<CanvasContextMenuHandle>;
}) {
  const t = useMessages();
  const [request, setRequest] = useState<CanvasMenuRequest | null>(null);
  const [open, setOpen] = useState(false);
  /** Die geöffneten Untermenüs, innerstes zuletzt. */
  const [trail, setTrail] = useState<SubEntry[]>([]);
  const keepFocusRef = useRef(false);

  useImperativeHandle(
    handleRef,
    () => ({
      open: (next) => {
        setRequest(next);
        setTrail([]);
        setOpen(true);
      },
    }),
    []
  );

  const select = (id: CanvasCommandId) => {
    if (!request) return;
    const { run } = request;
    keepFocusRef.current = AFTER_CLOSE.has(id);
    setOpen(false);
    // Nach dem Schließen: der Befehl soll die Seite sehen, nicht das Sheet davor.
    requestAnimationFrame(() => run(id));
  };

  const current = trail[trail.length - 1];
  const title = current?.label ?? request?.menu.label ?? '';
  const { quick, list } = arrange(current?.entries ?? request?.menu.entries ?? [], !current);

  const itemIcon = (entry: ItemEntry): IconType | undefined =>
    entry.id === 'toggleLock' && entry.label === t.contextMenu.unlock
      ? PiLockSimpleOpen
      : ICONS[entry.id];

  const renderEntry = (entry: CanvasMenuEntry, index: number): React.ReactNode => {
    switch (entry.kind) {
      case 'separator':
        return (
          <li
            key={`sep-${index}`}
            aria-hidden
            className="-mx-2 my-1.5 h-px bg-[var(--editor-border-soft)]"
          />
        );
      // Der Name steht schon im Kopf des Sheets.
      case 'label':
        return null;
      case 'sub': {
        const Icon = SUB_ICONS[entry.key];
        return (
          <li key={`sub-${entry.key}`}>
            <button
              type="button"
              className={ROW}
              onClick={() => setTrail((prev) => [...prev, entry])}
            >
              <Icon size={20} className={ICON} aria-hidden />
              {entry.label}
              <PiCaretRight
                size={16}
                className="ml-auto text-[var(--editor-text-muted)]"
                aria-hidden
              />
            </button>
          </li>
        );
      }
      case 'check':
        return (
          <li key={entry.id}>
            <button
              type="button"
              className={ROW}
              aria-pressed={entry.checked}
              onClick={() => select(entry.id)}
            >
              <span className="size-5 flex-none" aria-hidden />
              {entry.label}
            </button>
          </li>
        );
      case 'item': {
        const Icon = itemIcon(entry);
        return (
          <li key={entry.id}>
            <button
              type="button"
              className={cn(ROW, entry.destructive && 'text-[var(--editor-danger-fg)]')}
              disabled={entry.disabled}
              onClick={() => select(entry.id)}
            >
              {Icon ? (
                <Icon
                  size={20}
                  className={cn(ICON, entry.destructive && 'text-[var(--editor-danger-fg)]')}
                  aria-hidden
                />
              ) : (
                <span className="size-5 flex-none" aria-hidden />
              )}
              {entry.label}
            </button>
          </li>
        );
      }
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[1010] bg-black/30" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-[1010] flex max-h-[75dvh] flex-col rounded-t-2xl bg-[var(--editor-surface)] pb-[env(safe-area-inset-bottom)] text-[var(--editor-text)] shadow-[0_-8px_24px_rgba(0,0,0,0.16)] outline-none"
          onCloseAutoFocus={(e) => {
            if (!keepFocusRef.current) return;
            keepFocusRef.current = false;
            e.preventDefault();
          }}
        >
          <div className="mx-auto mt-2 h-1 w-9 flex-none rounded-full bg-[var(--editor-border)]" />
          <div className="relative flex h-12 flex-none items-center justify-center px-14">
            {current && (
              <button
                type="button"
                className="absolute left-2 inline-flex size-11 items-center justify-center rounded-lg border-none bg-transparent cursor-pointer text-[var(--editor-text)]"
                onClick={() => setTrail((prev) => prev.slice(0, -1))}
                aria-label={t.contextMenu.back}
              >
                <PiCaretLeft size={20} aria-hidden />
              </button>
            )}
            <Dialog.Title className="m-0 truncate text-[15px] font-semibold">{title}</Dialog.Title>
          </div>
          <div className="overflow-y-auto">
            {quick.length > 0 && (
              <ul className="m-0 flex list-none gap-1 border-b border-[var(--editor-border-soft)] px-2 pb-2">
                {quick.map((entry) => {
                  const Icon = ICONS[entry.id] ?? PiCopy;
                  return (
                    <li key={entry.id} className="flex flex-1 min-w-0">
                      <button
                        type="button"
                        className={TILE}
                        disabled={entry.disabled}
                        onClick={() => select(entry.id)}
                      >
                        <Icon size={22} aria-hidden />
                        <span className="max-w-full truncate">{entry.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <ul className="m-0 list-none px-2 py-1.5">{list.map(renderEntry)}</ul>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
