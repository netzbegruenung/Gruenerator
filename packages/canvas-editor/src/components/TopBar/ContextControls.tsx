import React, { useState } from 'react';

import { FONT_COLORS, STROKE_ONLY_SHAPES } from '../../utils/shapes';

import { FloatingColorPicker } from './modules/FloatingColorPicker';
import { FloatingFontSizeControl } from './modules/FloatingFontSizeControl';
import { FloatingGradientControl } from './modules/FloatingGradientControl';
import { FloatingLayerControls } from './modules/FloatingLayerControls';
import { FloatingOpacityControl } from './modules/FloatingOpacityControl';
import { FloatingOutlineControl } from './modules/FloatingOutlineControl';
import { FloatingShadowControl } from './modules/FloatingShadowControl';

import { type AlignmentDirection } from '../Toolbar';
import { type FloatingModuleState } from '../../hooks/useFloatingModuleState';
import { type ShadowPatch } from '../../hooks/useFloatingModuleHandlers';
import { type GradientFill } from '../../utils/gradientFill';

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
    handleShadowChange?: (id: string, patch: ShadowPatch, type: string) => void;
    handleOutlineChange?: (id: string, patch: { stroke?: string; strokeWidth?: number }) => void;
    handleBlurChange?: (id: string, blur: number) => void;
    handleGradientSelect?: (gradient: GradientFill | null) => void;
    /** Opens the image-adjust ("Bearbeiten") panel for the selected image. */
    onEditImage?: () => void;
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

  // Build the present control groups, then interleave separators — this keeps
  // dividers strictly between groups (no dangling leading/trailing divider
  // regardless of which groups are visible).
  const groups: React.ReactNode[] = [];

  if (colorConfig) {
    groups.push(
      <FloatingColorPicker
        key="color"
        currentColor={colorConfig.color}
        onColorSelect={handlers.handleColorSelect}
        isExpanded={isColorPickerExpanded}
        onExpandChange={setIsColorPickerExpanded}
        variant={colorConfig.variant}
        {...(isText ? { colors: FONT_COLORS } : {})}
      />
    );
  }

  if (isText && activeFloatingModule) {
    groups.push(
      <FloatingFontSizeControl
        key="fontsize"
        fontSize={activeFloatingModule.data.fontSize ?? 16}
        onFontSizeChange={(size) =>
          handlers.handleFontSizeChange(activeFloatingModule.data.id, size)
        }
      />
    );
  }

  if (isText && handlers.handleAlign) {
    groups.push(
      <div key="align" className="flex items-center gap-0.5">
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
    );
  }

  const type = activeFloatingModule?.type;
  // Only instance-backed text (additionalTexts) stores effect fields; config
  // template texts route through state keys and don't support these controls.
  const isEffectText = type === 'text' && !!activeFloatingModule?.data.isInstanceText;
  // Stroke-only shapes (lines/arrows) render no fill area, so a gradient fill
  // would be a dead control on them.
  const isFillableShape =
    type === 'shape' && !STROKE_ONLY_SHAPES.has(String(activeFloatingModule?.data.type));

  if ((isFillableShape || isEffectText) && activeFloatingModule && handlers.handleGradientSelect) {
    groups.push(
      <FloatingGradientControl
        key="gradient"
        currentColor={activeFloatingModule.data.fill ?? '#000000'}
        gradient={activeFloatingModule.data.fillGradient ?? null}
        onChange={(gradient) => handlers.handleGradientSelect!(gradient)}
      />
    );
  }

  if (isEffectText && activeFloatingModule && handlers.handleOutlineChange) {
    groups.push(
      <FloatingOutlineControl
        key="outline"
        stroke={activeFloatingModule.data.stroke}
        strokeWidth={activeFloatingModule.data.strokeWidth}
        onChange={(patch) => handlers.handleOutlineChange!(activeFloatingModule.data.id, patch)}
      />
    );
  }

  if (
    (type === 'shape' || isEffectText || type === 'user-image') &&
    activeFloatingModule &&
    handlers.handleShadowChange
  ) {
    groups.push(
      <FloatingShadowControl
        key="shadow"
        shadowColor={activeFloatingModule.data.shadowColor}
        shadowBlur={activeFloatingModule.data.shadowBlur}
        shadowOffsetX={activeFloatingModule.data.shadowOffsetX}
        shadowOffsetY={activeFloatingModule.data.shadowOffsetY}
        shadowOpacity={activeFloatingModule.data.shadowOpacity}
        onChange={(patch) =>
          handlers.handleShadowChange!(
            activeFloatingModule.data.id,
            patch,
            activeFloatingModule.type
          )
        }
      />
    );
  }

  if (type === 'user-image' && handlers.onEditImage) {
    groups.push(
      <button
        key="edit-image"
        className="inline-flex items-center gap-1.5 h-8 shrink-0 rounded-md border-none bg-transparent px-2 cursor-pointer text-[13px] font-medium text-[var(--editor-text)] transition-colors duration-150 hover:bg-[var(--editor-surface-hover)] hover:text-[var(--editor-active-fg)]"
        onClick={() => handlers.onEditImage!()}
        title="Bild anpassen (Filter, Helligkeit, Kontrast…)"
        type="button"
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" />
        </svg>
        Bearbeiten
      </button>
    );
  }

  if (showOpacity && activeFloatingModule) {
    groups.push(
      <FloatingOpacityControl
        key="opacity"
        opacity={activeFloatingModule.data.opacity ?? 1}
        onOpacityChange={(val) =>
          handlers.handleOpacityChange(activeFloatingModule.data.id, val, activeFloatingModule.type)
        }
      />
    );
  }

  if (selectedElement) {
    groups.push(
      <FloatingLayerControls
        key="layer"
        onMoveUp={() => handlers.handleMoveLayer('up')}
        onMoveDown={() => handlers.handleMoveLayer('down')}
        canMoveUp={canMoveUp}
        canMoveDown={canMoveDown}
      />
    );
  }

  if (onDelete) {
    groups.push(
      <button
        key="delete"
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
    );
  }

  return (
    <>
      {groups.map((group, i) => (
        <React.Fragment key={i}>
          {i > 0 && <div className={SEP} />}
          {group}
        </React.Fragment>
      ))}
    </>
  );
}
