import { useEffect } from 'react';
import type { BalkenInstance } from '../primitives';
import type { ShapeInstance } from '../utils/shapes';
import { CanvasClipboard } from '../utils/canvasClipboard';

/**
 * Canvas Keyboard Handlers - Keyboard shortcuts for canvas
 *
 * Handles:
 * - Copy (Ctrl+C): Copy selected element to clipboard
 * - Paste (Ctrl+V): Paste clipboard element with offset
 * - Delete/Backspace: Remove selected element
 *
 * Automatically prevents actions when typing in input/textarea fields.
 */

export interface UseCanvasKeyboardHandlersOptions<TState> {
    selectedElement: string | null;
    state: TState;
    actions: any;
    setState: (partial: Partial<TState> | ((prev: TState) => TState)) => void;
    setSelectedElement: (id: string | null) => void;
}

/**
 * Hook to handle keyboard shortcuts for canvas operations
 */
export function useCanvasKeyboardHandlers<TState>(
    options: UseCanvasKeyboardHandlersOptions<TState>
): void {
    const { selectedElement, state, actions, setState, setSelectedElement } = options;

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const isCtrlOrCmd = e.ctrlKey || e.metaKey;

            // PASTE (Ctrl+V)
            if (isCtrlOrCmd && e.key === 'v') {
                const clipboardData = CanvasClipboard.paste();
                if (!clipboardData) return;

                const { type, data } = clipboardData;
                const newId = `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                const offset = 20;

                setState((prev) => {
                    const newState = { ...prev } as any;
                    const prevState = prev as any;

                    if (type === 'shape') {
                        const newShape = { ...data, id: newId, x: data.x + offset, y: data.y + offset };
                        newState.shapeInstances = [...(prevState.shapeInstances || []), newShape];
                    } else if (type === 'illustration') {
                        const newIll = { ...data, id: newId, x: data.x + offset, y: data.y + offset };
                        newState.illustrationInstances = [...(prevState.illustrationInstances || []), newIll];
                    } else if (type === 'balken') {
                        const newBalken = {
                            ...data,
                            id: newId,
                            offset: { x: (data.offset?.x || 0) + offset, y: (data.offset?.y || 0) + offset },
                        };
                        newState.balkenInstances = [...(prevState.balkenInstances || []), newBalken];
                    } else if (type === 'additional-text') {
                        const newText = { ...data, id: newId, x: data.x + offset, y: data.y + offset };
                        newState.additionalTexts = [...(prevState.additionalTexts || []), newText];
                    }

                    return newState;
                });

                setTimeout(() => setSelectedElement(newId), 0);
                return;
            }

            if (!selectedElement) return;

            // COPY (Ctrl+C)
            if (isCtrlOrCmd && e.key === 'c') {
                const shape = (state as any).shapeInstances?.find((s: any) => s.id === selectedElement);
                if (shape) {
                    CanvasClipboard.copy('shape', shape);
                    return;
                }

                const ill = (state as any).illustrationInstances?.find((i: any) => i.id === selectedElement);
                if (ill) {
                    CanvasClipboard.copy('illustration', ill);
                    return;
                }

                const balken = (state as any).balkenInstances?.find((b: any) => b.id === selectedElement);
                if (balken) {
                    CanvasClipboard.copy('balken', balken);
                    return;
                }

                const text = (state as any).additionalTexts?.find((t: any) => t.id === selectedElement);
                if (text) {
                    CanvasClipboard.copy('additional-text', text);
                    return;
                }

                return;
            }

            // Ignore if typing in input
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

            // DELETE / BACKSPACE
            if (e.key === 'Delete' || e.key === 'Backspace') {
                // Remove Balken
                if ((state as any).balkenInstances?.find((b: BalkenInstance) => b.id === selectedElement)) {
                    if (actions.removeBalken) {
                        actions.removeBalken(selectedElement);
                        setSelectedElement(null);
                        return;
                    }
                }

                // Remove Icon
                if ((state as any).selectedIcons?.includes(selectedElement)) {
                    if (actions.toggleIcon) {
                        actions.toggleIcon(selectedElement, false);
                        setSelectedElement(null);
                        return;
                    }
                }

                // Remove Shape
                if ((state as any).shapeInstances?.find((s: ShapeInstance) => s.id === selectedElement)) {
                    if (actions.removeShape) {
                        actions.removeShape(selectedElement);
                        setSelectedElement(null);
                        return;
                    }
                }

                // Remove Additional Text
                if ((state as any).additionalTexts?.find((t: any) => t.id === selectedElement)) {
                    if (actions.removeAdditionalText) {
                        actions.removeAdditionalText(selectedElement);
                        setSelectedElement(null);
                        return;
                    }
                }

                // Remove Illustration
                if ((state as any).illustrationInstances?.find((i: any) => i.id === selectedElement)) {
                    if (actions.removeIllustration) {
                        actions.removeIllustration(selectedElement);
                        setSelectedElement(null);
                        return;
                    }
                }

                // Toggle Asset off
                if (actions.handleAssetToggle) {
                    actions.handleAssetToggle(selectedElement, false);
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedElement, actions, state, setState, setSelectedElement]);
}
