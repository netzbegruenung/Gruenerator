import {
  buildCanvasMenu,
  type CanvasMenuSnapshot,
} from '@ggraphic/editor/components/CanvasContextMenu/canvasMenuModel';
import { CanvasClipboard } from '@ggraphic/editor/utils/canvasClipboard';
import {
  isMacPlatform,
  isPageCommand,
  type CanvasCommandId,
} from '@ggraphic/editor/utils/canvasCommandRegistry';
import { useCallback, useEffect, useRef } from 'react';

import type { CanvasContextMenuHandle } from '../../CanvasContextMenu/CanvasContextMenu';
import type { GenericCanvasRef } from '@ggraphic/editor/components/GenericCanvas';
import type { ClientPoint } from '@ggraphic/editor/utils/canvasCommands';
import type React from 'react';

interface UseCanvasContextMenuParams {
  /** The pages container: a right-click inside it is the editor's. */
  containerRef: React.RefObject<HTMLDivElement | null>;
  canvasRefsRef: React.MutableRefObject<React.RefObject<GenericCanvasRef | null>[]>;
  pageDomRefsRef: React.MutableRefObject<React.RefObject<HTMLDivElement | null>[]>;
  pageIds: readonly string[];
  currentPageIndex: number;
  canAddPage: boolean;
  /** Mobil, in der Vorschau und bei offenem KI-Vorschlag: kein Menü. */
  enabled: boolean;
  duplicatePage: (id: string) => void;
  removePage: (id: string) => void;
  openImageAdjust: () => void;
  deselectAll: () => void;
  /** Öffnet die Bildauswahl des Hintergrunds in der Kontextleiste. */
  requestBackgroundPicker: () => void;
}

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLInputElement ||
  target instanceof HTMLTextAreaElement ||
  (target instanceof HTMLElement && target.isContentEditable);

const centerOf = (r: { left: number; top: number; width: number; height: number }) => ({
  clientX: r.left + r.width / 2,
  clientY: r.top + r.height / 2,
});

/**
 * Der Rechtsklick auf den Seiten: welches Ziel, welche Seite, und die Befehle,
 * die nicht auf der Seite laufen (Seiten duplizieren und löschen, Hintergrund,
 * Bildbereich). Die Seiten-Befehle gehen an `GenericCanvasRef.runCommand` der
 * Seite, auf der geklickt wurde — nicht an die aktive: die wird erst nach dem
 * Klick umgeschaltet.
 */
export function useCanvasContextMenu({
  containerRef,
  canvasRefsRef,
  pageDomRefsRef,
  pageIds,
  currentPageIndex,
  canAddPage,
  enabled,
  duplicatePage,
  removePage,
  openImageAdjust,
  deselectAll,
  requestBackgroundPicker,
}: UseCanvasContextMenuParams) {
  const menuRef = useRef<CanvasContextMenuHandle>(null);
  const lastPointerTypeRef = useRef('mouse');

  const open = useCallback(
    (pageIndex: number, point: ClientPoint | null, at: ClientPoint) => {
      const page = canvasRefsRef.current[pageIndex]?.current;
      const pageId = pageIds[pageIndex];
      const snapshot = page?.getMenuSnapshot?.();
      // Im Ausschnitt gehören Druck und Tasten dem Foto im Rahmen.
      if (!page || !pageId || !snapshot || snapshot.isCropping) return;

      const run = (id: CanvasCommandId, bound: CanvasMenuSnapshot) => {
        const background = bound.background;
        switch (id) {
          case 'editImage':
            return openImageAdjust();
          case 'duplicatePage':
            return duplicatePage(pageId);
          case 'deletePage':
            return removePage(pageId);
          case 'replaceBackground':
            return requestBackgroundPicker();
          case 'cropBackground':
            return page.handleCropImage?.();
          case 'removeBackground':
            background?.onImageChange?.(null, undefined, null);
            return deselectAll();
          default:
            if (isPageCommand(id)) page.runCommand?.(id, point);
        }
      };

      menuRef.current?.open({
        point: at,
        menu: buildCanvasMenu(snapshot, {
          isMac: isMacPlatform(),
          hasPoint: point !== null,
          hasClipboard: CanvasClipboard.hasContent(),
          pageIndex,
          pageCount: pageIds.length,
          canAddPage,
          canEditImage: true,
        }),
        run: (id) => run(id, snapshot),
      });
    },
    [
      canvasRefsRef,
      pageIds,
      canAddPage,
      duplicatePage,
      removePage,
      openImageAdjust,
      deselectAll,
      requestBackgroundPicker,
    ]
  );

  /** Tastatur: in der Mitte der Auswahl, sonst der Bühne der aktiven Seite. */
  const openFromKeyboard = useCallback(() => {
    const page = canvasRefsRef.current[currentPageIndex]?.current;
    const box = page?.getSelectionBox?.();
    const stage =
      pageDomRefsRef.current[currentPageIndex]?.current?.querySelector('.konvajs-content');
    const at = box ? centerOf(box) : stage ? centerOf(stage.getBoundingClientRect()) : null;
    if (at) open(currentPageIndex, at, at);
  }, [canvasRefsRef, pageDomRefsRef, currentPageIndex, open]);

  // Native, on the document: a handler on the container div would make it an
  // interactive element for jsx-a11y, and a portal island's events must not
  // arrive anyway.
  useEffect(() => {
    if (!enabled) return undefined;
    const onPointerDown = (e: PointerEvent) => {
      lastPointerTypeRef.current = e.pointerType;
    };
    const onContextMenu = (e: MouseEvent) => {
      const container = containerRef.current;
      const target = e.target;
      const pointerType = lastPointerTypeRef.current;
      if (!container || !(target instanceof Element) || !container.contains(target)) return;
      // Eingabefelder behalten das Browser-Menü: dort sind Einfügen und Rechtschreibung gemeint.
      if (pointerType === 'touch' || pointerType === 'pen' || isTyping(target)) return;
      e.preventDefault();
      // Per Taste ausgelöst (Taste 0 ohne ⌃): dort, wo die Tastatur öffnet.
      if (e.button === 0 && !e.ctrlKey) return openFromKeyboard();
      const pageElement = target.closest('[data-page-index]');
      const pageIndex = pageElement
        ? Number(pageElement.getAttribute('data-page-index'))
        : currentPageIndex;
      const at = { clientX: e.clientX, clientY: e.clientY };
      open(pageIndex, target.closest('.konvajs-content') ? at : null, at);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'ContextMenu' && !(e.key === 'F10' && e.shiftKey)) return;
      if (
        isTyping(e.target) ||
        (e.target instanceof Element && e.target.closest('[role="menu"]'))
      ) {
        return;
      }
      e.preventDefault();
      openFromKeyboard();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [enabled, containerRef, currentPageIndex, open, openFromKeyboard]);

  return menuRef;
}
