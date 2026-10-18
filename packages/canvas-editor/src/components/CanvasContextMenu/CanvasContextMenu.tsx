import { ContextMenu } from 'radix-ui';
import React, { useEffect, useImperativeHandle, useRef, useState } from 'react';
import { PiCaretRight, PiCheck } from 'react-icons/pi';

import type { CanvasMenu, CanvasMenuEntry } from './canvasMenuModel';
import type { CanvasCommandId } from '../../utils/canvasCommandRegistry';

export interface CanvasMenuRequest {
  point: { clientX: number; clientY: number };
  menu: CanvasMenu;
  run: (id: CanvasCommandId) => void;
}

export interface CanvasContextMenuHandle {
  open: (request: CanvasMenuRequest) => void;
}

/** Befehle, die selbst den Fokus nehmen (Text-Editor, Bildauswahl): erst nach dem Schließen. */
const AFTER_CLOSE: ReadonlySet<CanvasCommandId> = new Set(['editText', 'replaceBackground']);

const CONTENT =
  'z-[10001] min-w-[14rem] max-h-(--radix-context-menu-content-available-height) overflow-y-auto rounded-lg border border-[var(--editor-border)] bg-[var(--editor-surface)] p-1 text-[var(--editor-text)] shadow-[0_8px_24px_rgba(0,0,0,0.16)]';

const ITEM =
  'relative flex h-8 cursor-default select-none items-center gap-2 rounded-md px-2 text-[13px] outline-none data-[highlighted]:bg-[var(--editor-active-bg)] data-[highlighted]:text-[var(--editor-active-fg)] data-[state=open]:bg-[var(--editor-surface-hover)] data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[destructive]:text-[var(--editor-danger-fg)] data-[destructive]:data-[highlighted]:bg-[var(--editor-danger-bg)] data-[destructive]:data-[highlighted]:text-[var(--editor-danger-fg)]';

/**
 * Das Kontextmenü des Editors — genau eines, für alle Seiten. Jede gemountete
 * Radix-Menü-Wurzel hängt einen Keydown-Listener an `document`; ein Menü je
 * Element oder Seite kostete bei jedem Tastendruck im Canvas (siehe
 * `docs/CLAUDE-canvas-eval.md`).
 *
 * Geöffnet wird es von außen (`open`): der Editor weiß, worauf geklickt wurde,
 * und schickt das `contextmenu` an einen unsichtbaren Anker — Radix nimmt den
 * Punkt daraus. Der Anker bekommt nie eine Berührung, darum gibt es keinen
 * Long-Press. `modal={false}`, damit ein zweiter Rechtsklick wieder bei der
 * Fläche ankommt und das Menü dort neu öffnet, statt im Browser-Menü zu landen.
 */
export function CanvasContextMenu({
  handleRef,
  closeKey,
}: {
  handleRef: React.Ref<CanvasContextMenuHandle>;
  /** Ändert sich der Wert (Zoom), schließt das Menü: es hinge sonst neben seinem Ziel. */
  closeKey: unknown;
}) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);
  const [request, setRequest] = useState<CanvasMenuRequest | null>(null);
  const keepFocusRef = useRef(false);

  const changeOpen = (next: boolean) => {
    openRef.current = next;
    setOpen(next);
  };

  useImperativeHandle(
    handleRef,
    () => ({
      open: (next) => {
        const fire = () =>
          anchorRef.current?.dispatchEvent(
            new MouseEvent('contextmenu', {
              bubbles: true,
              cancelable: true,
              clientX: next.point.clientX,
              clientY: next.point.clientY,
            })
          );
        setRequest(next);
        // Ein offenes Menü springt nicht an den neuen Punkt; erst schließen.
        if (openRef.current) {
          changeOpen(false);
          requestAnimationFrame(fire);
        } else {
          fire();
        }
      },
    }),
    []
  );

  // Zoom moves the canvas under the menu: close it, during render, not in an effect.
  const [seenCloseKey, setSeenCloseKey] = useState(closeKey);
  if (seenCloseKey !== closeKey) {
    setSeenCloseKey(closeKey);
    setOpen(false);
  }
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e: Event) => {
      if (e.target instanceof Node && contentRef.current?.contains(e.target)) return;
      changeOpen(false);
    };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  const select = (id: CanvasCommandId) => {
    if (!request) return;
    if (AFTER_CLOSE.has(id)) {
      keepFocusRef.current = true;
      const { run } = request;
      requestAnimationFrame(() => run(id));
      return;
    }
    request.run(id);
  };

  const renderEntry = (entry: CanvasMenuEntry, index: number): React.ReactNode => {
    switch (entry.kind) {
      case 'separator':
        return (
          <ContextMenu.Separator
            key={`sep-${index}`}
            className="-mx-1 my-1 h-px bg-[var(--editor-border-soft)]"
          />
        );
      case 'label':
        return (
          <ContextMenu.Label
            key={`label-${index}`}
            className="px-2 py-1 text-[12px] font-medium text-[var(--editor-text-muted)]"
          >
            {entry.label}
          </ContextMenu.Label>
        );
      case 'check':
        return (
          <ContextMenu.CheckboxItem
            key={entry.id}
            className={`${ITEM} pl-7`}
            checked={entry.checked}
            onSelect={() => select(entry.id)}
          >
            <ContextMenu.ItemIndicator className="absolute left-2 inline-flex">
              <PiCheck size={14} aria-hidden />
            </ContextMenu.ItemIndicator>
            {entry.label}
          </ContextMenu.CheckboxItem>
        );
      case 'sub':
        return (
          <ContextMenu.Sub key={`sub-${entry.label}`}>
            <ContextMenu.SubTrigger className={ITEM}>
              {entry.label}
              <PiCaretRight size={14} className="ml-auto" aria-hidden />
            </ContextMenu.SubTrigger>
            <ContextMenu.Portal>
              <ContextMenu.SubContent className={CONTENT} sideOffset={4}>
                {entry.entries.map(renderEntry)}
              </ContextMenu.SubContent>
            </ContextMenu.Portal>
          </ContextMenu.Sub>
        );
      case 'item':
        return (
          <ContextMenu.Item
            key={entry.id}
            className={ITEM}
            disabled={entry.disabled}
            onSelect={() => select(entry.id)}
            {...(entry.destructive ? { 'data-destructive': '' } : {})}
            {...(entry.ariaShortcut ? { 'aria-keyshortcuts': entry.ariaShortcut } : {})}
          >
            {entry.label}
            {entry.shortcut && (
              <span className="ml-auto pl-6 text-[12px] text-[var(--editor-text-muted)]">
                {entry.shortcut}
              </span>
            )}
          </ContextMenu.Item>
        );
    }
  };

  return (
    <ContextMenu.Root open={open} onOpenChange={changeOpen} modal={false}>
      <ContextMenu.Trigger asChild>
        <span ref={anchorRef} aria-hidden className="fixed left-0 top-0 size-0" />
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        {request && (
          <ContextMenu.Content
            ref={contentRef}
            className={CONTENT}
            aria-label={request.menu.label}
            onContextMenu={(e) => e.preventDefault()}
            onCloseAutoFocus={(e) => {
              if (!keepFocusRef.current) return;
              keepFocusRef.current = false;
              e.preventDefault();
            }}
          >
            {request.menu.entries.map(renderEntry)}
          </ContextMenu.Content>
        )}
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
