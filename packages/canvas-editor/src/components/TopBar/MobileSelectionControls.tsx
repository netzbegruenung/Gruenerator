import React from 'react';

import { HIDDEN_SCROLLBAR } from '../../sidebar/sidebarStyles';
import { useCanvasStoreSelector } from '../../stores/CanvasStoreProvider';
import { cn } from '../../utils/cn';

import { ContextControls, type ContextControlsProps } from './ContextControls';

import type { FloatingModuleState } from '../../hooks/useFloatingModuleState';

const SELECTION_LABELS: Record<FloatingModuleState['type'], string> = {
  text: 'Text',
  image: 'Bild',
  'user-image': 'Bild',
  shape: 'Form',
  icon: 'Icon',
  illustration: 'Illustration',
  asset: 'Grafik',
  background: 'Hintergrund',
  balken: 'Balken',
  frame: 'Rahmen',
};

/**
 * MobileSelectionControls — the "Auswahl" block at the top of the mobile area
 * sheet, shown when the user opens a selection's area via "Mehr". It carries
 * the selection's formatting controls (the desktop ContextToolbar's content);
 * without an open sheet they live in `MobileSelectionBar`. Hidden while an AI
 * suggestion is pending.
 */
export function MobileSelectionControls(props: ContextControlsProps) {
  const hasPendingAiSuggestion = useCanvasStoreSelector((s) => s.pendingAiSuggestion !== null);
  if (hasPendingAiSuggestion) return null;

  const type = props.activeFloatingModule?.type;

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[13px] font-bold text-[var(--editor-text-muted)]">
        Auswahl{type ? ` · ${SELECTION_LABELS[type]}` : ''}
      </span>
      <div
        className={cn(
          'flex items-center gap-1.5 overflow-x-auto -mx-5 px-5 py-1',
          HIDDEN_SCROLLBAR
        )}
      >
        <ContextControls {...props} />
      </div>
    </div>
  );
}
