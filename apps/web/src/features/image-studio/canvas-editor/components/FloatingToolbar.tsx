import React, { memo, useState, useEffect } from 'react';

import { FONT_COLORS } from '../utils/shapes';

import { FloatingTapBar } from './FloatingTapBar/FloatingTapBar';
import { FloatingColorPicker } from './FloatingTapBar/modules/FloatingColorPicker';
import { FloatingFontSizeControl } from './FloatingTapBar/modules/FloatingFontSizeControl';
import { FloatingHistoryControls } from './FloatingTapBar/modules/FloatingHistoryControls';
import { FloatingLayerControls } from './FloatingTapBar/modules/FloatingLayerControls';
import { FloatingOpacityControl } from './FloatingTapBar/modules/FloatingOpacityControl';

import type { FloatingModuleState } from '../hooks/useFloatingModuleState';

/**
 * FloatingToolbar - Floating toolbar with contextual controls
 *
 * Renders a floating toolbar above the canvas with:
 * - History controls (undo/redo)
 * - Layer controls (move up/down)
 * - Element-specific controls (color, opacity, font size)
 * - Optional delete button (for multi-page mode)
 * - Optional page indicator (for multi-page navigation)
 */

/**
 * Page navigation info for multi-page mode.
 * When provided, shows a page indicator with prev/next controls.
 */
export interface PageInfo {
  /** Current page index (0-based) */
  current: number;
  /** Total number of pages */
  total: number;
  /** Navigate to previous page */
  onPrev: () => void;
  /** Navigate to next page */
  onNext: () => void;
  /** Optional: Navigate to specific page */
  onGoTo?: (index: number) => void;
}

interface FloatingToolbarProps {
  selectedElement: string | null;
  activeFloatingModule: FloatingModuleState | null;
  canUndo: boolean;
  canRedo: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  handlers: {
    undo: () => void;
    redo: () => void;
    handleMoveLayer: (direction: 'up' | 'down') => void;
    handleColorSelect: (color: string) => void;
    handleOpacityChange: (id: string, opacity: number, type: string) => void;
    handleFontSizeChange: (id: string, size: number) => void;
  };
  onDelete?: () => void;
  /** Optional page info for multi-page navigation */
  pageInfo?: PageInfo;
}

