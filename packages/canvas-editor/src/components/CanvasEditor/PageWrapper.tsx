import React, { useCallback, useState, memo } from 'react';

import { useTrackUnsplashDownload } from '../../hooks/useTrackUnsplashDownload';
import { cn } from '../../utils/cn';
import {
  isElementDrag,
  isMediaDrag,
  isVorlageDrag,
  markDropPlaced,
  readElementDrag,
  readMediaDrag,
  readVorlageDrag,
} from '../../utils/mediaDrop';
import { GenericCanvas } from '../GenericCanvas';
import { PageToolbar } from '../PageToolbar';
import { ZoomableViewport } from '../ZoomableViewport';

import { useBlockInsert } from './blockInsert';

import type { PageWrapperProps } from './types';

/**
 * Memoized page wrapper component (Rule 5.2: enables early returns before computation)
 * Prevents re-rendering all pages when only one changes
 */
export const PageWrapper = memo(function PageWrapper({
  page,
  index,
  pageCount,
  config,
  formatId,
  isActive,
  canDelete,
  canvasRef,
  onSelect,
  onDelete,
  onMovePage,
  onDuplicatePage,
  onChangeTemplate,
  onDropVorlage,
  onExport,
  onCancel,
  callbacks,
  multiPageExport,
  onStateChange,
  onObservedState,
  onToolbarStateChange,
  onAutoSaveShareToken,
  autoSave,
  pageBinding,
  pageRef,
}: PageWrapperProps) {
  // Active page pushes its live state/actions/selection up so the shared
  // sidebar renders synchronously with edits (replaces the old 200ms poll).
  const handleLiveState = useCallback(
    (
      state: Record<string, unknown>,
      actions: Record<string, unknown>,
      selectedElement: string | null
    ) => {
      if (isActive) onStateChange(page.id, state, actions, selectedElement);
      onObservedState?.(page.id, state, actions);
    },
    [onStateChange, onObservedState, isActive, page.id]
  );

  // A mouse activates the page on pointer-down (capture), so the page switch —
  // and the toolbar swap it causes — happens before a Konva drag starts; the
  // click that ends a drag used to switch pages mid-gesture. Touch waits for
  // the tap: a pointer-down there may start a scroll. On the Konva stage,
  // though, touchstart is cancelled (so no click ever follows) and touch-action
  // is none (so no scroll can start): the primary finger activates right away.
  // A pinch's second finger is not primary. The page's own toolbar buttons act
  // on their page without activating it.
  const activateFrom = useCallback(
    (target: EventTarget) => {
      if (isActive || (target as Element).closest('button')) return;
      onSelect(index);
    },
    [isActive, onSelect, index]
  );
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      // The right button too: the context menu acts on the page it opens over.
      if (e.pointerType === 'mouse' && (e.button === 0 || e.button === 2)) {
        activateFrom(e.target);
      } else if (
        e.pointerType === 'touch' &&
        e.isPrimary &&
        (e.target as Element).closest('.konvajs-content')
      ) {
        activateFrom(e.target);
      }
    },
    [activateFrom]
  );
  const handleClick = useCallback((e: React.MouseEvent) => activateFrom(e.target), [activateFrom]);

  // An upload, photo or Elemente tile dragged from the sidebar lands where it
  // is dropped, on this page. A Vorlagen tile becomes a page of its own, so
  // the page hands it on with its id: a Seite goes in after it.
  const [isDropTarget, setIsDropTarget] = useState(false);
  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (
        !isMediaDrag(e.dataTransfer) &&
        !isElementDrag(e.dataTransfer) &&
        !(onDropVorlage && isVorlageDrag(e.dataTransfer))
      ) {
        return;
      }
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      setIsDropTarget(true);
    },
    [onDropVorlage]
  );
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setIsDropTarget(false);
  }, []);
  const trackDownload = useTrackUnsplashDownload();
  const blocks = useBlockInsert();
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      setIsDropTarget(false);
      const vorlageId = onDropVorlage ? readVorlageDrag(e.dataTransfer) : null;
      if (vorlageId) {
        e.preventDefault();
        onDropVorlage?.(vorlageId, page.id);
        return;
      }
      const media = readMediaDrag(e.dataTransfer);
      const element = media ? null : readElementDrag(e.dataTransfer);
      if (!media && !element) return;
      e.preventDefault();
      if (!isActive) onSelect(index);
      if (media) {
        if (!canvasRef.current?.dropMedia(e, media)) return;
        markDropPlaced();
        trackDownload(media.name, media.attribution);
      } else if (element?.kind === 'block') {
        if (!blocks) return;
        // Composed after the drop; `dragend` asks right away, so it counts as placed.
        markDropPlaced();
        const at = { clientX: e.clientX, clientY: e.clientY };
        void blocks.insert(element.blockId, { pageIndex: index, at });
      } else if (element && canvasRef.current?.dropElement(e, element)) markDropPlaced();
    },
    [isActive, onSelect, index, canvasRef, onDropVorlage, page.id, trackDownload, blocks]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Only the wrapper itself — a bubbled Enter/Space from a toolbar button
      // must keep activating that button.
      if (e.target !== e.currentTarget) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onSelect(index);
      }
    },
    [onSelect, index]
  );

  return (
    <div
      ref={pageRef}
      data-page-index={index}
      className={cn(
        'heterogeneous-multipage__page-wrapper group relative cursor-pointer w-fit focus-visible:outline-2 focus-visible:outline-[var(--tanne,#0a2b1e)] focus-visible:outline-offset-1',
        '[&_.zoomable-viewport-wrapper]:w-fit [&_.zoomable-viewport-container]:p-0 [&_.zoomable-viewport-container]:overflow-visible',
        isActive && 'heterogeneous-multipage__page-wrapper--active',
        isDropTarget && 'outline-2 outline-dashed outline-offset-4 outline-[var(--editor-accent)]'
      )}
      onPointerDownCapture={handlePointerDown}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      aria-label={`Seite ${index + 1}${isActive ? ' (ausgewählt)' : ''}`}
      aria-pressed={isActive}
    >
      <PageToolbar
        pageIndex={index}
        pageCount={pageCount}
        isActive={isActive}
        onMoveUp={() => onMovePage(page.id, 'up')}
        onMoveDown={() => onMovePage(page.id, 'down')}
        onDuplicate={() => onDuplicatePage(page.id)}
        onChangeTemplate={onChangeTemplate ? () => onChangeTemplate(page.id) : undefined}
        onDelete={canDelete ? () => onDelete(page.id) : undefined}
      />

      <ZoomableViewport
        canvasWidth={config.canvas.width}
        canvasHeight={config.canvas.height}
        defaultZoom="fit"
      >
        <GenericCanvas
          forwardedRef={canvasRef}
          config={config}
          formatId={formatId}
          initialProps={page.state}
          onExport={onExport}
          onCancel={onCancel}
          callbacks={callbacks}
          multiPageExport={multiPageExport}
          onToolbarStateChange={onToolbarStateChange}
          onAutoSaveShareToken={onAutoSaveShareToken}
          onLiveState={isActive || onObservedState ? handleLiveState : undefined}
          isActivePage={isActive}
          autoSave={autoSave}
          pageBinding={pageBinding}
        />
      </ZoomableViewport>
    </div>
  );
});
