import { useMemo } from 'react';
import type { FullCanvasConfig, LayoutResult } from '../configs/types';
import type { BalkenInstance } from '../primitives';
import type { ShapeInstance } from '../utils/shapes';
import type { IllustrationInstance } from '../utils/illustrations/types';
import type { AssetInstance } from '../utils/canvasAssets';
import { resolveValue } from '../utils/canvasValueResolver';

/**
 * Floating Module State - Determines active floating toolbar module
 *
 * Based on the selected element, computes which floating toolbar controls
 * should be shown (text, image, shape, icon, illustration, asset) and their current values.
 */

export interface FloatingModuleState {
    type: 'text' | 'image' | 'shape' | 'icon' | 'illustration' | 'asset' | 'background';
    data: {
        id: string;
        fontSize?: number;
        opacity?: number;
        fill?: string;
        color?: string;
        [key: string]: unknown;
    };
}

export interface UseFloatingModuleStateOptions<TState extends Record<string, unknown>, TActions = Record<string, unknown>> {
    selectedElement: string | null;
    config: FullCanvasConfig<TState, TActions>;
    state: TState;
    layout: LayoutResult;
}

/**
 * Helper to safely access state property with type narrowing
 */
function getStateProperty<T>(state: unknown, key: string | undefined): T | undefined {
    if (!key) return undefined;
    const stateObj = state as Record<string, unknown>;
    return stateObj[key] as T | undefined;
}

/**
 * Helper to check if state has array property
 */
function getStateArray<T>(state: unknown, key: string | undefined): T[] {
    if (!key) return [];
    const stateObj = state as Record<string, unknown>;
    const value = stateObj[key];
    return Array.isArray(value) ? (value as T[]) : [];
}

/**
 * Hook to compute active floating module based on selected element
 */
