import { useCallback } from 'react';
import type { FullCanvasConfig } from '../configs/types';
import type { FloatingModuleState } from './useFloatingModuleState';
import type { OptionalCanvasActions } from './useCanvasElementHandlers';

/**
 * Floating Module Handlers - Handlers for floating toolbar interactions
 *
 * Manages color, opacity, and other floating toolbar control changes
 * for different element types (text, image, shape, icon, illustration).
 */

/**
 * Helper to safely access state array property
 */
function getStateArray<T>(state: unknown, key: string): T[] {
    const stateObj = state as Record<string, unknown>;
    const value = stateObj[key];
    return Array.isArray(value) ? (value as T[]) : [];
}

export interface UseFloatingModuleHandlersOptions<TState, TActions extends OptionalCanvasActions = OptionalCanvasActions> {
    activeFloatingModule: FloatingModuleState | null;
    actions: TActions;
    config: FullCanvasConfig<TState, TActions>;
    state: TState;
    setState: (partial: Partial<TState> | ((prev: TState) => TState)) => void;
    debouncedSaveToHistory: (state: TState) => void;
}

export interface UseFloatingModuleHandlersResult {
    handleColorSelect: (color: string) => void;
    handleOpacityChange: (id: string, opacity: number, type: string) => void;
}

/**
 * Hook to handle floating toolbar interactions
 */
export function useFloatingModuleHandlers<TState, TActions extends OptionalCanvasActions = OptionalCanvasActions>(
    options: UseFloatingModuleHandlersOptions<TState, TActions>
): UseFloatingModuleHandlersResult {
    const { activeFloatingModule, actions, config, state, setState, debouncedSaveToHistory } = options;

    const handleColorSelect = useCallback(
        (color: string) => {
            if (!activeFloatingModule) return;

            if (activeFloatingModule.type === 'shape') {
                if (actions.updateShape) {
                    actions.updateShape(activeFloatingModule.data.id, { fill: color });
                }
            } else if (activeFloatingModule.type === 'icon') {
                if (actions.updateIcon) {
                    actions.updateIcon(activeFloatingModule.data.id, { color } as unknown as Parameters<typeof actions.updateIcon>[1]);
                }
            } else if (activeFloatingModule.type === 'illustration') {
                if (actions.updateIllustration) {
                    actions.updateIllustration(activeFloatingModule.data.id, { color } as unknown as Parameters<typeof actions.updateIllustration>[1]);
                }
            } else if (activeFloatingModule.type === 'asset') {
                if (actions.updateAsset) {
                    actions.updateAsset(activeFloatingModule.data.id, { color } as unknown as Parameters<typeof actions.updateAsset>[1]);
                }
            } else if (activeFloatingModule.type === 'text') {
                const id = activeFloatingModule.data.id;

                const additionalTexts = getStateArray<{ id: string }>(state, 'additionalTexts');
                if (additionalTexts.find((t) => t.id === id)) {
                    if (actions.updateAdditionalText) {
                        actions.updateAdditionalText(id, { fill: color });
                    }
                    return;
                }

                const elementConfig = config.elements.find((e) => e.id === id);
                if (elementConfig && elementConfig.type === 'text') {
                    const fillStateKey = elementConfig.fillStateKey as string | undefined;
                    if (fillStateKey) {
                        const next = { ...state, [fillStateKey]: color };
                        setState(() => next);
                        debouncedSaveToHistory(next);
                    }
                }
            } else if (activeFloatingModule.type === 'image') {
                const id = activeFloatingModule.data.id;
                const elementConfig = config.elements.find((e) => e.id === id);
                if (elementConfig && elementConfig.type === 'image') {
                    const fillStateKey = elementConfig.fillStateKey as string | undefined;
                    if (fillStateKey) {
                        const next = { ...state, [fillStateKey]: color };
                        setState(() => next);
                        debouncedSaveToHistory(next);
                    }
                }
            } else if (activeFloatingModule.type === 'background') {
                const id = activeFloatingModule.data.id;
                const elementConfig = config.elements.find((e) => e.id === id);
                if (elementConfig && elementConfig.type === 'background') {
                    const fillStateKey = elementConfig.fillStateKey as string | undefined;
                    if (fillStateKey) {
                        const next = { ...state, [fillStateKey]: color };
                        setState(() => next);
                        debouncedSaveToHistory(next);
                    }
                }
            }
        },
        [activeFloatingModule, actions, config.elements, state, setState, debouncedSaveToHistory]
    );

    const handleOpacityChange = useCallback(
        (id: string, opacity: number, type: string) => {
            if (type === 'shape') {
                if (actions.updateShape) {
                    actions.updateShape(id, { opacity });
                }
            } else if (type === 'illustration') {
                if (actions.updateIllustration) {
                    actions.updateIllustration(id, { opacity });
                }
            } else if (type === 'icon') {
                if (actions.updateIcon) {
                    actions.updateIcon(id, { opacity });
                }
            } else if (type === 'asset') {
                if (actions.updateAsset) {
                    actions.updateAsset(id, { opacity });
                }
            } else if (type === 'text') {
                const additionalTexts = getStateArray<{ id: string }>(state, 'additionalTexts');
                if (additionalTexts.find((t) => t.id === id)) {
                    if (actions.updateAdditionalText) {
                        actions.updateAdditionalText(id, { opacity });
                    }
                    return;
                }

                const elementConfig = config.elements.find((e) => e.id === id);
                if (elementConfig && elementConfig.type === 'text') {
                    const opacityStateKey = elementConfig.opacityStateKey as string | undefined;
                    if (opacityStateKey) {
                        const next = { ...state, [opacityStateKey]: opacity };
                        setState(() => next);
                        debouncedSaveToHistory(next);
                    }
                }
            } else if (type === 'image') {
                const elementConfig = config.elements.find((e) => e.id === id);
                if (elementConfig && elementConfig.type === 'image') {
                    const opacityStateKey = elementConfig.opacityStateKey as string | undefined;
                    if (opacityStateKey) {
                        const next = { ...state, [opacityStateKey]: opacity };
                        setState(() => next);
                        debouncedSaveToHistory(next);
                    }
                }
            } else if (type === 'background') {
                const elementConfig = config.elements.find((e) => e.id === id);
                if (elementConfig && elementConfig.type === 'background') {
                    const opacityStateKey = elementConfig.opacityStateKey as string | undefined;
                    if (opacityStateKey) {
                        const next = { ...state, [opacityStateKey]: opacity };
                        setState(() => next);
                        debouncedSaveToHistory(next);
                    }
                }
            } else if (type === 'balken') {
                if (actions.updateBalken) {
                    actions.updateBalken(id, { opacity });
                }
            }
        },
        [actions, config.elements, state, setState, debouncedSaveToHistory]
    );

    return {
        handleColorSelect,
        handleOpacityChange,
    };
}
