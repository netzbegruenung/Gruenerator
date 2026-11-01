// SPDX-License-Identifier: MPL-2.0
import React from 'react';

import {
  ContextControls,
  type ContextControlsProps,
} from '@ggraphic/editor/components/TopBar/ContextControls';
import { useCanvasStoreSelector } from '@ggraphic/editor/stores/CanvasStoreProvider';

/**
 * ContextToolbar — desktop floating formatting card, centered over the canvas
 * work area. Wraps the shared ContextControls in the Canva-style surface card.
 * Hidden while an AI suggestion is pending (the menu bar shows the banner then).
 * It only shapes the selection: what acts on the object as a whole sits in the
 * pill on the object (`SelectionPill`).
 */
export function ContextToolbar(props: ContextControlsProps) {
  const hasPendingAiSuggestion = useCanvasStoreSelector((s) => s.pendingAiSuggestion !== null);
  if (hasPendingAiSuggestion) return null;

  return (
    <ContextCard>
      <ContextControls {...props} hideObjectActions />
    </ContextCard>
  );
}

/** The Canva-style surface card the desktop selection bars sit in. */
export function ContextCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-1 max-w-full overflow-x-auto rounded-xl border border-[var(--editor-border-soft)] bg-[var(--editor-surface)] px-2 py-1.5 shadow-[0_2px_8px_rgba(0,0,0,0.06)] animate-canvas-slide-down-fade">
      {children}
    </div>
  );
}
