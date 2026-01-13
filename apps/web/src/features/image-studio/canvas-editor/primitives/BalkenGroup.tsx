/**
 * BalkenGroup - Reusable Konva component for rendering decorative parallelogram bars
 * 
 * Renders 1 or 3 skewed parallelogram bars with text inside, matching DreizeilenCanvas style exactly.
 * Uses the same layout calculations as calculateDreizeilenLayout.
 */

import { useRef, useCallback, useMemo, useEffect, useState } from 'react';
import { Group, Line, Text, Rect, Transformer } from 'react-konva';
import type Konva from 'konva';
import {
    DREIZEILEN_CONFIG,
    getColorScheme,
    calculateParallelogramPoints,
    flattenPoints,
    measureTextWidth
} from '../utils/dreizeilenLayout';
import { calculateElementSnapPosition } from '../utils/snapping';

export type BalkenMode = 'single' | 'triple';

export interface BalkenInstance {
    id: string;
    mode: BalkenMode;
    colorSchemeId: string;
    widthScale: number;
    offset: { x: number; y: number };
    scale: number;
    texts: string[];
    rotation: number;
    opacity?: number;
    barOffsets?: [number, number, number];
}

export interface BalkenGroupProps {
    /** Mode: 'single' for 1 bar, 'triple' for 3 bars */
    mode: BalkenMode;
    /** Color scheme ID from dreizeilenLayout */
    colorSchemeId: string;
    /** Custom texts for the bars */
    texts: string[];
    /** Position offset */
    offset: { x: number; y: number };
    /** Overall scale factor */
    scale: number;
    /** Width scale factor (stretches bars horizontally) */
    widthScale: number;
    /** Rotation in degrees */
    rotation: number;
    /** Whether this element is selected */
    selected: boolean;
    /** Called when element is selected */
    onSelect: () => void;
    /** Called when drag ends */
    onDragEnd: (x: number, y: number) => void;
    /** Called when transform ends */
    onTransformEnd: (x: number, y: number, scale: number, rotation: number) => void;
    /** Called during drag for snapping feedback */
    onSnapChange: (snapH: boolean, snapV: boolean) => void;
    /** Called with snap lines */
    onSnapLinesChange: (lines: unknown[]) => void;
    /** Get snap targets excluding this element */
    getSnapTargets: (excludeId: string) => unknown[];
    /** Called when text is edited inline */
    onTextChange?: (index: number, text: string) => void;
    /** Canvas dimensions */
    stageWidth: number;
    stageHeight: number;
    /** Opacity (0-1) */
    opacity?: number;
    /** Per-line horizontal offsets for fine-tuning */
    barOffsets?: [number, number, number];
}

interface BalkenLayout {
    x: number;
    y: number;
    width: number;
    height: number;
    colorIndex: number;
    text: string;
}

/**
 * Calculate bar layouts matching DreizeilenCanvas exactly
 * Uses same logic as calculateDreizeilenLayout in dreizeilenLayout.ts
 */
