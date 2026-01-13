import React, { useMemo, useState, useEffect, useRef, memo } from 'react';
import { Image, Group, Rect, Transformer } from 'react-konva';
import { renderToStaticMarkup } from 'react-dom/server';
import type { IconType } from 'react-icons';
import Konva from 'konva';

export interface IconPrimitiveProps {
    id: string;
    icon: IconType;
    x: number;
    y: number;
    scale: number;
    rotation: number;
    selected: boolean;
    onSelect: () => void;
    onDragEnd: (x: number, y: number) => void;
    onTransformEnd: (x: number, y: number, scale: number, rotation: number) => void;
    color?: string; // Optional override
    opacity?: number;
}

function IconPrimitiveInner({
    id,
    icon: Icon,
    x,
    y,
    scale,
    rotation,
    selected,
    onSelect,
    onDragEnd,
    onTransformEnd,
    color = '#000000',
    opacity = 1,
}: IconPrimitiveProps) {
    const groupRef = useRef<Konva.Group>(null);
    const transformerRef = useRef<Konva.Transformer>(null);
    const [image, setImage] = useState<HTMLImageElement | null>(null);

    // Render icon to image
    useEffect(() => {
        // Render at high resolution (e.g. 200px) so scaling looks good
        const size = 200;
        const svgString = renderToStaticMarkup(
            <Icon size={size} style={{ color }} />
        );
        const decoded = encodeURIComponent(svgString);
        const dataUrl = `data:image/svg+xml;charset=utf-8,${decoded}`;

        const img = new window.Image();
        img.src = dataUrl;
        img.onload = () => setImage(img);
    }, [Icon, color]);

    // Transformer logic
    useEffect(() => {
        if (selected && transformerRef.current && groupRef.current) {
            transformerRef.current.nodes([groupRef.current]);
            transformerRef.current.getLayer()?.batchDraw();
        }
    }, [selected]);

    if (!image) return null;

    // Use initial scale to bring 200px down to reasonable default (e.g. 50px)
    // 200 * 0.25 = 50.
    // We multiply state.scale by this base factor.
    const BASE_SIZE = 200;
    const TARGET_SIZE = 50;
    const baseScale = TARGET_SIZE / BASE_SIZE; // 0.25

    return (
        <>
            <Group
                ref={groupRef}
                x={x}
                y={y}
                scaleX={scale * baseScale}
                scaleY={scale * baseScale}

                rotation={rotation}
                opacity={opacity}
                draggable
                onClick={onSelect}
                onTap={onSelect}
                onDragEnd={(e) => {
                    onDragEnd(e.target.x(), e.target.y());
                }}
                onTransformEnd={() => {
                    const node = groupRef.current;
                    if (!node) return;

                    const scaleX = node.scaleX();
                    const scaleY = node.scaleY();
                    // Recover the abstract scale factor (dividing by baseScale)
                    const newScale = Math.max(scaleX, scaleY) / baseScale;
                    const newRotation = node.rotation();

                    // Reset node transform
                    node.scaleX(scale * baseScale);
                    node.scaleY(scale * baseScale);
                    node.rotation(rotation);

                    onTransformEnd(node.x(), node.y(), newScale, newRotation);
                }}
            >
                <Image
                    image={image}
                    width={BASE_SIZE}
                    height={BASE_SIZE}
                    offsetX={BASE_SIZE / 2}
                    offsetY={BASE_SIZE / 2}
                />

                {/* Selection border */}
                {selected && (
                    <Rect
                        x={-BASE_SIZE / 2}
                        y={-BASE_SIZE / 2}
                        width={BASE_SIZE}
                        height={BASE_SIZE}
                        stroke="#0066ff"
                        strokeWidth={2 / (scale * baseScale)} // Counter-scale stroke
                        dash={[5, 5]}
                        listening={false}
                    />
                )}
            </Group>

            {selected && (
                <Transformer
                    ref={transformerRef}
                    keepRatio={true}
                    enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
                />
            )}
        </>
    );
}

/**
 * Memoized IconPrimitive - Prevents unnecessary re-renders during drag
 */
export const IconPrimitive = memo(IconPrimitiveInner, (prevProps, nextProps) => {
    // Compare data props
    if (prevProps.id !== nextProps.id) return false;
    if (prevProps.icon !== nextProps.icon) return false;
    if (prevProps.x !== nextProps.x) return false;
    if (prevProps.y !== nextProps.y) return false;
    if (prevProps.scale !== nextProps.scale) return false;
    if (prevProps.rotation !== nextProps.rotation) return false;
    if (prevProps.selected !== nextProps.selected) return false;
    if (prevProps.color !== nextProps.color) return false;
    if (prevProps.opacity !== nextProps.opacity) return false;

    // Callbacks are considered stable
    return true;
});

IconPrimitive.displayName = 'IconPrimitive';