export const FloatingToolbar = memo(
  ({
    selectedElement,
    activeFloatingModule,
    canUndo,
    canRedo,
    canMoveUp,
    canMoveDown,
    handlers,
    onDelete,
    pageInfo,
  }: FloatingToolbarProps) => {
    const [isColorPickerExpanded, setIsColorPickerExpanded] = useState(false);
    const [isMobile, setIsMobile] = useState(
      typeof window !== 'undefined' && window.innerWidth < 900
    );

    useEffect(() => {
      const handleResize = () => setIsMobile(window.innerWidth < 900);
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }, []);

    // On mobile, hide other controls when color picker is expanded
    const shouldHideOtherControls = isMobile && isColorPickerExpanded;

    return (
      <FloatingTapBar visible={true}>
        {!shouldHideOtherControls && onDelete && (
          <>
            <button
              className="floating-icon-btn floating-icon-btn--danger"
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
            <div className="floating-separator" />
          </>
        )}

        {!shouldHideOtherControls && (
          <FloatingHistoryControls
            onUndo={handlers.undo}
            onRedo={handlers.redo}
            canUndo={canUndo}
            canRedo={canRedo}
          />
        )}

        {!shouldHideOtherControls && selectedElement && (
          <>
            <div className="floating-separator" />
            <FloatingLayerControls
              onMoveUp={() => handlers.handleMoveLayer('up')}
              onMoveDown={() => handlers.handleMoveLayer('down')}
              canMoveUp={canMoveUp}
              canMoveDown={canMoveDown}
            />
          </>
        )}

        {activeFloatingModule && (
          <>
            {!shouldHideOtherControls && <div className="floating-separator" />}

            {activeFloatingModule.type === 'text' && (
              <>
                <FloatingColorPicker
                  currentColor={activeFloatingModule.data.fill || '#000000'}
                  onColorSelect={handlers.handleColorSelect}
                  isExpanded={isColorPickerExpanded}
                  onExpandChange={setIsColorPickerExpanded}
                  colors={FONT_COLORS}
                />
                {!shouldHideOtherControls && (
                  <>
                    <div className="floating-separator" />
                    <FloatingFontSizeControl
                      fontSize={activeFloatingModule.data.fontSize ?? 16}
                      onFontSizeChange={(size) =>
                        handlers.handleFontSizeChange(activeFloatingModule.data.id, size)
                      }
                    />
                    <div className="floating-separator" />
                    <FloatingOpacityControl
                      opacity={activeFloatingModule.data.opacity ?? 1}
                      onOpacityChange={(val) =>
                        handlers.handleOpacityChange(activeFloatingModule.data.id, val, 'text')
                      }
                    />
                  </>
                )}
              </>
            )}

            {activeFloatingModule.type === 'image' && (
              <>
                {activeFloatingModule.data.fill !== undefined && (
                  <>
                    <FloatingColorPicker
                      currentColor={activeFloatingModule.data.fill || '#FFFFFF'}
                      onColorSelect={handlers.handleColorSelect}
                      isExpanded={isColorPickerExpanded}
                      onExpandChange={setIsColorPickerExpanded}
                    />
                    {!shouldHideOtherControls && <div className="floating-separator" />}
                  </>
                )}
                {!shouldHideOtherControls && (
                  <FloatingOpacityControl
                    opacity={activeFloatingModule.data.opacity ?? 1}
                    onOpacityChange={(val) =>
                      handlers.handleOpacityChange(activeFloatingModule.data.id, val, 'image')
                    }
                  />
                )}
              </>
            )}

            {(activeFloatingModule.type === 'shape' ||
              activeFloatingModule.type === 'icon' ||
              activeFloatingModule.type === 'illustration' ||
              activeFloatingModule.type === 'asset') && (
              <>
                <FloatingColorPicker
                  currentColor={
                    activeFloatingModule.type === 'shape'
                      ? (activeFloatingModule.data.fill ?? '#000000')
                      : (activeFloatingModule.data.color ?? '#000000')
                  }
                  onColorSelect={handlers.handleColorSelect}
                  isExpanded={isColorPickerExpanded}
                  onExpandChange={setIsColorPickerExpanded}
                />
                {!shouldHideOtherControls && (
                  <>
                    <div className="floating-separator" />
                    <FloatingOpacityControl
                      opacity={activeFloatingModule.data.opacity ?? 1}
                      onOpacityChange={(val) =>
                        handlers.handleOpacityChange(
                          activeFloatingModule.data.id,
                          val,
                          activeFloatingModule.type as 'shape' | 'icon' | 'illustration' | 'asset'
                        )
                      }
                    />
                  </>
                )}
              </>
            )}

            {activeFloatingModule.type === 'background' && (
              <>
                {activeFloatingModule.data.fill !== undefined && (
                  <>
                    <FloatingColorPicker
                      currentColor={activeFloatingModule.data.fill || '#FFFFFF'}
                      onColorSelect={handlers.handleColorSelect}
                      isExpanded={isColorPickerExpanded}
                      onExpandChange={setIsColorPickerExpanded}
                    />
                    {!shouldHideOtherControls && <div className="floating-separator" />}
                  </>
                )}
                {!shouldHideOtherControls && (
                  <FloatingOpacityControl
                    opacity={activeFloatingModule.data.opacity ?? 1}
                    onOpacityChange={(val) =>
                      handlers.handleOpacityChange(activeFloatingModule.data.id, val, 'background')
                    }
                  />
                )}
              </>
            )}

            {activeFloatingModule.type === 'balken' && !shouldHideOtherControls && (
              <FloatingOpacityControl
                opacity={activeFloatingModule.data.opacity ?? 1}
                onOpacityChange={(val) =>
                  handlers.handleOpacityChange(activeFloatingModule.data.id, val, 'balken')
                }
              />
            )}
          </>
        )}
      </FloatingTapBar>
    );
  }
);

FloatingToolbar.displayName = 'FloatingToolbar';
