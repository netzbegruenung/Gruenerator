import React, { memo } from 'react';

import { CanvasText } from '../primitives';
import { AssetPrimitive } from '../primitives/AssetPrimitive';
import { BalkenGroup } from '../primitives/BalkenGroup';
import { CircleBadge } from '../primitives/CircleBadge';
import { IconPrimitive } from '../primitives/IconPrimitive';
import { IllustrationPrimitive } from '../primitives/IllustrationPrimitive';
import { ShapePrimitive } from '../primitives/ShapePrimitive';
import { ALL_ICONS } from '../utils/canvasIcons';

import { GenericCanvasElement } from './GenericCanvasElement';

import type { CanvasElementConfig, FullCanvasConfig, LayoutResult } from '../configs/types';
import type { BalkenInstance, CircleBadgeInstance } from '../primitives';
import type { AssetInstance } from '../utils/canvasAssets';
import type { CanvasItem } from '../utils/canvasLayerManager';
import type { IllustrationInstance } from '../utils/illustrations/types';
import type { ShapeInstance } from '../utils/shapes';
import type { SnapLine, SnapTarget } from '../utils/snapping';

/**
 * CanvasRenderLayer - Renders all canvas elements in layer order
 *
 * Maps over sortedRenderList and renders the appropriate component
 * for each item type (element, balken, icon, shape, illustration, text).
 */

/**
 * Optional properties that may exist on canvas state for different element types
 */
interface OptionalCanvasStateProperties {
  iconStates?: Record<
    string,
    {
      x?: number;
      y?: number;
      scale?: number;
      rotation?: number;
      color?: string;
      opacity?: number;
    }
  >;
}

type FontStyleType = 'normal' | 'italic' | 'bold' | 'bold italic';

/** Additional text element attributes */
interface AdditionalTextAttrs {
  text?: string;
  x?: number;
  y?: number;
  width?: number;
  scale?: number;
}

/** Additional text item from canvas items */
interface AdditionalTextItem {
  id: string;
  text: string;
  x: number;
  y: number;
  width?: number;
  fontSize?: number;
  fontFamily?: string;
  fontStyle?: FontStyleType;
  fill?: string;
  opacity?: number;
  rotation?: number;
  scale?: number;
}

interface CanvasRenderLayerProps<
  TState extends Record<string, unknown> = Record<string, unknown>,
  TActions = Record<string, unknown>,
> {
  sortedRenderList: CanvasItem[];
  config: FullCanvasConfig<TState, TActions>;
  state: TState;
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
    handleBalkenTransformEnd: (
      id: string,
      x: number,
      y: number,
      scale: number,
      rotation: number
    ) => void;
    handleIconDragEnd: (id: string, x: number, y: number) => void;
    handleIconTransformEnd: (
      id: string,
      x: number,
      y: number,
      scale: number,
      rotation: number
    ) => void;
    handleShapeChange: (id: string, newAttrs: Partial<ShapeInstance>) => void;
    handleAdditionalTextChange: (id: string, newAttrs: AdditionalTextAttrs) => void;
    handleCircleBadgeSelect: (id: string) => void;
    handleCircleBadgeDragEnd: (id: string, x: number, y: number) => void;
    handleCircleBadgeTransformEnd: (
      id: string,
      x: number,
      y: number,
      scale: number,
      rotation: number
    ) => void;
    handleAssetDragEnd: (id: string, x: number, y: number) => void;
    handleAssetTransformEnd: (
      id: string,
      x: number,
      y: number,
      scale: number,
      rotation: number
    ) => void;
    handleIllustrationDragEnd: (id: string, x: number, y: number) => void;
    handleIllustrationTransformEnd: (
      id: string,
      x: number,
      y: number,
      scale: number,
      rotation: number
    ) => void;
  };
  getSnapTargets: (id: string) => SnapTarget[];
  handleSnapChange: (h: boolean, v: boolean) => void;
  setSnapLines: (lines: SnapLine[]) => void;
  stageWidth: number;
  stageHeight: number;
}

function CanvasRenderLayerInner<
  TState extends Record<string, unknown> = Record<string, unknown>,
  TActions = Record<string, unknown>,