function calculateBalkenLayouts(
    mode: BalkenMode,
    widthScale: number,
    texts: string[],
    stageWidth: number,
    stageHeight: number,
    barOffsets?: [number, number, number]
): { balkens: BalkenLayout[]; bounds: { left: number; top: number; width: number; height: number } } {
    const config = DREIZEILEN_CONFIG;
    const fontSize = config.text.defaultFontSize; // 75
    const balkenHeight = fontSize * config.balken.heightFactor; // 75 * 1.6 = 120
    const padding = fontSize * config.balken.paddingFactor; // 75 * 0.3 = 22.5

    // Use provided offsets or fall back to defaults
    const balkenOffset: [number, number, number] = barOffsets ?? config.defaults.balkenOffset;

    if (mode === 'single') {
        const text = texts[0] || 'GRÜNE';
        const textWidth = measureTextWidth(text, fontSize);
        const baseWidth = textWidth + padding * 2 + 20;
        const rectWidth = Math.min(baseWidth * widthScale, stageWidth - 20);

        // Center the single bar
        const x = (stageWidth - rectWidth) / 2;
        const y = (stageHeight - balkenHeight) / 2;

        return {
            balkens: [{ x, y, width: rectWidth, height: balkenHeight, colorIndex: 0, text }],
            bounds: { left: x, top: y, width: rectWidth, height: balkenHeight },
        };
    }

    // Triple mode - exactly like DreizeilenCanvas with 3 lines
    // Default texts if custom texts are empty
    const lines: [string, string, string] = [
        texts[0] || 'DIE',
        texts[1] || 'GRÜNEN',
        texts[2] || 'SIND DA'
    ];

    // Calculate total height (no gaps - bars stack tightly)
    const totalHeight = balkenHeight * 3;
    const startY = (stageHeight - totalHeight) / 2;

    // Map which uses staggered layout logic
    const balkens: BalkenLayout[] = lines.map((text, index) => {
        const textWidth = measureTextWidth(text, fontSize);
        const baseWidth = textWidth + padding * 2 + 20;
        const rectWidth = Math.min(baseWidth * widthScale, stageWidth - 20);

        // X position: centered + per-line offset (matching DreizeilenCanvas)
        const x = Math.max(
            10,
            Math.min(
                stageWidth - rectWidth - 10,
                (stageWidth - rectWidth) / 2 + balkenOffset[index]
            )
        );

        const y = startY + balkenHeight * index;

        return {
            x,
            y,
            width: rectWidth,
            height: balkenHeight,
            colorIndex: index,
            text,
        };
    });

    // Calculate bounds
    const minX = Math.min(...balkens.map(b => b.x));
    const maxX = Math.max(...balkens.map(b => b.x + b.width));

    return {
        balkens,
        bounds: {
            left: minX,
            top: startY,
            width: maxX - minX,
            height: totalHeight,
        },
    };
}