export function useFloatingModuleState<TState extends Record<string, unknown>, TActions = Record<string, unknown>>(
    options: UseFloatingModuleStateOptions<TState, TActions>
): FloatingModuleState | null {
    const { selectedElement, config, state, layout } = options;

    return useMemo(() => {
        if (!selectedElement) return null;

        // Check if Text element (from config)
        const textElement = config.elements.find((e) => e.id === selectedElement && e.type === 'text');
        if (textElement && textElement.type === 'text') {
            const fontSizeStateKey = textElement.fontSizeStateKey as string | undefined;
            const opacityStateKey = textElement.opacityStateKey as string | undefined;
            const fillStateKey = textElement.fillStateKey as string | undefined;

            const currentFontSize =
                getStateProperty<number>(state, fontSizeStateKey) ||
                resolveValue<number, TState>(textElement.fontSize as number | ((state: TState, layout: LayoutResult) => number), state, layout) ||
                24;
            const currentOpacity = opacityStateKey
                ? getStateProperty<number>(state, opacityStateKey)
                : (textElement.opacity !== undefined
                    ? resolveValue<number | undefined, TState>(textElement.opacity as number | ((state: TState, layout: LayoutResult) => number | undefined), state, layout)
                    : undefined);
            const currentFill = fillStateKey
                ? getStateProperty<string>(state, fillStateKey)
                : (textElement.fill !== undefined
                    ? resolveValue<string | undefined, TState>(textElement.fill as string | ((state: TState, layout: LayoutResult) => string | undefined), state, layout)
                    : undefined);

            return {
                type: 'text' as const,
                data: {
                    id: selectedElement,
                    fontSize: currentFontSize,
                    opacity: typeof currentOpacity === 'number' ? currentOpacity : 1,
                    fill: typeof currentFill === 'string' ? currentFill : '#000000',
                },
            };
        }

        // Check if Image element (from config)
        const imageElement = config.elements.find((e) => e.id === selectedElement && e.type === 'image');
        if (imageElement && imageElement.type === 'image') {
            const opacityStateKey = imageElement.opacityStateKey as string | undefined;
            const fillStateKey = imageElement.fillStateKey as string | undefined;

            const currentOpacity = opacityStateKey
                ? getStateProperty<number>(state, opacityStateKey)
                : (imageElement.opacity !== undefined
                    ? resolveValue<number | undefined, TState>(imageElement.opacity as number | ((state: TState, layout: LayoutResult) => number | undefined), state, layout)
                    : undefined);

            // Get fill from state or resolve from config
            let currentFill: string | undefined = undefined;
            if (fillStateKey) {
                currentFill = getStateProperty<string>(state, fillStateKey);
            } else if (imageElement.fill) {
                currentFill = resolveValue<string, TState>(imageElement.fill as string | ((state: TState, layout: LayoutResult) => string), state, layout);
            }

            return {
                type: 'image' as const,
                data: {
                    id: selectedElement,
                    opacity: typeof currentOpacity === 'number' ? currentOpacity : 1,
                    fill: typeof currentFill === 'string' && currentFill ? currentFill : undefined,
                },
            };
        }

        // Check if Background element (from config)
        const backgroundElement = config.elements.find((e) => e.id === selectedElement && e.type === 'background');
        if (backgroundElement && backgroundElement.type === 'background') {
            const opacityStateKey = backgroundElement.opacityStateKey as string | undefined;
            const fillStateKey = backgroundElement.fillStateKey as string | undefined;

            const currentOpacity = opacityStateKey
                ? getStateProperty<number>(state, opacityStateKey)
                : (backgroundElement.opacity !== undefined
                    ? resolveValue<number | undefined, TState>(backgroundElement.opacity as number | ((state: TState, layout: LayoutResult) => number | undefined), state, layout)
                    : undefined);

            let currentFill: string | undefined = undefined;
            if (fillStateKey) {
                currentFill = getStateProperty<string>(state, fillStateKey);
            } else if (backgroundElement.fill) {
                currentFill = resolveValue<string, TState>(backgroundElement.fill as string | ((state: TState, layout: LayoutResult) => string), state, layout);
            }

            return {
                type: 'background' as const,
                data: {
                    id: selectedElement,
                    opacity: typeof currentOpacity === 'number' ? currentOpacity : 1,
                    fill: typeof currentFill === 'string' && currentFill ? currentFill : undefined,
                },
            };
        }

        // Check if Shape
        const shapeInstances = getStateArray<ShapeInstance>(state, 'shapeInstances');
        const shape = shapeInstances.find((s) => s.id === selectedElement);
        if (shape) {
            return {
                type: 'shape' as const,
                data: { ...shape, id: selectedElement },
            };
        }

        // Check if Icon
        const selectedIcons = getStateArray<string>(state, 'selectedIcons');
        const isIcon = selectedIcons.includes(selectedElement);
        if (isIcon) {
            const iconStatesObj = getStateProperty<Record<string, unknown>>(state, 'iconStates');
            const iconState = iconStatesObj?.[selectedElement] ?? {};
            return {
                type: 'icon' as const,
                data: { id: selectedElement, ...iconState },
            };
        }

        // Check if Additional Text
        const additionalTexts = getStateArray<{ id: string; fontSize?: number; opacity?: number; fill?: string }>(state, 'additionalTexts');
        const additionalText = additionalTexts.find((t) => t.id === selectedElement);
        if (additionalText) {
            return {
                type: 'text' as const,
                data: {
                    id: selectedElement,
                    fontSize: additionalText.fontSize,
                    opacity: additionalText.opacity ?? 1,
                    fill: additionalText.fill,
                },
            };
        }

        // Check if Balken
        const balkenInstances = getStateArray<BalkenInstance>(state, 'balkenInstances');
        const balken = balkenInstances.find((b) => b.id === selectedElement);
        if (balken) {
            return {
                type: 'text' as const,
                data: {
                    id: selectedElement,
                    opacity: balken.opacity ?? 1,
                },
            };
        }

        // Check if Illustration
        const illustrationInstances = getStateArray<IllustrationInstance>(state, 'illustrationInstances');
        const illustration = illustrationInstances.find((i) => i.id === selectedElement);
        if (illustration) {
            return {
                type: 'illustration' as const,
                data: { ...illustration, id: selectedElement },
            };
        }

        // Check if Asset
        const assetInstances = getStateArray<AssetInstance>(state, 'assetInstances');
        const asset = assetInstances.find((a) => a.id === selectedElement);
        if (asset) {
            return {
                type: 'asset' as const,
                data: { ...asset, id: selectedElement },
            };
        }

        return null;
    }, [selectedElement, state, config.elements, layout]);
}
