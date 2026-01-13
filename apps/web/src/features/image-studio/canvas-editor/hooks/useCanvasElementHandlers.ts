import { useCallback } from 'react';
import type { FullCanvasConfig, LayoutResult, AdditionalText } from '../configs/types';
import type { ShapeInstance } from '../utils/shapes';
import { resolveValue } from '../utils/canvasValueResolver';

/**
 * Canvas Element Handlers - Handlers for all element interactions
 *
 * Manages interactions for config elements (text, image), balkens, icons, shapes,
 * and additional texts. Handles selection, text changes, position changes, transforms, etc.
 */

/**
 * Optional canvas action methods that may be present in specific configs
 */
export interface OptionalCanvasActions {
    updateBalken?: (id: string, attrs: Partial<{ offset: { x: number; y: number }; scale?: number; rotation?: number; opacity?: number }>) => void;
    updateIcon?: (id: string, attrs: Partial<{ x: number; y: number; scale?: number; rotation?: number; color?: string; opacity?: number }>) => void;
    updateShape?: (id: string, attrs: Partial<ShapeInstance>) => void;
    updateIllustration?: (id: string, attrs: Partial<{ x: number; y: number; scale?: number; rotation?: number; color?: string; opacity?: number }>) => void;
    updateAsset?: (id: string, attrs: Partial<{ x: number; y: number; scale?: number; rotation?: number; opacity?: number }>) => void;
    updateAdditionalText?: (id: string, attrs: Partial<AdditionalText>) => void;
}

export interface UseCanvasElementHandlersOptions<TState, TActions extends OptionalCanvasActions = OptionalCanvasActions> {
    config: FullCanvasConfig<TState, TActions>;
    state: TState;
    setState: (partial: Partial<TState> | ((prev: TState) => TState)) => void;
    actions: TActions;
    layout: LayoutResult;
    callbacks: Record<string, ((val: unknown) => void) | undefined>;
    setSelectedElement: (id: string | null) => void;
    updateElementPosition: (id: string, x: number, y: number, w: number, h: number) => void;
    saveToHistory: (state: TState) => void;
    debouncedSaveToHistory: (state: TState) => void;
}

export interface UseCanvasElementHandlersResult {
    handleElementSelect: (id: string) => void;
    handleTextChange: (id: string, text: string) => void;
    handleFontSizeChange: (id: string, size: number) => void;
    handleElementPositionChange: (id: string, x: number, y: number, w: number, h: number) => void;
    handleImageDragEnd: (id: string, x: number, y: number) => void;
    handleImageTransformEnd: (id: string, x: number, y: number, w: number, h: number) => void;
    handleBalkenSelect: (id: string) => void;
    handleBalkenDragEnd: (id: string, x: number, y: number) => void;
    handleBalkenTransformEnd: (id: string, x: number, y: number, scale: number, rotation: number) => void;
    handleIconDragEnd: (id: string, x: number, y: number) => void;
    handleIconTransformEnd: (id: string, x: number, y: number, scale: number, rotation: number) => void;
    handleShapeChange: (id: string, newAttrs: Partial<ShapeInstance>) => void;
    handleAdditionalTextChange: (id: string, newAttrs: Partial<AdditionalText>) => void;
}

/**
 * Helper to safely access state array property
 */
function getStateArray<T>(state: unknown, key: string): T[] {
    const stateObj = state as Record<string, unknown>;
    const value = stateObj[key];
    return Array.isArray(value) ? (value as T[]) : [];
}

/**
 * Hook to handle all canvas element interactions
 */
