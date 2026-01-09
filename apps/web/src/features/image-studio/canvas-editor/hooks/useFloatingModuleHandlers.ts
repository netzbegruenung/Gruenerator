import { useCallback } from 'react';
import type { FullCanvasConfig } from '../configs/types';
import type { FloatingModuleState } from './useFloatingModuleState';

/**
 * Floating Module Handlers - Handlers for floating toolbar interactions
 *
 * Manages color, opacity, and other floating toolbar control changes
 * for different element types (text, image, shape, icon, illustration).
 */

export interface UseFloatingModuleHandlersOptions<TState> {
    activeFloatingModule: FloatingModuleState | null;
    actions: any;
    config: FullCanvasConfig;
    state: TState;
    setState: (partial: Partial<TState> | ((prev: TState) => TState)) => void;
    debouncedSaveToHistory: (state: any) => void;
}

export interface UseFloatingModuleHandlersResult {
    handleColorSelect: (color: string) => void;
    handleOpacityChange: (id: string, opacity: number, type: string) => void;
}

/**
 * Hook to handle floating toolbar interactions
 */
export function useFloatingModuleHandlers<TState>(
    options: UseFloatingModuleHandlersOptions<TState>
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
                    actions.updateIcon(activeFloatingModule.data.id, { color });
                }
            } else if (activeFloatingModule.type === 'illustration') {
                if (actions.updateIllustration) {
                    actions.updateIllustration(activeFloatingModule.data.id, { color });
                }
            } else if (activeFloatingModule.type === 'text') {
                const id = activeFloatingModule.data.id;

                if ((state as any).additionalTexts?.find((t: any) => t.id === id)) {
                    if (actions.updateAdditionalText) {
                        actions.updateAdditionalText(id, { fill: color });
                    }
                    return;
                }

                const elementConfig = config.elements.find((e) => e.id === id);
                if (elementConfig && elementConfig.type === 'text' && (elementConfig as any).fillStateKey) {
                    const next = { ...state, [(elementConfig as any).fillStateKey]: color };
                    setState(() => next);
                    debouncedSaveToHistory(next);
                }
            } else if (activeFloatingModule.type === 'image') {
                const id = activeFloatingModule.data.id;
                const elementConfig = config.elements.find((e) => e.id === id);
                if (elementConfig && elementConfig.type === 'image' && (elementConfig as any).fillStateKey) {
                    const next = { ...state, [(elementConfig as any).fillStateKey]: color };
                    setState(() => next);
                    debouncedSaveToHistory(next);
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
            } else if (type === 'text') {
                if ((state as any).additionalTexts?.find((t: any) => t.id === id)) {
                    if (actions.updateAdditionalText) {
                        actions.updateAdditionalText(id, { opacity });
                    }
                    return;
                }

                const elementConfig = config.elements.find((e) => e.id === id);
                if (elementConfig && elementConfig.type === 'text' && (elementConfig as any).opacityStateKey) {
                    const next = { ...state, [(elementConfig as any).opacityStateKey]: opacity };
                    setState(() => next);
                    debouncedSaveToHistory(next);
                }
            } else if (type === 'image') {
                const elementConfig = config.elements.find((e) => e.id === id);
                if (elementConfig && elementConfig.type === 'image' && (elementConfig as any).opacityStateKey) {
                    const next = { ...state, [(elementConfig as any).opacityStateKey]: opacity };
                    setState(() => next);
                    debouncedSaveToHistory(next);
                }
            } else {
                const isBalken = (state as any).balkenInstances?.some((b: any) => b.id === id);
                if (isBalken && actions.updateBalken) {
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