>({
  sortedRenderList,
  config: _config,
  state,
  layout,
  selectedElement,
  handlers,
  getSnapTargets,
  handleSnapChange,
  setSnapLines,
  stageWidth,
  stageHeight,
}: CanvasRenderLayerProps<TState, TActions>) {
  return (
    <>
      {sortedRenderList.map((item) => {
        // Render Config Element
        if (item.type === 'element') {
          const elementConfig = item.data as unknown as CanvasElementConfig;
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
          const balken = item.data as unknown as BalkenInstance;
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
                const stateWithActions = state as unknown as Record<string, unknown>;
                if (
                  (
                    stateWithActions.actions as unknown as Record<
                      string,
                      (id: string, idx: number, txt: string) => void
                    >
                  )?.setBalkenText
                ) {
                  (
                    stateWithActions.actions as unknown as Record<
                      string,
                      (id: string, idx: number, txt: string) => void
                    >
                  ).setBalkenText(balken.id, idx, txt);
                }
              }}
              onDragEnd={(x, y) => handlers.handleBalkenDragEnd(balken.id, x, y)}
              onTransformEnd={(x, y, s, r) =>
                handlers.handleBalkenTransformEnd(balken.id, x, y, s, r)
              }
              onSnapChange={handleSnapChange}
              onSnapLinesChange={(lines) => setSnapLines(lines as SnapLine[])}
              getSnapTargets={(id) => getSnapTargets(id) as unknown[]}
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

          // Type-safe access to optional iconStates property
          const stateWithOptional = state as TState & Partial<OptionalCanvasStateProperties>;
          const iconState = stateWithOptional.iconStates?.[iconId];

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
          const shape = item.data as unknown as ShapeInstance;
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
          const ill = item.data as unknown as IllustrationInstance;
          return (
            <IllustrationPrimitive
              key={ill.id}
              illustration={ill}
              isSelected={selectedElement === ill.id}
              onSelect={() => handlers.handleElementSelect(ill.id)}
              onDragEnd={(x: number, y: number) =>
                handlers.handleIllustrationDragEnd(ill.id, x, y)
              }
              onTransformEnd={(x: number, y: number, scale: number, rotation: number) =>
                handlers.handleIllustrationTransformEnd(ill.id, x, y, scale, rotation)
              }
              onSnapChange={handleSnapChange}
              onSnapLinesChange={(lines) => setSnapLines(lines as SnapLine[])}
              getSnapTargets={(id) => getSnapTargets(id) as unknown[]}
              stageWidth={stageWidth}
              stageHeight={stageHeight}
            />
          );
        }

        // Render Asset (decorative elements like sunflowers, arrows)
        if (item.type === 'asset') {
          const asset = item.data as unknown as AssetInstance;
          return (
            <AssetPrimitive
              key={asset.id}
              asset={asset}
              isSelected={selectedElement === asset.id}
              onSelect={() => handlers.handleElementSelect(asset.id)}
              onDragEnd={(x: number, y: number) =>
                handlers.handleAssetDragEnd(asset.id, x, y)
              }
              onTransformEnd={(x: number, y: number, scale: number, rotation: number) =>
                handlers.handleAssetTransformEnd(asset.id, x, y, scale, rotation)
              }
            />
          );
        }

        // Render Circle Badge (e.g., date circles)
        if (item.type === 'circle-badge') {
          const badge = item.data as unknown as CircleBadgeInstance;
          return (
            <CircleBadge
              key={badge.id}
              id={badge.id}
              x={badge.x}
              y={badge.y}
              radius={badge.radius}
              backgroundColor={badge.backgroundColor}
              textColor={badge.textColor}
              rotation={badge.rotation}
              scale={badge.scale}
              opacity={badge.opacity ?? 1}
              textLines={badge.textLines}
              selected={selectedElement === badge.id}
              onSelect={() => handlers.handleCircleBadgeSelect(badge.id)}
              onDragEnd={(x, y) => handlers.handleCircleBadgeDragEnd(badge.id, x, y)}
              onTransformEnd={(x, y, s, r) =>
                handlers.handleCircleBadgeTransformEnd(badge.id, x, y, s, r)
              }
              onSnapChange={handleSnapChange}
              onSnapLinesChange={(lines) => setSnapLines(lines as SnapLine[])}
              getSnapTargets={(id) => getSnapTargets(id) as unknown[]}
              stageWidth={stageWidth}
              stageHeight={stageHeight}
            />
          );
        }

        // Render Additional Text
        if (item.type === 'additional-text') {
          const textItem = item.data as unknown as AdditionalTextItem;
          if (!textItem) return null;
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
              onTextChange={(val) =>
                handlers.handleAdditionalTextChange(textItem.id, { text: val })
              }
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
}

const MemoizedCanvasRenderLayer = memo(CanvasRenderLayerInner) as React.MemoExoticComponent<
  typeof CanvasRenderLayerInner
> & { displayName?: string };
MemoizedCanvasRenderLayer.displayName = 'CanvasRenderLayer';

export const CanvasRenderLayer = MemoizedCanvasRenderLayer as typeof CanvasRenderLayerInner;
