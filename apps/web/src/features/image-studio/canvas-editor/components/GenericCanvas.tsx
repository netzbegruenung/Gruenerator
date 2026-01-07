/**
 * GenericCanvas - Unified config-driven canvas component
 * 
 * Renders any canvas type based on FullCanvasConfig.
 * Manages state, history, interactions, and sidebar.
 */

import React, { useRef, useState, useEffect, useCallback, useMemo, memo } from 'react';
import { CanvasStage, SnapGuidelines, CanvasText } from '../primitives';
import { BalkenGroup } from '../primitives/BalkenGroup';
import type { BalkenInstance } from '../primitives';
import { IconPrimitive } from '../primitives/IconPrimitive';
import { ShapePrimitive } from '../primitives/ShapePrimitive';
import { ALL_ICONS } from '../utils/canvasIcons';
import type { ShapeInstance } from '../utils/shapes';
import { GenericCanvasEditor } from './GenericCanvasEditor';
import { GenericCanvasElement } from './GenericCanvasElement';
import { FloatingTapBar } from './FloatingTapBar/FloatingTapBar';
import { FloatingColorPicker } from './FloatingTapBar/modules/FloatingColorPicker';
import { FloatingHistoryControls } from './FloatingTapBar/modules/FloatingHistoryControls';
import { FloatingFontSizeControl } from './FloatingTapBar/modules/FloatingFontSizeControl';
import { FloatingOpacityControl } from './FloatingTapBar/modules/FloatingOpacityControl';
import { FloatingLayerControls } from './FloatingTapBar/modules/FloatingLayerControls';
import type { FullCanvasConfig, LayoutResult, CanvasElementConfig } from '../configs/types';
import type { CanvasStageRef } from '../primitives/CanvasStage';
import { useCanvasInteractions, useCanvasStoreSetup, useCanvasHistorySetup } from '../hooks';
import { useCanvasEditorStore, useSnapGuides, useSnapLines } from '../../../../stores/canvasEditorStore';

// ============================================================================
// UTILITIES
// ============================================================================

function resolveValue<T>(
    value: T | ((state: any, layout: LayoutResult) => T),
    state: any,
    layout: LayoutResult
): T {
    if (typeof value === 'function') {
        return (value as (state: any, layout: LayoutResult) => T)(state, layout);
    }
    return value;
}


// ============================================================================
// PROPS INTERFACE
// ============================================================================

