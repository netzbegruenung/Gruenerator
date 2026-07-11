import React, { useState } from 'react';

import { FONT_COLORS } from '../../utils/shapes';

import { FloatingColorPicker } from './modules/FloatingColorPicker';
import { FloatingFontSizeControl } from './modules/FloatingFontSizeControl';
import { FloatingLayerControls } from './modules/FloatingLayerControls';
import { FloatingOpacityControl } from './modules/FloatingOpacityControl';

import type { AlignmentDirection } from '../Toolbar';
import type { FloatingModuleState } from '../../hooks/useFloatingModuleState';

export interface ContextControlsProps {
  selectedElement: string | null;
  activeFloatingModule: FloatingModuleState | null;
  canMoveUp: boolean;
  canMoveDown: boolean;
  handlers: {
    handleMoveLayer: (direction: 'up' | 'down') => void;
    handleColorSelect: (color: string) => void;
    handleOpacityChange: (id: string, opacity: number, type: string) => void;
    handleFontSizeChange: (id: string, size: number) => void;
    handleAlign?: (direction: AlignmentDirection) => void;
  };
  onDelete?: () => void;
}

const ICON_BTN =
  'inline-flex items-center justify-center size-8 shrink-0 rounded-md border-none bg-transparent cursor-pointer text-[var(--editor-text)] transition-colors duration-150 hover:bg-[var(--editor-surface-hover)] hover:text-[var(--editor-active-fg)] disabled:opacity-30 disabled:cursor-not-allowed';

const SEP = 'w-px h-[22px] bg-[var(--editor-border-soft)] mx-1 shrink-0';

/**
 * ContextControls — the selection-driven formatting controls (color, font size,
 * alignment, opacity, layer order, delete page). Shared between the desktop
 * floating ContextToolbar and the mobile bottom context row; owns its own
 * color-picker expansion state. Renders nothing when there is no active module.
 */
export function ContextControls({
  selectedElement,
  activeFloatingModule,
  canMoveUp,
  canMoveDown,
  handlers,
  onDelete,
}: ContextControlsProps) {
  const [isColorPickerExpanded, setIsColorPickerExpanded] = useState(false);

  const showColorFor = (type: FloatingModuleState['type']) => {
    if (type === 'text') {
      return { color: activeFloatingModule?.data.fill || '#000000', variant: 'font' as const };
    }
    if (type === 'image' || type === 'background') {
      return activeFloatingModule?.data.fill !== undefined
        ? { color: activeFloatingModule?.data.fill || '#FFFFFF', variant: 'swatch' as const }
        : null;
    }
    if (type === 'shape') {
      return { color: activeFloatingModule?.data.fill ?? '#000000', variant: 'swatch' as const };
    }
    if (type === 'icon' || type === 'illustration' || type === 'asset') {
      return { color: activeFloatingModule?.data.color ?? '#000000', variant: 'swatch' as const };
    }
    return null;
  };

  const colorConfig = activeFloatingModule ? showColorFor(activeFloatingModule.type) : null;
  // Frame elements expose no formatting controls (matches prior Toolbar behavior).
  const showOpacity = activeFloatingModule && activeFloatingModule.type !== 'frame';
  const isText = activeFloatingModule?.type === 'text';

  return (
    <>
      {colorConfig && (
        <FloatingColorPicker
          currentColor={colorConfig.color}
          onColorSelect={handlers.handleColorSelect}
          isExpanded={isColorPickerExpanded}
          onExpandChange={setIsColorPickerExpanded}
          colors={isText ? FONT_COLORS : undefined}
          variant={colorConfig.variant}
        />
      )}

      {isText && activeFloatingModule && (
        <>
          <div className={SEP} />
          <FloatingFontSizeControl
            fontSize={activeFloatingModule.data.fontSize ?? 16}
            onFontSizeChange={(size) =>
              handlers.handleFontSizeChange(activeFloatingModule.data.id, size)
            }
          />
        </>
      )}

      {isText && handlers.handleAlign && (
        <>
          <div className={SEP} />
          <div className="flex items-center gap-0.5">
            <button
              className={ICON_BTN}
              onClick={() => handlers.handleAlign!('left')}
              title="Links ausrichten"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <line x1="4" y1="4" x2="4" y2="20" />
                <rect x="8" y="6" width="12" height="4" rx="1" />
                <rect x="8" y="14" width="8" height="4" rx="1" />
              </svg>
            </button>
            <button
              className={ICON_BTN}
              onClick={() => handlers.handleAlign!('center-h')}
              title="Horizontal zentrieren"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <line x1="12" y1="2" x2="12" y2="22" />
                <rect x="4" y="6" width="16" height="4" rx="1" />
                <rect x="6" y="14" width="12" height="4" rx="1" />
              </svg>
            </button>
            <button
              className={ICON_BTN}
              onClick={() => handlers.handleAlign!('center-v')}
              title="Vertikal zentrieren"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <line x1="2" y1="12" x2="22" y2="12" />
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="6" width="4" height="12" rx="1" />
              </svg>
            </button>
          </div>
        </>
      )}

      {showOpacity && activeFloatingModule && (
        <>
          <div className={SEP} />
          <FloatingOpacityControl
            opacity={activeFloatingModule.data.opacity ?? 1}
            onOpacityChange={(val) =>
              handlers.handleOpacityChange(
                activeFloatingModule.data.id,
                val,
                activeFloatingModule.type
              )
            }
          />
        </>
      )}

      {selectedElement && (
        <>
          <div className={SEP} />
          <FloatingLayerControls
            onMoveUp={() => handlers.handleMoveLayer('up')}
            onMoveDown={() => handlers.handleMoveLayer('down')}
            canMoveUp={canMoveUp}
            canMoveDown={canMoveDown}
          />
        </>
      )}

      {onDelete && (
        <>
          <div className={SEP} />
          <button
            className="inline-flex items-center justify-center size-8 shrink-0 rounded-md border-none bg-transparent cursor-pointer text-[var(--editor-text-secondary)] transition-colors duration-150 hover:text-red-600 hover:bg-red-500/10"
            onClick={() => {
              if (window.confirm('Seite wirklich löschen?')) {
                onDelete();
              }
            }}
            title="Seite löschen"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        </>
      )}
    </>
  );
}
