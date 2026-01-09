import React, { memo, useState, useEffect } from 'react';
import { FloatingTapBar } from './FloatingTapBar/FloatingTapBar';
import { FloatingColorPicker } from './FloatingTapBar/modules/FloatingColorPicker';
import { FloatingHistoryControls } from './FloatingTapBar/modules/FloatingHistoryControls';
import { FloatingFontSizeControl } from './FloatingTapBar/modules/FloatingFontSizeControl';
import { FloatingOpacityControl } from './FloatingTapBar/modules/FloatingOpacityControl';
import { FloatingLayerControls } from './FloatingTapBar/modules/FloatingLayerControls';
import type { FloatingModuleState } from '../hooks/useFloatingModuleState';

/**
 * FloatingToolbar - Floating toolbar with contextual controls
 *
 * Renders a floating toolbar above the canvas with:
 * - History controls (undo/redo)
 * - Layer controls (move up/down)
 * - Element-specific controls (color, opacity, font size)
 * - Optional delete button (for multi-page mode)
 */

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
}

export const FloatingToolbar = memo(({
    selectedElement,
    activeFloatingModule,
    canUndo,
    canRedo,
    canMoveUp,
    canMoveDown,
    handlers,
    onDelete,
}: FloatingToolbarProps) => {
    const [isColorPickerExpanded, setIsColorPickerExpanded] = useState(false);
    const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 900);

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
                            />
                            {!shouldHideOtherControls && (
                                <>
                                    <div className="floating-separator" />
                                    <FloatingFontSizeControl
                                        fontSize={activeFloatingModule.data.fontSize}
                                        onFontSizeChange={(size) =>
                                            handlers.handleFontSizeChange(activeFloatingModule.data.id, size)
                                        }
                                    />
                                    <div className="floating-separator" />
                                    <FloatingOpacityControl
                                        opacity={activeFloatingModule.data.opacity ?? 1}
                                        onOpacityChange={(val) =>
                                            handlers.handleOpacityChange(
                                                activeFloatingModule.data.id,
                                                val,
                                                'text'
                                            )
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
                                        handlers.handleOpacityChange(
                                            activeFloatingModule.data.id,
                                            val,
                                            'image'
                                        )
                                    }
                                />
                            )}
                        </>
                    )}

                    {(activeFloatingModule.type === 'shape' ||
                        activeFloatingModule.type === 'icon' ||
                        activeFloatingModule.type === 'illustration') && (
                        <>
                            <FloatingColorPicker
                                currentColor={
                                    activeFloatingModule.type === 'shape'
                                        ? activeFloatingModule.data.fill
                                        : activeFloatingModule.data.color || '#000000'
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
                                                activeFloatingModule.type as 'shape' | 'icon' | 'illustration'
                                            )
                                        }
                                    />
                                </>
                            )}
                        </>
                    )}
                </>
            )}
        </FloatingTapBar>
    );
});

FloatingToolbar.displayName = 'FloatingToolbar';