export function BalkenGroup({
    mode,
    colorSchemeId,
    texts,
    offset,
    scale,
    widthScale,
    rotation,
    selected,
    onSelect,
    onDragEnd,
    onTransformEnd,
    onSnapChange,
    onSnapLinesChange,
    getSnapTargets,
    onTextChange,
    stageWidth,
    stageHeight,
    opacity = 1,
    barOffsets,
}: BalkenGroupProps) {
    const groupRef = useRef<Konva.Group>(null);
    const transformerRef = useRef<Konva.Transformer>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [liveText, setLiveText] = useState<{ index: number, text: string } | null>(null);

    const config = DREIZEILEN_CONFIG;
    const fontSize = config.text.defaultFontSize;
    const colorScheme = useMemo(() => getColorScheme(colorSchemeId), [colorSchemeId]);

    // Merge props texts with live text for display
    const displayTexts = useMemo(() => {
        if (liveText && liveText.index !== null) {
            const newTexts = [...texts];
            // Fill gaps if texts array is sparse
            if (newTexts.length <= liveText.index) {
                // Ensure array is long enough (up to 3)
                // Actually spread covers indices 0..length-1. 
                // We just assign.
            }
            newTexts[liveText.index] = liveText.text;
            return newTexts;
        }
        return texts;
    }, [texts, liveText]);

    const { balkens, bounds } = useMemo(
        () => calculateBalkenLayouts(mode, widthScale, displayTexts, stageWidth, stageHeight, barOffsets),
        [mode, widthScale, displayTexts, stageWidth, stageHeight, barOffsets]
    );

    // Attach transformer when selected
    useEffect(() => {
        if (selected && groupRef.current && transformerRef.current) {
            transformerRef.current.nodes([groupRef.current]);
            transformerRef.current.getLayer()?.batchDraw();
        }
    }, [selected]);

    // Cleanup input on unmount
    useEffect(() => {
        return () => {
            if (inputRef.current && document.body.contains(inputRef.current)) {
                document.body.removeChild(inputRef.current);
            }
        };
    }, []);

    // Update input position when layout changes (e.g. typing causes grow)
    useEffect(() => {
        if (editingIndex === null || !inputRef.current || !groupRef.current) return;

        const stage = groupRef.current.getStage();
        if (!stage) return;

        const balken = balkens[editingIndex];
        // Cannot use textNode ref because there are multiple.
        // We calculate absolute position manually based on Group properties.

        const groupNode = groupRef.current;
        const transform = groupNode.getAbsoluteTransform().copy();

        // The text is positioned at (balken.x + skewOffset/2, balken.y) inside the group
        const skewAngle = config.balken.skewAngle;
        const skewRad = (skewAngle * Math.PI) / 180;
        const skewOffset = (balken.height * Math.tan(skewRad)) / 2;

        const localX = balken.x + skewOffset / 2;
        const localY = balken.y;

        const pos = transform.point({ x: localX, y: localY });

        const stageBox = stage.container().getBoundingClientRect();
        const scrollX = window.scrollX || window.pageXOffset;
        const scrollY = window.scrollY || window.pageYOffset;

        const scaleX = groupNode.getAbsoluteScale().x;
        const scaleY = groupNode.getAbsoluteScale().y;

        const input = inputRef.current;

        // Calculate vertical centering
        // Konva text is vertically centered in the bar height
        // We want input to hug the text content
        const lineHeight = 1.1; // Tighter line height
        const textHeight = fontSize * lineHeight;
        const verticalOffset = (balken.height - textHeight) / 2;

        input.style.top = `${stageBox.top + scrollY + pos.y + (verticalOffset * scaleY)}px`;
        input.style.left = `${stageBox.left + scrollX + pos.x}px`;
        input.style.width = `${balken.width * scaleX}px`;
        input.style.height = `${textHeight * scaleY}px`;
        input.style.lineHeight = String(lineHeight);

    }, [balkens, editingIndex, stageWidth, stageHeight, fontSize]); // Added fontSize dep

    const handleDragMove = useCallback((e: Konva.KonvaEventObject<DragEvent>) => {
        const node = e.target as Konva.Group;
        const scaleX = node.scaleX();
        const scaleY = node.scaleY();

        const contentLeft = bounds.left * scaleX;
        const contentTop = bounds.top * scaleY;
        const contentWidth = bounds.width * scaleX;
        const contentHeight = bounds.height * scaleY;
        const currentAbsX = node.x() + contentLeft;
        const currentAbsY = node.y() + contentTop;

        const result = calculateElementSnapPosition(
            currentAbsX,
            currentAbsY,
            contentWidth,
            contentHeight,
            getSnapTargets('balken-group'),
            stageWidth,
            stageHeight
        );

        node.position({ x: result.x - contentLeft, y: result.y - contentTop });
        onSnapChange(result.snapH, result.snapV);
        onSnapLinesChange(result.snapLines);
    }, [bounds, getSnapTargets, stageWidth, stageHeight, onSnapChange, onSnapLinesChange]);

    const handleDragEnd = useCallback((e: Konva.KonvaEventObject<DragEvent>) => {
        onSnapChange(false, false);
        onSnapLinesChange([]);
        onDragEnd(e.target.x(), e.target.y());
    }, [onDragEnd, onSnapChange, onSnapLinesChange]);

    const handleTransformEnd = useCallback(() => {
        const node = groupRef.current;
        if (!node) return;

        const scaleX = node.scaleX();
        const scaleY = node.scaleY();
        const newScale = Math.max(scaleX, scaleY);
        const rotation = node.rotation();

        node.scaleX(1);
        node.scaleY(1);
        node.rotation(0);

        onTransformEnd(node.x(), node.y(), newScale, rotation);
    }, [onTransformEnd]);

    const handleDblClick = useCallback((index: number, e: Konva.KonvaEventObject<Event>) => {
        const textNode = e.target as Konva.Text;
        const stage = textNode.getStage();
        if (!stage) return;

        setEditingIndex(index);
        setLiveText({ index, text: textNode.text() });

        const stageBox = stage.container().getBoundingClientRect();
        const textPosition = textNode.getAbsolutePosition();

        const absScale = textNode.getAbsoluteScale();
        const scaleX = absScale.x;
        const scaleY = absScale.y;

        let input = inputRef.current;
        if (!input) {
            input = document.createElement('input');
            document.body.appendChild(input);
            inputRef.current = input;
        }

        const scrollX = window.scrollX || window.pageXOffset;
        const scrollY = window.scrollY || window.pageYOffset;

        // Vertical centering
        const lineHeight = 1.1;
        const fontSz = textNode.fontSize();
        const textH = fontSz * lineHeight;
        const nodeH = textNode.height(); // Full bar height
        const verticalOffset = (nodeH - textH) / 2;

        input.value = textNode.text();
        input.style.position = 'absolute';
        input.style.top = `${stageBox.top + scrollY + textPosition.y + (verticalOffset * scaleY)}px`;
        input.style.left = `${stageBox.left + scrollX + textPosition.x}px`;
        input.style.width = `${textNode.width() * scaleX}px`;
        input.style.height = `${textH * scaleY}px`; // Match text height

        input.style.fontSize = `${fontSz * scaleY}px`;
        input.style.fontFamily = textNode.fontFamily();
        input.style.color = textNode.fill() as string;
        input.style.textAlign = 'center';
        input.style.lineHeight = String(lineHeight);

        input.style.border = 'none';
        input.style.padding = '0px';
        input.style.margin = '0';
        input.style.background = 'none';
        input.style.outline = '2px solid #0088cc';
        input.style.zIndex = '10000';
        input.style.transformOrigin = 'left top';

        input.focus();
        input.select();

        const removeInput = () => {
            if (!inputRef.current) return;

            const newText = inputRef.current.value;
            // Only update via prop if changed, otherwise just closing edit mode
            // We use displayTexts[index] as "previous value" might be stale from closure?
            // Safer to just emit current value of input.
            // But props.texts might not be up to date with liveText?
            // Actually liveText is what we see. 
            if (onTextChange) {
                // We don't check inequality vs initial, we just emit.
                // Or we can check vs props.texts[index].
                onTextChange(index, newText);
            }

            setEditingIndex(null);
            setLiveText(null);

            if (document.body.contains(inputRef.current)) {
                document.body.removeChild(inputRef.current);
            }
            inputRef.current = null;
        };

        const onInput = () => {
            if (inputRef.current) {
                setLiveText({ index, text: inputRef.current.value });
            }
        };

        input.addEventListener('input', onInput);
        input.addEventListener('blur', removeInput);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                input?.blur();
            }
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                input?.blur();
            }
        });

    }, [onTextChange]);

    const skewAngle = config.balken.skewAngle;

    return (
        <>
            <Group
                ref={groupRef}
                x={offset.x}
                y={offset.y}
                scaleX={scale}
                scaleY={scale}
                rotation={rotation}
                opacity={opacity}
                draggable={editingIndex === null} // Disable drag while editing
                onDragMove={handleDragMove}
                onDragEnd={handleDragEnd}
                onTransformEnd={handleTransformEnd}
                onClick={onSelect}
                onTap={onSelect}
            >
                {balkens.map((balken, index) => {
                    const colorPair = colorScheme.colors[balken.colorIndex % colorScheme.colors.length];
                    const points = calculateParallelogramPoints(
                        balken.x,
                        balken.y,
                        balken.width,
                        balken.height,
                        skewAngle
                    );

                    // Calculate skew offset for text positioning (same as DreizeilenCanvas)
                    const skewRad = (skewAngle * Math.PI) / 180;
                    const skewOffset = (balken.height * Math.tan(skewRad)) / 2;
                    const isEditingThis = editingIndex === index;

                    return (
                        <Group key={index}>
                            <Line
                                points={flattenPoints(points)}
                                closed
                                fill={colorPair.background}
                            />
                            <Text
                                text={balken.text}
                                x={balken.x + skewOffset / 2}
                                y={balken.y}
                                width={balken.width}
                                height={balken.height}
                                fontSize={fontSize}
                                fontFamily={`${config.text.fontFamily}, Arial, sans-serif`}
                                fill={colorPair.text}
                                align="center"
                                verticalAlign="middle"
                                listening={true} // Must listen for events
                                onDblClick={(e) => handleDblClick(index, e)}
                                onDblTap={(e) => handleDblClick(index, e)}
                                visible={!isEditingThis} // Hide text while editing
                            />
                        </Group>
                    );
                })}

                {/* Selection indicator */}
                {selected && editingIndex === null && (
                    <Rect
                        x={bounds.left - 4}
                        y={bounds.top - 4}
                        width={bounds.width + 8}
                        height={bounds.height + 8}
                        stroke="#0066ff"
                        strokeWidth={2}
                        dash={[5, 5]}
                        listening={false}
                    />
                )}
            </Group>

            {selected && editingIndex === null && (
                <Transformer
                    ref={transformerRef}
                    keepRatio={true}
                    enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
                    boundBoxFunc={(oldBox, newBox) => {
                        const minSize = 50;
                        const maxSize = 2000;
                        if (newBox.width < minSize || newBox.height < minSize) return oldBox;
                        if (newBox.width > maxSize || newBox.height > maxSize) return oldBox;
                        return newBox;
                    }}
                />
            )}
        </>
    );
}

export default BalkenGroup;
