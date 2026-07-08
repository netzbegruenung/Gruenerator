import React, { useCallback, useEffect, useRef, memo } from 'react';

import { GenericCanvas } from '../GenericCanvas';
import { PageToolbar } from '../PageToolbar';
import { ZoomableViewport } from '../ZoomableViewport';

import { cn } from '../../utils/cn';

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
  isActive,
  canDelete,
  canvasRef,
  onSelect,
  onDelete,
  onMovePage,
  onDuplicatePage,
  onExport,
  onCancel,
  callbacks,
  multiPageExport,
  onStateChange,
  onToolbarStateChange,
  mobileBridge,
  onAutoSaveShareToken,
  pageCollaborative,
  pageRef,
}: PageWrapperProps) {
  const lastReportedRef = useRef<{
    state: Record<string, unknown> | null;
    actions: Record<string, unknown> | null;
    selectedElement: string | null;
  }>({ state: null, actions: null, selectedElement: null });

  useEffect(() => {
    if (!canvasRef) return undefined;

    const checkRef = () => {
      const ref = canvasRef.current;
      if (ref && isActive) {
        const state = ref.getState?.();
        const actions = ref.getActions?.();
        const selectedElement = ref.getSelectedElement?.() ?? null;
        if (state && actions) {
          const last = lastReportedRef.current;
          if (
            last.state !== state ||
            last.actions !== actions ||
            last.selectedElement !== selectedElement
          ) {
            lastReportedRef.current = { state, actions, selectedElement };
            onStateChange(page.id, state, actions, selectedElement);
          }
        }
      }
    };

    checkRef();

    if (isActive) {
      const interval = setInterval(checkRef, 200);
      return () => clearInterval(interval);
    }
    return undefined;
  }, [canvasRef, isActive, page.id, onStateChange]);

  // Functional setState callback (Rule 5.5: stable callback)
  const handleSelect = useCallback(() => {
    onSelect(index);
  }, [onSelect, index]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
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
        isActive && 'heterogeneous-multipage__page-wrapper--active'
      )}
      onClick={handleSelect}
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
          initialProps={page.state}
          onExport={onExport}
          onCancel={onCancel}
          callbacks={callbacks}
          multiPageExport={multiPageExport}
          mobileBridge={mobileBridge}
          onToolbarStateChange={onToolbarStateChange}
          onAutoSaveShareToken={onAutoSaveShareToken}
          collaborative={pageCollaborative}
        />
      </ZoomableViewport>
    </div>
  );
});
