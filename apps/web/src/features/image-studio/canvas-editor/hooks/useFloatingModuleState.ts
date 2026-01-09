import { useMemo } from 'react';
import type { FullCanvasConfig, LayoutResult } from '../configs/types';
import type { BalkenInstance } from '../primitives';
import type { ShapeInstance } from '../utils/shapes';
import type { IllustrationInstance } from '../utils/canvasIllustrations';
import { resolveValue } from '../utils/canvasValueResolver';

/**
 * Floating Module State - Determines active floating toolbar module
 *
 * Based on the selected element, computes which floating toolbar controls
 * should be shown (text, image, shape, icon, illustration) and their current values.
 */

export interface FloatingModuleState {
    type: 'text' | 'image' | 'shape' | 'icon' | 'illustration';
    data: {
        id: string;
        fontSize?: number;
        opacity?: number;
        fill?: string;
        color?: string;
        [key: string]: any;
    };
}

export interface UseFloatingModuleStateOptions<TState> {
    selectedElement: string | null;
    config: FullCanvasConfig;
    state: TState;
    layout: LayoutResult;
}

/**
 * Hook to compute active floating module based on selected element
 */
export function useFloatingModuleState<TState>(
    options: UseFloatingModuleStateOptions<TState>
): FloatingModuleState | null {
    const { selectedElement, config, state, layout } = options;

    return useMemo(() => {
        if (!selectedElement) return null;

        // Check if Text element (from config)
        const textElement = config.elements.find((e) => e.id === selectedElement && e.type === 'text');
        if (textElement) {
            const currentFontSize =
                (state as any)[(textElement as any).fontSizeStateKey] ||
                resolveValue((textElement as any).fontSize, state, layout) ||
                24;
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
                    fill: typeof currentFill === 'string' ? currentFill : '#000000',
                },
            };
        }

        // Check if Image element (from config)
        const imageElement = config.elements.find((e) => e.id === selectedElement && e.type === 'image');
        if (imageElement) {
            const currentOpacity = (imageElement as any).opacityStateKey
                ? (state as any)[(imageElement as any).opacityStateKey]
                : resolveValue((imageElement as any).opacity, state, layout);

            // Get fill from state or resolve from config
            let currentFill: string | undefined = undefined;
            if ((imageElement as any).fillStateKey) {
                // Read directly from state using the key
                currentFill = (state as any)[(imageElement as any).fillStateKey];
            } else if ((imageElement as any).fill) {
                // Resolve from config fill property
                currentFill = resolveValue((imageElement as any).fill, state, layout);
            }

            return {
                type: 'image',
                data: {
                    id: selectedElement,
                    opacity: typeof currentOpacity === 'number' ? currentOpacity : 1,
                    fill: typeof currentFill === 'string' && currentFill ? currentFill : undefined,
                },
            };
        }

        // Check if Shape
        const shape = (state as any).shapeInstances?.find(
            (s: ShapeInstance) => s.id === selectedElement
        );
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

        // Check if Additional Text
        const additionalText = (state as any).additionalTexts?.find(
            (t: any) => t.id === selectedElement
        );
        if (additionalText) {
            return {
                type: 'text',
                data: {
                    id: selectedElement,
                    fontSize: additionalText.fontSize,
                    opacity: additionalText.opacity ?? 1,
                    fill: additionalText.fill,
                },
            };
        }

        // Check if Balken
        const balken = (state as any).balkenInstances?.find(
            (b: BalkenInstance) => b.id === selectedElement
        );
        if (balken) {
            return {
                type: 'text',
                data: {
                    id: selectedElement,
                    opacity: balken.opacity ?? 1,
                },
            };
        }

        // Check if Illustration
        const illustration = (state as any).illustrationInstances?.find(
            (i: IllustrationInstance) => i.id === selectedElement
        );
        if (illustration) {
            return {
                type: 'illustration',
                data: illustration,
            };
        }

        return null;
    }, [selectedElement, state, config.elements, layout]);
}
