import React, { memo } from 'react';
import { CanvasText } from '../primitives';
import { BalkenGroup } from '../primitives/BalkenGroup';
import type { BalkenInstance } from '../primitives';
import { IconPrimitive } from '../primitives/IconPrimitive';
import { ShapePrimitive } from '../primitives/ShapePrimitive';
import { IllustrationPrimitive } from '../primitives/IllustrationPrimitive';
import { ALL_ICONS } from '../utils/canvasIcons';
import type { ShapeInstance } from '../utils/shapes';
import type { IllustrationInstance } from '../utils/canvasIllustrations';
import { GenericCanvasElement } from './GenericCanvasElement';
import type { CanvasElementConfig, FullCanvasConfig, LayoutResult } from '../configs/types';
import type { CanvasItem } from '../utils/canvasLayerManager';

/**
 * CanvasRenderLayer - Renders all canvas elements in layer order
 *
 * Maps over sortedRenderList and renders the appropriate component
 * for each item type (element, balken, icon, shape, illustration, text).
 */

interface CanvasRenderLayerProps {
    sortedRenderList: CanvasItem[];
    config: FullCanvasConfig;
    state: any;
    layout: LayoutResult;
    selectedElement: string | null;
    handlers: {
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
        handleAdditionalTextChange: (id: string, newAttrs: any) => void;
    };
    getSnapTargets: (id: string) => any[];
    handleSnapChange: (h: boolean, v: boolean) => void;
    setSnapLines: (lines: any[]) => void;
    stageWidth: number;
    stageHeight: number;
}

export const CanvasRenderLayer = memo(({
    sortedRenderList,
    config,
    state,
    layout,
    selectedElement,
    handlers,
    getSnapTargets,
    handleSnapChange,
    setSnapLines,
    stageWidth,
    stageHeight,
}: CanvasRenderLayerProps) => {
    return (
        <>
            {sortedRenderList.map((item) => {
                // Render Config Element
                if (item.type === 'element') {
                    const elementConfig = item.data as CanvasElementConfig;
                    return (
                        <GenericCanvasElement
                            key={elementConfig.id}
                            config={elementConfig}
                            state={state}
                            layout={layout}
                            selectedElement={selectedElement}
                            onSelect={handlers.handleElementSelect}
                            onTextChange={handlers.handleTextChange}
                            onFontSizeChange={handlers.handleFontSizeChange}
                            onPositionChange={handlers.handleElementPositionChange}
                            onImageDragEnd={handlers.handleImageDragEnd}
                            onImageTransformEnd={handlers.handleImageTransformEnd}
                            onSnapChange={handleSnapChange}
                            onSnapLinesChange={setSnapLines}
                            stageWidth={stageWidth}
                            stageHeight={stageHeight}
                            snapTargets={getSnapTargets(elementConfig.id)}
                        />
                    );
                }

                // Render Balken
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
                            barOffsets={balken.barOffsets}
                            selected={selectedElement === balken.id}
                            onSelect={() => handlers.handleBalkenSelect(balken.id)}
                            onTextChange={(idx, txt) => {
                                if ((state as any).actions?.setBalkenText) {
                                    (state as any).actions.setBalkenText(balken.id, idx, txt);
                                }
                            }}
                            onDragEnd={(x, y) => handlers.handleBalkenDragEnd(balken.id, x, y)}
                            onTransformEnd={(x, y, s, r) =>
                                handlers.handleBalkenTransformEnd(balken.id, x, y, s, r)
                            }
                            onSnapChange={handleSnapChange}
                            onSnapLinesChange={setSnapLines}
                            getSnapTargets={getSnapTargets}
                            stageWidth={stageWidth}
                            stageHeight={stageHeight}
                            opacity={balken.opacity ?? 1}
                        />
                    );
                }

                // Render Icon
                if (item.type === 'icon') {
                    const iconId = item.id;
                    const iconDef = ALL_ICONS.find((i) => i.id === iconId);
                    const iconState = state.iconStates?.[iconId];

                    const x = iconState?.x ?? stageWidth / 2;
                    const y = iconState?.y ?? stageHeight / 2;
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
                            onSelect={() => handlers.handleElementSelect(iconId)}
                            onDragEnd={(nx, ny) => handlers.handleIconDragEnd(iconId, nx, ny)}
                            onTransformEnd={(nx, ny, ns, nr) =>
                                handlers.handleIconTransformEnd(iconId, nx, ny, ns, nr)
                            }
                        />
                    );
                }

                // Render Shape
                if (item.type === 'shape') {
                    const shape = item.data as ShapeInstance;
                    return (
                        <ShapePrimitive
                            key={shape.id}
                            shape={shape}
                            isSelected={selectedElement === shape.id}
                            onSelect={handlers.handleElementSelect}
                            onChange={(attrs) => handlers.handleShapeChange(shape.id, attrs)}
                            draggable={true}
                        />
                    );
                }

                // Render Illustration
                if (item.type === 'illustration') {
                    const ill = item.data as IllustrationInstance;
                    return (
                        <IllustrationPrimitive
                            key={ill.id}
                            illustration={ill}
                            isSelected={selectedElement === ill.id}
                            onSelect={() => handlers.handleElementSelect(ill.id)}
                            onDragEnd={(x: number, y: number) => {
                                if ((state as any).actions?.updateIllustration) {
                                    (state as any).actions.updateIllustration(ill.id, { x, y });
                                }
                            }}
                            onTransformEnd={(x: number, y: number, scale: number, rotation: number) => {
                                if ((state as any).actions?.updateIllustration) {
                                    (state as any).actions.updateIllustration(ill.id, {
                                        x,
                                        y,
                                        scale,
                                        rotation,
                                    });
                                }
                            }}
                            onSnapChange={handleSnapChange}
                            onSnapLinesChange={setSnapLines}
                            getSnapTargets={getSnapTargets}
                            stageWidth={stageWidth}
                            stageHeight={stageHeight}
                        />
                    );
                }

                // Render Additional Text
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
                            onSelect={() => handlers.handleElementSelect(textItem.id)}
                            onTextChange={(val) => handlers.handleAdditionalTextChange(textItem.id, { text: val })}
                            onDragEnd={(x, y) => {
                                handlers.handleAdditionalTextChange(textItem.id, { x, y });
                            }}
                            onTransformEnd={(x, y, width, scaleX) => {
                                handlers.handleAdditionalTextChange(textItem.id, {
                                    x,
                                    y,
                                    width,
                                    scale: scaleX,
                                });
                            }}
                            editable={true}
                            onSnapChange={handleSnapChange}
                            onSnapLinesChange={setSnapLines}
                            snapTargets={getSnapTargets(textItem.id)}
                            stageWidth={stageWidth}
                            stageHeight={stageHeight}
                        />
                    );
                }

                return null;
            })}
        </>
    );
});

CanvasRenderLayer.displayName = 'CanvasRenderLayer';
