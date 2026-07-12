import React from 'react';

import { useCanvasStoreSelector } from '../../stores/CanvasStoreProvider';

import { ContextControls, type ContextControlsProps } from './ContextControls';

/**
 * MobileContextBar — fixed formatting row shown only below the canvas-mobile
 * breakpoint, sitting directly above the mobile tab bar (3b layout). Scrolls
 * horizontally so every control stays reachable on narrow screens.
 * Hidden while an AI suggestion is pending.
 */
export function MobileContextBar(props: ContextControlsProps) {
  const hasPendingAiSuggestion = useCanvasStoreSelector((s) => s.pendingAiSuggestion !== null);
  if (hasPendingAiSuggestion) return null;

  return (
    <div className="hidden max-canvas-mobile:flex fixed inset-x-0 bottom-[var(--mobile-tab-bar-height)] z-[98] items-center gap-1.5 overflow-x-auto border-t border-[var(--editor-border)] bg-[var(--editor-surface)] px-2.5 py-2">
      <ContextControls {...props} />
    </div>
  );
}