export function useCanvasElementHandlers<TState, TActions extends OptionalCanvasActions = OptionalCanvasActions>(
    options: UseCanvasElementHandlersOptions<TState, TActions>
): UseCanvasElementHandlersResult {
    const {
        config,
        state,
        setState,
        actions,
        layout,
        callbacks,
        setSelectedElement,
        updateElementPosition,
        saveToHistory,
        debouncedSaveToHistory,
    } = options;

    const handleElementSelect = useCallback(
        (id: string) => {
            setSelectedElement(id);
        },
        [setSelectedElement]
    );

    const handleTextChange = useCallback(
        (id: string, text: string) => {
            const elementConfig = config.elements.find((e) => e.id === id);
            if (elementConfig && elementConfig.type === 'text') {
                const textKey = elementConfig.textKey;
                setState((prev) => ({ ...prev, [textKey]: text }));

                const callbackKey = `on${textKey.charAt(0).toUpperCase() + textKey.slice(1)}Change`;
                callbacks[callbackKey]?.(text);

                debouncedSaveToHistory({ ...state, [textKey]: text });
            }
        },
        [config.elements, setState, callbacks, debouncedSaveToHistory, state]
    );

    const handleFontSizeChange = useCallback(
        (id: string, size: number) => {
            const elementConfig = config.elements.find((e) => e.id === id);
            if (elementConfig && elementConfig.type === 'text' && elementConfig.fontSizeStateKey) {
                const next = { ...state, [elementConfig.fontSizeStateKey]: size };
                setState(() => next);
                debouncedSaveToHistory(next);
                return;
            }

            const additionalTexts = getStateArray<{ id: string }>(state, 'additionalTexts');
            if (additionalTexts.find((t) => t.id === id)) {
                if (actions.updateAdditionalText) {
                    actions.updateAdditionalText(id, { fontSize: size });
                    debouncedSaveToHistory(state);
                }
            }
        },
        [config.elements, state, actions, setState, debouncedSaveToHistory]
    );

    const handleElementPositionChange = useCallback(
        (id: string, x: number, y: number, w: number, h: number) => {
            updateElementPosition(id, x, y, w, h);

            const elementConfig = config.elements.find((e) => e.id === id);
            if (elementConfig && elementConfig.type === 'text') {
                const positionStateKey = elementConfig.positionStateKey as string | undefined;
                if (positionStateKey) {
                    setState((prev) => ({ ...prev, [positionStateKey]: { x, y } }));
                }
            }
        },
        [config.elements, updateElementPosition, setState]
    );

    const handleImageDragEnd = useCallback(
        (id: string, x: number, y: number) => {
            const elementConfig = config.elements.find((e) => e.id === id);
            if (elementConfig && elementConfig.type === 'image' && elementConfig.offsetKey) {
                const baseX = resolveValue(elementConfig.x, state, layout);
                const baseY = resolveValue(elementConfig.y, state, layout);
                const newOffset = { x: x - baseX, y: y - baseY };
                setState((prev) => ({ ...prev, [elementConfig.offsetKey!]: newOffset }));
                saveToHistory({ ...state, [elementConfig.offsetKey!]: newOffset });
            }
        },
        [config.elements, setState, saveToHistory, state, layout]
    );

    const handleImageTransformEnd = useCallback(
        (id: string, x: number, y: number, w: number, h: number) => {
            const elementConfig = config.elements.find((e) => e.id === id);
            if (elementConfig && elementConfig.type === 'image') {
                const updates = {} as Record<string, unknown>;

                if (elementConfig.offsetKey) {
                    const baseX = typeof elementConfig.x === 'number' ? elementConfig.x : 0;
                    const baseY = typeof elementConfig.y === 'number' ? elementConfig.y : 0;
                    updates[elementConfig.offsetKey] = { x: x - baseX, y: y - baseY };
                }

                if (elementConfig.scaleKey) {
                    const baseWidth = typeof elementConfig.width === 'number' ? elementConfig.width : 100;
                    const currentScale = (state[elementConfig.scaleKey as keyof TState] as number) || 1;
                    const newScale = currentScale * (w / (baseWidth * currentScale));
                    updates[elementConfig.scaleKey] = newScale;
                }

                const nextState = { ...state, ...updates } as TState;
                setState((prev) => ({ ...prev, ...updates }));
                saveToHistory(nextState);
            }
        },
        [config.elements, setState, saveToHistory, state]
    );

    const handleBalkenSelect = useCallback(
        (id: string) => {
            setSelectedElement(id);
        },
        [setSelectedElement]
    );

    const handleBalkenDragEnd = useCallback(
        (id: string, x: number, y: number) => {
            if (actions.updateBalken) {
                actions.updateBalken(id, { offset: { x, y } });
            }
        },
        [actions]
    );

    const handleBalkenTransformEnd = useCallback(
        (id: string, x: number, y: number, scale: number, rotation: number) => {
            if (actions.updateBalken) {
                actions.updateBalken(id, { offset: { x, y }, scale, rotation });
            }
        },
        [actions]
    );

    const handleIconDragEnd = useCallback(
        (id: string, x: number, y: number) => {
            if (actions.updateIcon) {
                actions.updateIcon(id, { x, y });
            }
        },
        [actions]
    );

    const handleIconTransformEnd = useCallback(
        (id: string, x: number, y: number, scale: number, rotation: number) => {
            if (actions.updateIcon) {
                actions.updateIcon(id, { x, y, scale, rotation });
            }
        },
        [actions]
    );

    const handleShapeChange = useCallback(
        (id: string, newAttrs: Partial<ShapeInstance>) => {
            if (actions.updateShape) {
                actions.updateShape(id, newAttrs);
            }
        },
        [actions]
    );

    const handleAdditionalTextChange = useCallback(
        (id: string, newAttrs: Partial<AdditionalText>) => {
            if (actions.updateAdditionalText) {
                actions.updateAdditionalText(id, newAttrs);
            }
        },
        [actions]
    );

    return {
        handleElementSelect,
        handleTextChange,
        handleFontSizeChange,
        handleElementPositionChange,
        handleImageDragEnd,
        handleImageTransformEnd,
        handleBalkenSelect,
        handleBalkenDragEnd,
        handleBalkenTransformEnd,
        handleIconDragEnd,
        handleIconTransformEnd,
        handleShapeChange,
        handleAdditionalTextChange,
    };
}
