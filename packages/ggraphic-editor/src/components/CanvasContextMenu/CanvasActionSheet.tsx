// SPDX-License-Identifier: MPL-2.0
import { Dialog } from 'radix-ui';
import React, { useImperativeHandle, useRef, useState } from 'react';
import { PiCaretLeft, PiCaretRight } from 'react-icons/pi';

import {
  AFTER_CLOSE,
  type CanvasContextMenuHandle,
  type CanvasMenuRequest,
} from '@ggraphic/editor/components/CanvasContextMenu/CanvasContextMenu';
import { useMessages } from '@ggraphic/editor/i18n/messages';
import { cn } from '@ggraphic/editor/utils/cn';

import type { CanvasMenuEntry } from '@ggraphic/editor/components/CanvasContextMenu/canvasMenuModel';
import type { CanvasCommandId } from '@ggraphic/editor/utils/canvasCommandRegistry';

const ROW =
  'flex w-full h-12 items-center gap-3 rounded-lg border-none bg-transparent px-3 text-left text-[15px] text-[var(--editor-text)] cursor-pointer active:bg-[var(--editor-active-bg)] disabled:opacity-40 disabled:cursor-not-allowed';

/**
 * Das Kontextmenü am Handy — wie bei Canva ein Sheet vom unteren Rand, geöffnet
 * über „…“ in der Pille. Inhalt und Befehle sind dieselben wie am Desktop
 * (`buildCanvasMenu`, `useCanvasContextMenu`); nur die Form ist eine andere:
 * Zeilen zum Tippen statt Menüpunkte, Untermenüs als eigene Ansicht mit
 * „Zurück“, keine Tastenkürzel.
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
  const [trail, setTrail] = useState<{ label: string; entries: CanvasMenuEntry[] }[]>([]);
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
  const entries = current?.entries ?? request?.menu.entries ?? [];

  const renderEntry = (entry: CanvasMenuEntry, index: number): React.ReactNode => {
    switch (entry.kind) {
      case 'separator':
        return (
          <li
            key={`sep-${index}`}
            aria-hidden
            className="my-1 h-px bg-[var(--editor-border-soft)]"
          />
        );
      // Der Name steht schon im Kopf des Sheets.
      case 'label':
        return null;
      case 'sub':
        return (
          <li key={`sub-${entry.label}`}>
            <button
              type="button"
              className={ROW}
              onClick={() => setTrail((prev) => [...prev, entry])}
            >
              {entry.label}
              <PiCaretRight size={16} className="ml-auto" aria-hidden />
            </button>
          </li>
        );
      case 'check':
        return (
          <li key={entry.id}>
            <button
              type="button"
              className={ROW}
              aria-pressed={entry.checked}
              onClick={() => select(entry.id)}
            >
              {entry.label}
            </button>
          </li>
        );
      case 'item':
        return (
          <li key={entry.id}>
            <button
              type="button"
              className={cn(ROW, entry.destructive && 'text-[var(--editor-danger-fg)]')}
              disabled={entry.disabled}
              onClick={() => select(entry.id)}
            >
              {entry.label}
            </button>
          </li>
        );
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[1010] bg-black/30" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-[1010] flex max-h-[70dvh] flex-col rounded-t-2xl bg-[var(--editor-surface)] pb-[env(safe-area-inset-bottom)] text-[var(--editor-text)] shadow-[0_-8px_24px_rgba(0,0,0,0.16)] outline-none"
          onCloseAutoFocus={(e) => {
            if (!keepFocusRef.current) return;
            keepFocusRef.current = false;
            e.preventDefault();
          }}
        >
          <div className="mx-auto mt-2 h-1 w-9 flex-none rounded-full bg-[var(--editor-border)]" />
          <div className="flex h-12 flex-none items-center gap-1 px-2">
            {current && (
              <button
                type="button"
                className="inline-flex size-11 items-center justify-center rounded-lg border-none bg-transparent cursor-pointer text-[var(--editor-text)]"
                onClick={() => setTrail((prev) => prev.slice(0, -1))}
                aria-label={t.contextMenu.back}
              >
                <PiCaretLeft size={20} aria-hidden />
              </button>
            )}
            <Dialog.Title className={cn('m-0 text-[15px] font-semibold', !current && 'pl-3')}>
              {title}
            </Dialog.Title>
          </div>
          <ul className="m-0 list-none overflow-y-auto px-2 pb-2">{entries.map(renderEntry)}</ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