export interface GenericCanvasProps<TState, TActions> {
    /** Canvas configuration */
    config: FullCanvasConfig<TState, TActions>;
    /** Initial props from parent (text content, image sources, etc.) */
    initialProps: Record<string, any>;
    /** Export handler */
    onExport: (base64: string) => void;
    /** Optional save handler */
    onSave?: (base64: string) => void;
    /** Cancel handler */
    onCancel: () => void;
    /** Callbacks for syncing state changes to parent */
    callbacks?: Record<string, ((val: any) => void) | undefined>;
    /** CSS class name */
    className?: string;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

function GenericCanvasInner<TState extends Record<string, any>, TActions>({
    config,
    initialProps,
    onExport,
    onSave,
    onCancel,
    callbacks = {},
    className,
}: GenericCanvasProps<TState, TActions>) {
    const stageRef = useRef<CanvasStageRef>(null);

    // Initialize canvas store
    useCanvasStoreSetup(config.id, stageRef);

    // State management
    const [state, setStateRaw] = useState<TState>(() => config.createInitialState(initialProps));

    // Sync initial props changes
    useEffect(() => {
        setStateRaw(config.createInitialState(initialProps));
    }, [config, initialProps]);

    // Wrapper for setState that triggers history save
    const setStateWrapper = useCallback((partial: Partial<TState> | ((prev: TState) => TState)) => {
        setStateRaw((prev) => {
            if (typeof partial === 'function') {
                return partial(prev);
            }
            return { ...prev, ...partial };
        });
    }, []);

    // History management
    const collectState = useCallback(() => state, [state]);

    const handleRestore = useCallback((restoredState: Record<string, unknown>) => {
        setStateRaw((prev) => ({ ...prev, ...restoredState } as TState));
    }, []);

    const { saveToHistory, debouncedSaveToHistory, collectStateRef, undo, redo, canUndo, canRedo } = useCanvasHistorySetup(
        collectState,
        handleRestore,
        500
    );

    // Get current state for actions
    const getState = useCallback(() => state, [state]);

    // Create actions from config
    const actions = useMemo(() => {
        return config.createActions(
            getState,
            setStateWrapper,
            saveToHistory,
            debouncedSaveToHistory,
            callbacks
        );
    }, [config, getState, setStateWrapper, saveToHistory, debouncedSaveToHistory, callbacks]);

    // Calculate layout
    const layout = useMemo<LayoutResult>(() => {
        return config.calculateLayout(state);
    }, [config, state]);

    // Interactions
    const {
        selectedElement,
        setSelectedElement,
        handleStageClick,
        handleSnapChange,
        handlePositionChange,
        handleExport,
        handleSave,
        getSnapTargets,
    } = useCanvasInteractions<string | null>({ stageRef, onExport, onSave });

    const snapGuides = useSnapGuides();
    const snapLines = useSnapLines();
    const { setSnapLines, updateElementPosition } = useCanvasEditorStore();

    // Element interaction handlers
    const handleElementSelect = useCallback((id: string) => {
        setSelectedElement(id);
    }, [setSelectedElement]);

    const handleTextChange = useCallback((id: string, text: string) => {
        // Find the element config to get the text key
        const elementConfig = config.elements.find(e => e.id === id);
        if (elementConfig && elementConfig.type === 'text') {
            const textKey = elementConfig.textKey;
            setStateWrapper((prev) => ({ ...prev, [textKey]: text }));

            // Call parent callback if exists
            const callbackKey = `on${textKey.charAt(0).toUpperCase() + textKey.slice(1)}Change`;
            callbacks[callbackKey]?.(text);

            debouncedSaveToHistory({ ...state, [textKey]: text });
        }
    }, [config.elements, setStateWrapper, callbacks, debouncedSaveToHistory, state]);

    const handleFontSizeChange = useCallback((id: string, size: number) => {
        const elementConfig = config.elements.find(e => e.id === id);
        if (elementConfig && elementConfig.type === 'text' && elementConfig.fontSizeStateKey) {
            const next = { ...state, [elementConfig.fontSizeStateKey!]: size };
            setStateWrapper(() => next);
            debouncedSaveToHistory(next);
            return;
        }

        // Handle Additional Texts
        if ((state as any).additionalTexts?.find((t: any) => t.id === id)) {
            if ((actions as any).updateAdditionalText) {
                (actions as any).updateAdditionalText(id, { fontSize: size });
                // Assuming updateAdditionalText updates the state, we save the current state after the action.
                // If updateAdditionalText handles history internally, this might be redundant.
                debouncedSaveToHistory(state);
            }
        }
    }, [config.elements, state, actions, setStateWrapper, debouncedSaveToHistory]);

    const handleElementPositionChange = useCallback((id: string, x: number, y: number, w: number, h: number) => {
        updateElementPosition(id, x, y, w, h);

        const elementConfig = config.elements.find(e => e.id === id);
        if (elementConfig && elementConfig.type === 'text' && (elementConfig as any).positionStateKey) {
            setStateWrapper((prev) => ({ ...prev, [(elementConfig as any).positionStateKey]: { x, y } }));
        }
    }, [config.elements, updateElementPosition, setStateWrapper]);

    const handleImageDragEnd = useCallback((id: string, x: number, y: number) => {
        const elementConfig = config.elements.find(e => e.id === id);
        if (elementConfig && elementConfig.type === 'image' && elementConfig.offsetKey) {
            const baseX = typeof elementConfig.x === 'number' ? elementConfig.x : 0;
            const baseY = typeof elementConfig.y === 'number' ? elementConfig.y : 0;
            const newOffset = { x: x - baseX, y: y - baseY };
            setStateWrapper((prev) => ({ ...prev, [elementConfig.offsetKey!]: newOffset }));
            saveToHistory({ ...state, [elementConfig.offsetKey!]: newOffset });
        }
    }, [config.elements, setStateWrapper, saveToHistory, state]);

    const handleImageTransformEnd = useCallback((id: string, x: number, y: number, w: number, h: number) => {
        const elementConfig = config.elements.find(e => e.id === id);
        if (elementConfig && elementConfig.type === 'image') {
            const updates: Partial<TState> = {};

            if (elementConfig.offsetKey) {
                const baseX = typeof elementConfig.x === 'number' ? elementConfig.x : 0;
                const baseY = typeof elementConfig.y === 'number' ? elementConfig.y : 0;
                (updates as any)[elementConfig.offsetKey] = { x: x - baseX, y: y - baseY };
            }

            if (elementConfig.scaleKey) {
                const baseWidth = typeof elementConfig.width === 'number' ? elementConfig.width : 100;
                const currentScale = state[elementConfig.scaleKey as keyof TState] as number || 1;
                const newScale = currentScale * (w / (baseWidth * currentScale));
                (updates as any)[elementConfig.scaleKey] = newScale;
            }

            setStateWrapper((prev) => ({ ...prev, ...updates }));
            saveToHistory({ ...state, ...updates });
        }
    }, [config.elements, setStateWrapper, saveToHistory, state]);

    // Unified Layer Management
    // We maintain a layerOrder array in state: string[] (IDs).
    // If not present, we build one on the fly from current items, respecting implicit legacy order.
    // Legacy Order: ConfigElements (by order) -> Balkens -> Icons -> Shapes.

    // Helper to get all current item IDs and their definitions
    const canvasItems = useMemo(() => {
        const items: { id: string; type: 'element' | 'balken' | 'icon' | 'shape' | 'additional-text'; data?: any }[] = [];

        // 1. Config Elements
        // Sort by their intrinsic order first to establish a stable default baseline
        const sortedConfigElements = [...config.elements].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        sortedConfigElements.forEach(el => items.push({ id: el.id, type: 'element', data: el }));

        // 2. Balkens
        if ((state as any).balkenInstances) {
            (state as any).balkenInstances.forEach((b: any) => items.push({ id: b.id, type: 'balken', data: b }));
        }

        // 3. Icons
        if ((state as any).selectedIcons) {
            (state as any).selectedIcons.forEach((id: string) => items.push({ id: id, type: 'icon' }));
        }

        // 4. Shapes
        if ((state as any).shapeInstances) {
            (state as any).shapeInstances.forEach((s: any) => items.push({ id: s.id, type: 'shape', data: s }));
        }

        // 5. Additional Texts
        if ((state as any).additionalTexts) {
            (state as any).additionalTexts.forEach((t: any) => items.push({ id: t.id, type: 'additional-text', data: t }));
        }

        return items;
    }, [config.elements, state]);

    // Construct the effectively sorted render list
    const sortedRenderList = useMemo(() => {
        const layerOrder: string[] = (state as any).layerOrder || [];

        // Clone items to avoid mutating source
        const pendingItems = [...canvasItems];
        const result: typeof canvasItems = [];

        // 1. Add items that are in layerOrder, in that order
        layerOrder.forEach(id => {
            const idx = pendingItems.findIndex(item => item.id === id);
            if (idx !== -1) {
                result.push(pendingItems[idx]);
                pendingItems.splice(idx, 1); // Remove found item
            }
        });

        // 2. Append remaining items (newly added or not tracked yet)
        result.push(...pendingItems);

        return result;
    }, [canvasItems, (state as any).layerOrder]);

    // Handlers for Layer Moving
    const handleMoveLayer = useCallback((direction: 'up' | 'down') => {
        if (!selectedElement) return;

        setStateWrapper((prev: any) => {
            const currentOrder = prev.layerOrder ? [...prev.layerOrder] : sortedRenderList.map(i => i.id);
            const currentIndex = currentOrder.indexOf(selectedElement);

            if (currentIndex === -1) {
                // Should technically not happen if list is sync, but strictly:
                return prev;
            }

            const newOrder = [...currentOrder];
            if (direction === 'up') {
                if (currentIndex < newOrder.length - 1) {
                    [newOrder[currentIndex], newOrder[currentIndex + 1]] = [newOrder[currentIndex + 1], newOrder[currentIndex]];
                }
            } else {
                if (currentIndex > 0) {
                    [newOrder[currentIndex], newOrder[currentIndex - 1]] = [newOrder[currentIndex - 1], newOrder[currentIndex]];
                }
            }

            return { ...prev, layerOrder: newOrder };
        });

        // Note: We should probably save to history here, but debatable if view-only change? 
        // Yes, layers are content.
        saveToHistory({ ...state, layerOrder: sortedRenderList.map(i => i.id) } as any);
        // Caution: simplistic save. Better to rely on useEffect syncing or simpler wrapper.
        // But setStateWrapper doesn't auto-save history for everything usually? 
        // Ah, typically config actions handle history. Here we bypass config actions.
        // We must ensure 'layerOrder' is saved.
    }, [selectedElement, setStateWrapper, sortedRenderList, saveToHistory, state]);

    const canMoveUp = useMemo(() => {
        if (!selectedElement) return false;
        // In sortedRenderList, "Up" means later index (drawn on top).
        const idx = sortedRenderList.findIndex(i => i.id === selectedElement);
        return idx !== -1 && idx < sortedRenderList.length - 1;
    }, [selectedElement, sortedRenderList]);

    const canMoveDown = useMemo(() => {
        if (!selectedElement) return false;
        // In sortedRenderList, "Down" means earlier index (drawn behind).
        const idx = sortedRenderList.findIndex(i => i.id === selectedElement);
        return idx > 0;
    }, [selectedElement, sortedRenderList]);


    // Canvas state for sidebar
    const canvasState = useMemo(() => ({
        ...state,
        isDesktop: typeof window !== 'undefined' && window.innerWidth >= 900,
    }), [state]);

    // Balken handlers (if balken state exists)
    const hasBalken = 'balkenInstances' in state;

    const handleBalkenSelect = useCallback((id: string) => {
        setSelectedElement(id);
    }, [setSelectedElement]);

    const handleBalkenDragEnd = useCallback((id: string, x: number, y: number) => {
        if (!hasBalken) return;
        if ((actions as any).updateBalken) {
            (actions as any).updateBalken(id, { offset: { x, y } });
        }
        handleSnapChange(false, false);
        setSnapLines([]);
    }, [hasBalken, actions, handleSnapChange, setSnapLines]);

    const handleBalkenTransformEnd = useCallback((id: string, x: number, y: number, scale: number, rotation: number) => {
        if (!hasBalken) return;
        if ((actions as any).updateBalken) {
            (actions as any).updateBalken(id, { offset: { x, y }, scale, rotation });
        }
    }, [hasBalken, actions]);

    const handleIconTransformEnd = useCallback((id: string, x: number, y: number, scale: number, rotation: number) => {
        if ((actions as any).updateIcon) {
            (actions as any).updateIcon(id, { x, y, scale, rotation });
        }
    }, [actions]);

    const handleIconDragEnd = useCallback((id: string, x: number, y: number) => {
        if ((actions as any).updateIcon) {
            (actions as any).updateIcon(id, { x, y });
        }
    }, [actions]);

    const handleShapeChange = useCallback((id: string, newAttrs: Partial<ShapeInstance>) => {
        if ((actions as any).updateShape) {
            (actions as any).updateShape(id, newAttrs);
        }
    }, [actions]);

    // Additional Text handlers
    const handleAdditionalTextChange = useCallback((id: string, newAttrs: any) => {
        if ((actions as any).updateAdditionalText) {
            (actions as any).updateAdditionalText(id, newAttrs);
        }
    }, [actions]);

    // Delete key handler
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!selectedElement) return;
            // Ignore if typing in input
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (hasBalken && (actions as any).removeBalken) {
                    const balken = (state as any).balkenInstances?.find((b: BalkenInstance) => b.id === selectedElement);
                    if (balken) {
                        (actions as any).removeBalken(selectedElement);
                        setSelectedElement(null);
                        return;
                    }
                }

