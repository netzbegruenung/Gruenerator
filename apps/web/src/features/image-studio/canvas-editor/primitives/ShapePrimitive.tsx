import React, { useRef, useEffect } from 'react';
import { Rect, Circle, RegularPolygon, Star, Path, Transformer, Group } from 'react-konva';
import Konva from 'konva';
import { ShapeInstance } from '../utils/shapes';

interface ShapePrimitiveProps {
    shape: ShapeInstance;
    isSelected: boolean;
    onSelect: (id: string) => void;
    onChange: (newAttrs: Partial<ShapeInstance>) => void;
    draggable?: boolean;
}

export const ShapePrimitive: React.FC<ShapePrimitiveProps> = ({
    shape,
    isSelected,
    onSelect,
    onChange,
    draggable = true,
}) => {
    const shapeRef = useRef<Konva.Shape>(null);
    const trRef = useRef<Konva.Transformer>(null);

    useEffect(() => {
        if (isSelected && trRef.current && shapeRef.current) {
            trRef.current.nodes([shapeRef.current]);
            trRef.current.getLayer()?.batchDraw();
        }
    }, [isSelected]);

    const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
        onChange({
            x: e.target.x(),
            y: e.target.y(),
        });
    };

    const handleTransformEnd = () => {
        const node = shapeRef.current;
        if (!node) return;

        const scaleX = node.scaleX();
        const scaleY = node.scaleY();

        // Reset scale and update width/height directly to prevent distortion
        // but for simple shapes, keeping scale is often easier for rotation logic.
        // Let's stick to standard Konva transform logic.

        onChange({
            x: node.x(),
            y: node.y(),
            rotation: node.rotation(),
            scaleX: scaleX,
            scaleY: scaleY,
        });
    };

    const commonProps = {
        ref: shapeRef as unknown as React.Ref<Konva.Shape>,
        x: shape.x,
        y: shape.y,
        fill: shape.fill,
        opacity: shape.opacity ?? 1,
        rotation: shape.rotation,
        scaleX: shape.scaleX,
        scaleY: shape.scaleY,
        draggable: draggable,
        onClick: (e: Konva.KonvaEventObject<MouseEvent>) => {
            e.cancelBubble = true;
            onSelect(shape.id);
        },
        onTap: (e: Konva.KonvaEventObject<TouchEvent>) => {
            e.cancelBubble = true;
            onSelect(shape.id);
        },
        onDragEnd: handleDragEnd,
        onTransformEnd: handleTransformEnd,
        name: `shape-${shape.id}`,
    };

    return (
        <>
            {shape.type === 'rect' && (
                <Rect
                    {...commonProps}
                    width={shape.width}
                    height={shape.height}
                    offsetX={shape.width / 2}
                    offsetY={shape.height / 2}
                />
            )}

            {shape.type === 'circle' && (
                <Circle
                    {...commonProps}
                    width={shape.width}
                    height={shape.height}
                    // Circle default offset is center if standard radius used, but width/height works too
                    // Konva Circle is defined by radius usually, but width/height prop works as diameter?
                    // No, Circle takes radius. So width should be radius * 2. 
                    // Let's use radius prop for clarity or rely on Konva's width handling if it supports it.
                    // Konva Circle uses radius. Let's map width to radius.
                    radius={shape.width / 2}
                />
            )}

            {shape.type === 'triangle' && (
                <RegularPolygon
                    {...commonProps}
                    sides={3}
                    radius={shape.width / 2}
                />
            )}

            {shape.type === 'star' && (
                <Star
                    {...commonProps}
                    numPoints={5}
                    innerRadius={shape.width / 4}
                    outerRadius={shape.width / 2}
                />
            )}

            {shape.type === 'arrow' && (
                <Path
                    {...commonProps}
                    data="M0,20 L50,20 L50,0 L100,50 L50,100 L50,80 L0,80 Z"
                    // Center offset (approximate for 100x100 path)
                    offsetX={50}
                    offsetY={50}
                    // Scale path to match shape width
                    scaleX={shape.width / 100 * shape.scaleX}
                    scaleY={shape.height / 100 * shape.scaleY}
                // Override commonProps scale because we handled it above effectively?
                // No, commonProps applies transform to the Node.
                // If we apply scale here AND commonProps, it doubles.
                // But commonProps uses shape.scaleX, which is user interaction state.
                // The path coordinates are fixed 0-100. We need to scale them to shape.width.
                // So we should map width to scale ONLY, and let commonProps handle user interaction scale?
                // Wait, Rect/Circle use width/height props. Path does not.
                // Path needs 'scale' attribute to size it.
                />
            )}

            {shape.type === 'heart' && (
                <Path
                    {...commonProps}
                    data="M50,90 C50,90 10,70 10,40 C10,15 30,5 50,30 C70,5 90,15 90,40 C90,70 50,90 50,90 Z"
                    // 100x100 box approx
                    offsetX={50}
                    offsetY={50}
                    scaleX={shape.width / 100 * shape.scaleX}
                    scaleY={shape.height / 100 * shape.scaleY}
                />
            )}

            {shape.type === 'cloud' && (
                <Path
                    {...commonProps}
                    data="M25,60 C10,60 0,50 0,35 C0,20 15,10 25,15 C30,5 45,0 60,5 C75,10 80,20 80,25 C90,25 100,35 100,50 C100,65 85,75 70,70 C60,80 35,80 25,60 Z"
                    // 100x100 box approx
                    offsetX={50}
                    offsetY={40}
                    scaleX={shape.width / 100 * shape.scaleX}
                    scaleY={shape.height / 100 * shape.scaleY}
                />
            )}

            {isSelected && (
                <Transformer
                    ref={trRef}
                    boundBoxFunc={(oldBox, newBox) => {
                        // Limit minimum size
                        if (newBox.width < 5 || newBox.height < 5) {
                            return oldBox;
                        }
                        return newBox;
                    }}
                    anchorSize={10}
                    anchorCornerRadius={5}
                    rotateEnabled={true}
                    borderStroke={shape.fill === '#316049' || shape.fill === '#000000' ? '#ffffff' : '#316049'}
                    anchorStroke={shape.fill === '#316049' || shape.fill === '#000000' ? '#ffffff' : '#316049'}
                    anchorFill="#ffffff"
                />
            )}
        </>
    );
};