                // Remove Icon logic
                if ((state as any).selectedIcons?.includes(selectedElement) && (actions as any).toggleIcon) {
                    (actions as any).toggleIcon(selectedElement, false);
                    setSelectedElement(null);
                    return;
                }

                // Remove Shape logic
                if ((state as any).shapeInstances?.find((s: ShapeInstance) => s.id === selectedElement) && (actions as any).removeShape) {
                    (actions as any).removeShape(selectedElement);
                    setSelectedElement(null);
                    return;
                }

                // Remove Additional Text
                if ((state as any).additionalTexts?.find((t: any) => t.id === selectedElement) && (actions as any).removeAdditionalText) {
                    (actions as any).removeAdditionalText(selectedElement);
                    setSelectedElement(null);
                    return;
                }

                // Toggle Asset off logic
                if ((actions as any).handleAssetToggle) {
                    (actions as any).handleAssetToggle(selectedElement, false);
                    // We don't necessarily deselect because it might just be hidden
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedElement, hasBalken, actions, state, setSelectedElement]);

    const activeFloatingModule = useMemo(() => {
        if (!selectedElement) return null;

        // Check if Text (Future: Font controls?)
        const textElement = config.elements.find(e => e.id === selectedElement && e.type === 'text');
        if (textElement) {
            const currentFontSize = (state as any)[(textElement as any).fontSizeStateKey] || resolveValue((textElement as any).fontSize, state, layout) || 24;
            const currentOpacity = (textElement as any).opacityStateKey
                ? (state as any)[(textElement as any).opacityStateKey]
                : resolveValue((textElement as any).opacity, state, layout);
            const currentFill = (textElement as any).fillStateKey
                ? (state as any)[(textElement as any).fillStateKey]
                : resolveValue((textElement as any).fill, state, layout);

            return {
                type: 'text',
                data: {
                    id: selectedElement,
                    fontSize: currentFontSize,
                    opacity: typeof currentOpacity === 'number' ? currentOpacity : 1,
                    fill: typeof currentFill === 'string' ? currentFill : '#000000'
                }
            };
        }

        // Check if Image (for opacity)
        const imageElement = config.elements.find(e => e.id === selectedElement && e.type === 'image');
        if (imageElement) {
            const currentOpacity = (imageElement as any).opacityStateKey
                ? (state as any)[(imageElement as any).opacityStateKey]
                : resolveValue((imageElement as any).opacity, state, layout);

            const currentFill = (imageElement as any).fillStateKey
                ? (state as any)[(imageElement as any).fillStateKey]
                : resolveValue((imageElement as any).fill, state, layout);

            return {
                type: 'image',
                data: {
                    id: selectedElement,
                    opacity: typeof currentOpacity === 'number' ? currentOpacity : 1,
                    fill: typeof currentFill === 'string' ? currentFill : undefined
                }
            };
        }

        // Check if Shape
        const shape = (state as any).shapeInstances?.find((s: ShapeInstance) => s.id === selectedElement);
        if (shape) {
            return {
                type: 'shape',
                data: shape,
            };
        }

        // Check if Icon
        const isIcon = (state as any).selectedIcons?.includes(selectedElement);
        if (isIcon) {
            const iconState = (state as any).iconStates?.[selectedElement];
            return {
                type: 'icon',
                data: { id: selectedElement, ...iconState },
            };
        }

        const additionalText = (state as any).additionalTexts?.find((t: any) => t.id === selectedElement);
        if (additionalText) {
            return {
                type: 'text', // Re-use 'text' type for floating controls (font size)
                data: {
                    id: selectedElement,
                    fontSize: additionalText.fontSize,
                    opacity: additionalText.opacity ?? 1,
                    fill: additionalText.fill
                }
            };
        }

        // Check if Balken
        const balken = (state as any).balkenInstances?.find((b: BalkenInstance) => b.id === selectedElement);
        if (balken) {
            return {
                type: 'text', // Re-use 'text' for opacity/font (though balken font is fixed size usually)
                data: {
                    id: selectedElement,
                    opacity: balken.opacity ?? 1
                }
            };
        }

        return null;
    }, [selectedElement, state, config.elements, layout]);

    const handleColorSelect = useCallback((color: string) => {
        if (!activeFloatingModule) return;

        if (activeFloatingModule.type === 'shape') {
            if ((actions as any).updateShape) {
                (actions as any).updateShape(activeFloatingModule.data.id, { fill: color });
            }
        } else if (activeFloatingModule.type === 'icon') {
            if ((actions as any).updateIcon) {
                (actions as any).updateIcon(activeFloatingModule.data.id, { color });
            }
        } else if (activeFloatingModule.type === 'text') {
            const id = activeFloatingModule.data.id;
            // Check if additional text
            if ((state as any).additionalTexts?.find((t: any) => t.id === id)) {
                if ((actions as any).updateAdditionalText) {
                    (actions as any).updateAdditionalText(id, { fill: color });
                }
                return;
            }

            // Check if configured text element with fillStateKey
            const elementConfig = config.elements.find(e => e.id === id);
            if (elementConfig && elementConfig.type === 'text' && (elementConfig as any).fillStateKey) {
                const next = { ...state, [(elementConfig as any).fillStateKey]: color };
                setStateWrapper(() => next);
                debouncedSaveToHistory(next);
            }
        } else if (activeFloatingModule.type === 'image') {
            const id = activeFloatingModule.data.id;
            const elementConfig = config.elements.find(e => e.id === id);
            if (elementConfig && elementConfig.type === 'image' && (elementConfig as any).fillStateKey) {
                const next = { ...state, [(elementConfig as any).fillStateKey]: color };
                setStateWrapper(() => next);
                debouncedSaveToHistory(next);
            }
        }
    }, [activeFloatingModule, actions, config.elements, state, setStateWrapper, debouncedSaveToHistory]);

    const handleOpacityChange = useCallback((id: string, opacity: number, type: 'shape' | 'icon' | 'text' | 'image') => {
        console.log('[GenericCanvas] handleOpacityChange', { id, opacity, type });
        if (type === 'shape') {
            if ((actions as any).updateShape) {
                (actions as any).updateShape(id, { opacity });
            } else {
                console.warn('[GenericCanvas] updateShape action missing');
            }
        } else if (type === 'icon') {
            if ((actions as any).updateIcon) {
                (actions as any).updateIcon(id, { opacity });
            } else {
                console.warn('[GenericCanvas] updateIcon action missing');
            }
        } else if (type === 'text') {
            // Check if additional text
            if ((state as any).additionalTexts?.find((t: any) => t.id === id)) {
                if ((actions as any).updateAdditionalText) {
                    (actions as any).updateAdditionalText(id, { opacity });
                } else {
                    console.warn('[GenericCanvas] updateAdditionalText action missing');
                }
                return;
            }

            // Check if configured text element with opacityStateKey
            const elementConfig = config.elements.find(e => e.id === id);
            if (elementConfig && elementConfig.type === 'text' && (elementConfig as any).opacityStateKey) {
                const next = { ...state, [(elementConfig as any).opacityStateKey]: opacity };
                setStateWrapper(() => next);
                debouncedSaveToHistory(next);
            } else {
                console.log('[GenericCanvas] text element missing opacityStateKey or undefined');
            }
        } else if (type === 'image') {
            // Image logic...
            const elementConfig = config.elements.find(e => e.id === id);
            if (elementConfig && elementConfig.type === 'image' && (elementConfig as any).opacityStateKey) {
                const next = { ...state, [(elementConfig as any).opacityStateKey]: opacity };
                setStateWrapper(() => next);
                debouncedSaveToHistory(next);
            } else {
                console.log('[GenericCanvas] image element missing opacityStateKey or undefined');
            }
        } else {
            // Check if balken instance
            const isBalken = (state as any).balkenInstances?.some((b: any) => b.id === id);
            if (isBalken) {
                if ((actions as any).updateBalken) {
                    (actions as any).updateBalken(id, { opacity });
                }
            }
        }
    }, [actions, config.elements, state, setStateWrapper, debouncedSaveToHistory]);

    return (
        <GenericCanvasEditor
            config={config}
            state={canvasState}
            actions={actions}
            selectedElement={selectedElement}
            onExport={handleExport}
            onSave={handleSave}
        >
            <div className={className} style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                {/* Floating Tap Bar Above Image */}
                <FloatingTapBar visible={true}>
                    <FloatingHistoryControls
                        onUndo={undo}
                        onRedo={redo}
                        canUndo={canUndo}
                        canRedo={canRedo}
                    />

                    {selectedElement && (
                        <>
                            <div className="floating-separator" />
                            <FloatingLayerControls
                                onMoveUp={() => handleMoveLayer('up')}
                                onMoveDown={() => handleMoveLayer('down')}
                                canMoveUp={canMoveUp}
                                canMoveDown={canMoveDown}
                            />
                        </>
                    )}

                    {activeFloatingModule && (
                        <>
                            <div className="floating-separator" />

                            {activeFloatingModule.type === 'text' && (
                                <>
                                    <FloatingColorPicker
                                        currentColor={activeFloatingModule.data.fill || '#000000'}
                                        onColorSelect={handleColorSelect}
                                    />
                                    <div className="floating-separator" />
                                    <FloatingFontSizeControl
                                        fontSize={activeFloatingModule.data.fontSize}
                                        onFontSizeChange={(size) => handleFontSizeChange(activeFloatingModule.data.id, size)}
                                    />
                                    <div className="floating-separator" />
                                    <FloatingOpacityControl
                                        opacity={activeFloatingModule.data.opacity ?? 1}
                                        onOpacityChange={(val) => handleOpacityChange(activeFloatingModule.data.id, val, 'text')}
                                    />
                                </>
                            )}

                            {activeFloatingModule.type === 'image' && (
                                <>
                                    {activeFloatingModule.data.fill && (
                                        <>
                                            <FloatingColorPicker
                                                currentColor={activeFloatingModule.data.fill}
                                                onColorSelect={handleColorSelect}
                                            />
                                            <div className="floating-separator" />
                                        </>
                                    )}
                                    <FloatingOpacityControl
                                        opacity={activeFloatingModule.data.opacity ?? 1}
                                        onOpacityChange={(val) => handleOpacityChange(activeFloatingModule.data.id, val, 'image')}
                                    />
                                </>
                            )}

                            {(activeFloatingModule.type === 'shape' || activeFloatingModule.type === 'icon') && (
                                <>
                                    <FloatingColorPicker
                                        currentColor={
                                            activeFloatingModule.type === 'shape'
                                                ? activeFloatingModule.data.fill
                                                : activeFloatingModule.data.color || '#000000'
                                        }
                                        onColorSelect={handleColorSelect}
                                    />
                                    <div className="floating-separator" />
                                    <FloatingOpacityControl
                                        opacity={activeFloatingModule.data.opacity ?? 1}
                                        onOpacityChange={(val) => handleOpacityChange(activeFloatingModule.data.id, val, activeFloatingModule.type as 'shape' | 'icon')}
                                    />
                                </>
                            )}
                        </>
                    )}
                </FloatingTapBar>

                <CanvasStage
                    ref={stageRef}
                    width={config.canvas.width}
                    height={config.canvas.height}
                    responsive
                    maxContainerWidth={900}
                    onStageClick={handleStageClick}
                    className={`${config.id}-stage`}
                >
                    {sortedRenderList.map(item => {
                        // Render based on type
                        if (item.type === 'element') {
                            const elementConfig = item.data as CanvasElementConfig;
                            return (
                                <GenericCanvasElement
                                    key={elementConfig.id}
                                    config={elementConfig}
                                    state={state}
                                    layout={layout}
                                    selectedElement={selectedElement}
                                    onSelect={handleElementSelect}
                                    onTextChange={handleTextChange}
                                    onFontSizeChange={handleFontSizeChange}
                                    onPositionChange={handleElementPositionChange}
                                    onImageDragEnd={handleImageDragEnd}
                                    onImageTransformEnd={handleImageTransformEnd}
                                    onSnapChange={handleSnapChange}
                                    onSnapLinesChange={setSnapLines}
                                    stageWidth={config.canvas.width}
                                    stageHeight={config.canvas.height}
                                    snapTargets={getSnapTargets(elementConfig.id)}
                                />
                            );
                        }

                        if (item.type === 'balken') {
                            const balken = item.data as BalkenInstance;
                            return (
                                <BalkenGroup
                                    key={balken.id}
                                    mode={balken.mode}
                                    colorSchemeId={balken.colorSchemeId}
                                    offset={balken.offset}
                                    scale={balken.scale}
                                    widthScale={balken.widthScale}
                                    texts={balken.texts}
                                    rotation={balken.rotation}

                                    selected={selectedElement === balken.id}
                                    onSelect={() => handleBalkenSelect(balken.id)}

                                    onTextChange={(idx, txt) => {
                                        if ((actions as any).setBalkenText) {
                                            (actions as any).setBalkenText(balken.id, idx, txt);
                                        }
                                    }}
                                    onDragEnd={(x, y) => handleBalkenDragEnd(balken.id, x, y)}
                                    onTransformEnd={(x, y, s, r) => handleBalkenTransformEnd(balken.id, x, y, s, r)}

                                    onSnapChange={handleSnapChange}
                                    onSnapLinesChange={setSnapLines}
                                    getSnapTargets={getSnapTargets}
                                    stageWidth={config.canvas.width}
                                    stageHeight={config.canvas.height}
                                    opacity={balken.opacity ?? 1}
                                />
                            );
                        }

                        if (item.type === 'icon') {
                            const iconId = item.id;
                            const iconDef = ALL_ICONS.find(i => i.id === iconId);
                            const iconState = (state as any).iconStates?.[iconId];

                            // Default position if not in state
                            const x = iconState?.x ?? config.canvas.width / 2;
                            const y = iconState?.y ?? config.canvas.height / 2;
                            const scale = iconState?.scale ?? 1;
                            const rotation = iconState?.rotation ?? 0;
                            const color = iconState?.color ?? '#000000';

                            if (!iconDef) return null;

                            return (
                                <IconPrimitive
                                    key={iconId}
                                    id={iconId}
                                    icon={iconDef.component}
                                    x={x}
                                    y={y}
                                    scale={scale}
                                    rotation={rotation}
                                    color={color}
                                    opacity={iconState?.opacity ?? 1}
                                    selected={selectedElement === iconId}
                                    onSelect={() => handleElementSelect(iconId)}
                                    // Use callback wrapper to prevent loops if signature varies
                                    onDragEnd={(nx, ny) => handleIconDragEnd(iconId, nx, ny)}
                                    onTransformEnd={(nx, ny, ns, nr) => handleIconTransformEnd(iconId, nx, ny, ns, nr)}
                                />
                            );
                        }

                        if (item.type === 'shape') {
                            const shape = item.data as ShapeInstance;
                            return (
                                <ShapePrimitive
                                    key={shape.id}
                                    shape={shape}
                                    isSelected={selectedElement === shape.id}
                                    onSelect={handleElementSelect}
                                    onChange={(attrs) => handleShapeChange(shape.id, attrs)}
                                    draggable={true}
                                />
                            );
                        }

                        if (item.type === 'additional-text') {
                            const textItem = item.data;
                            return (
                                <CanvasText
                                    key={textItem.id}
                                    id={textItem.id}
                                    text={textItem.text}
                                    x={textItem.x}
                                    y={textItem.y}
                                    width={textItem.width}
                                    fontSize={textItem.fontSize}
                                    fontFamily={textItem.fontFamily}
                                    fontStyle={textItem.fontStyle || 'normal'}
                                    fill={textItem.fill}
                                    align="left"
                                    opacity={textItem.opacity ?? 1}
                                    rotation={textItem.rotation || 0}
                                    scaleX={textItem.scale || 1}
                                    scaleY={textItem.scale || 1}
                                    draggable={true}
                                    selected={selectedElement === textItem.id}
                                    onSelect={() => handleElementSelect(textItem.id)}
                                    // Use specific handlers instead of generic 'onChange' which isn't on CanvasTextProps
                                    onTextChange={(val) => handleAdditionalTextChange(textItem.id, { text: val })}
                                    onDragEnd={(x, y) => {
                                        handleAdditionalTextChange(textItem.id, { x, y });
                                        saveToHistory();
                                    }}
                                    onTransformEnd={(x, y, width, scaleX, scaleY) => {
                                        // Note: CanvasText treats scale as font size change on transformEnd usually
                                        // We pass scale here, but handleAdditionalTextChange needs to interpret it.
                                        handleAdditionalTextChange(textItem.id, { x, y, width, scale: scaleX });
                                        saveToHistory();
                                    }}
                                    // Snapping and other props
                                    editable={true}

                                    // Snapping
                                    onSnapChange={handleSnapChange}
                                    onSnapLinesChange={setSnapLines}
                                    snapTargets={getSnapTargets(textItem.id)}
                                    stageWidth={config.canvas.width}
                                    stageHeight={config.canvas.height}
                                />
                            );
                        }

                        return null;
                    })}

                    {/* Snap Guidelines Overlay */}
                    <SnapGuidelines
                        showH={snapGuides.h}
                        showV={snapGuides.v}
                        stageWidth={config.canvas.width}
                        stageHeight={config.canvas.height}
                        snapLines={snapLines}
                    />
                </CanvasStage>

            </div>
        </GenericCanvasEditor>
    );
}

// Memoize the entire component
export const GenericCanvas = memo(GenericCanvasInner) as typeof GenericCanvasInner;

export default GenericCanvas;
