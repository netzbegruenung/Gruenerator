import React, { memo, type ComponentProps } from 'react';
import { Group } from 'react-konva';

import { type GeometryReporter } from '../hooks/useGeometryReporter';
import { useIconSetsFor } from '../hooks/useIconSetsFor';
import { CanvasText } from '../primitives';
import { AssetPrimitive } from '../primitives/AssetPrimitive';
import { BalkenGroup } from '../primitives/BalkenGroup';
import { ChartPrimitive } from '../primitives/ChartPrimitive';
import { CircleBadge } from '../primitives/CircleBadge';
import { FramePrimitive } from '../primitives/FramePrimitive';
import { IconPrimitive } from '../primitives/IconPrimitive';
import { IllustrationPrimitive } from '../primitives/IllustrationPrimitive';
import { PillBadge } from '../primitives/PillBadge';
import { ShapePrimitive } from '../primitives/ShapePrimitive';
import { UserImagePrimitive } from '../primitives/UserImagePrimitive';
import { useCanvasStoreSelector, useIsElementSelected } from '../stores/CanvasStoreProvider';
import { getIconMapSync } from '../utils/canvasIcons';
import { CANVAS_ITEM_NAME } from '../utils/deepSelect';
import { resolveIconDef } from '../utils/iconInstances';
import { lockedIdsOf } from '../utils/layerLock';

import { CanvasItemLockContext } from './canvasItemLock';
import { GenericCanvasElement } from './GenericCanvasElement';
import { MultiSelectionTransformer } from './MultiSelectionTransformer';
import { RemoteSelectionOverlay, type RemoteSelector } from './RemoteSelectionOverlay';

import type { CanvasElementConfig, FullCanvasConfig, LayoutResult } from '../configs/types';
import type { BalkenInstance, CircleBadgeInstance } from '../primitives';
import type { AssetInstance } from '../utils/canvasAssets';
import type { CanvasItem } from '../utils/canvasLayerManager';
import type { FrameInstance } from '../utils/frameUtils';
import type { IllustrationInstance } from '../utils/illustrations/types';
import type { PillBadgeInstance } from '../utils/pillBadgeUtils';
import type { ShapeInstance } from '../utils/shapes';
import type { SnapLine, SnapTarget } from '../utils/snapping';
import type { UserImageInstance } from '../utils/userImageUtils';

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
  selectedIcons?: string[];
  iconStates?: Record<
    string,
    {
      x?: number;
      y?: number;
      scale?: number;
      rotation?: number;
      color?: string;
      opacity?: number;
      iconId?: string;
      flipX?: boolean;
      flipY?: boolean;
    }
  >;
}

/** Additional text element attributes */
interface AdditionalTextAttrs {
  text?: string;
  x?: number;
  y?: number;
  width?: number;
  scale?: number;
  rotation?: number;
}

interface CanvasRenderLayerProps<
  TState extends Record<string, unknown> = Record<string, unknown>,
  TActions = Record<string, unknown>,
> {
  sortedRenderList: CanvasItem[];
  /** Lässt sich die ganze Auswahl drehen? Siehe `MultiSelectionTransformer`. */
  canRotateSelection: () => boolean;
  config: FullCanvasConfig<TState, TActions>;
  state: TState;
  layout: LayoutResult;
  handlers: {
    handleElementSelect: (id: string) => void;
    handleTextChange: (id: string, text: string) => void;
    handleFontSizeChange: (id: string, size: number) => void;
    handleElementPositionChange: (id: string, x: number, y: number, w: number, h: number) => void;
    handleImageDragEnd: (id: string, x: number, y: number) => void;
    handleImageTransformEnd: (
      id: string,
      x: number,
      y: number,
      w: number,
      h: number,
      rotation: number
    ) => void;
    handleTemplateTransformEnd: (id: string, x: number, y: number, rotation: number) => void;
    handleBalkenSelect: (id: string) => void;
    handleBalkenDragEnd: (id: string, x: number, y: number) => void;
    handleBalkenTransformEnd: (
      id: string,
      x: number,
      y: number,
      scale: number,
      rotation: number
    ) => void;
    handleBalkenTextChange: (id: string, index: number, text: string) => void;
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
    handleCircleBadgeTextLineChange: (id: string, lineIndex: number, text: string) => void;
    handlePillBadgeSelect: (id: string) => void;
    handlePillBadgeTextChange: (id: string, text: string) => void;
    handlePillBadgeDragEnd: (id: string, x: number, y: number) => void;
    handlePillBadgeTransformEnd: (
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
    handleFrameChange: (id: string, newAttrs: Partial<FrameInstance>) => void;
    handleFrameImageUpload: (id: string, file: File, objectUrl: string) => void;
    handleUserImageDragEnd: (id: string, x: number, y: number) => void;
    handleUserImageCropEnd: (id: string, patch: Partial<UserImageInstance>) => void;
    handleUserImageTransformEnd: (
      id: string,
      x: number,
      y: number,
      width: number,
      height: number,
      rotation: number
    ) => void;
    handleChartDragEnd: (id: string, x: number, y: number) => void;
    handleChartTransformEnd: (
      id: string,
      x: number,
      y: number,
      scale: number,
      rotation: number
    ) => void;
  };
  getSnapTargets: (id: string) => SnapTarget[];
  /** Traegt gerenderte Geometrie in die Snap-Ziel-Liste ein. */
  registerGeometry: GeometryReporter;
  handleSnapChange: (h: boolean, v: boolean) => void;
  setSnapLines: (lines: SnapLine[]) => void;
  stageWidth: number;
  stageHeight: number;
  isFontAvailable?: boolean;
  /** elementId → remote collaborator currently selecting it (collab mode only). */
  remoteSelections?: ReadonlyMap<string, RemoteSelector>;
}

// Selectable wrapper factory: each wrapper subscribes to the store for its
// element's selected state, so only 2 elements re-render per click.
// Primitives keep their selected/isSelected prop for testability.
function createSelectableWrapper<P extends object>(
  Component: React.ComponentType<P>,
  propName: 'selected' | 'isSelected' = 'selected'
) {
  type WrapperProps = Omit<P, 'selected' | 'isSelected'> & { elementId: string };
  return memo(function SelectableWrapper({ elementId, ...rest }: WrapperProps) {
    const selected = useIsElementSelected(elementId);
    return <Component {...({ ...rest, [propName]: selected } as P)} />;
  });
}

const SelectableBalkenGroup = createSelectableWrapper(BalkenGroup);
const SelectableIconPrimitive = createSelectableWrapper(IconPrimitive);
const SelectableShapePrimitive = createSelectableWrapper(ShapePrimitive, 'isSelected');
const SelectableFramePrimitive = createSelectableWrapper(FramePrimitive, 'isSelected');
const SelectableIllustrationPrimitive = createSelectableWrapper(
  IllustrationPrimitive,
  'isSelected'
);
const SelectableAssetPrimitive = createSelectableWrapper(AssetPrimitive, 'isSelected');
const SelectableCircleBadge = createSelectableWrapper(CircleBadge);
const SelectablePillBadge = createSelectableWrapper(PillBadge);
const SelectableCanvasText = createSelectableWrapper(CanvasText);
const SelectableUserImagePrimitive = createSelectableWrapper(UserImagePrimitive, 'isSelected');
const SelectableChartPrimitive = createSelectableWrapper(ChartPrimitive, 'isSelected');

function CanvasRenderLayerInner<
  TState extends Record<string, unknown> = Record<string, unknown>,
  TActions = Record<string, unknown>,
>({
  sortedRenderList,
  canRotateSelection,
  config: _config,
  state,
  layout,
  handlers,
  getSnapTargets,
  registerGeometry,
  handleSnapChange,
  setSnapLines,
  stageWidth,
  stageHeight,
  isFontAvailable,
  remoteSelections,
}: CanvasRenderLayerProps<TState, TActions>) {
  const croppingElement = useCanvasStoreSelector((s) => s.croppingElement);
  const setCroppingElement = useCanvasStoreSelector((s) => s.setCroppingElement);
  const iconCarrier = state as TState & Partial<OptionalCanvasStateProperties>;
  useIconSetsFor(iconCarrier.selectedIcons, iconCarrier.iconStates);

  const renderCanvasItem = (item: CanvasItem) => {
    // Render Config Element
    if (item.type === 'element') {
      const elementConfig = item.data;
      return (
        <GenericCanvasElement
          key={elementConfig.id}
          config={elementConfig}
          state={state}
          layout={layout}
          onSelect={handlers.handleElementSelect}
          onTextChange={handlers.handleTextChange}
          onFontSizeChange={handlers.handleFontSizeChange}
          onPositionChange={handlers.handleElementPositionChange}
          onGeometryChange={registerGeometry}
          onImageDragEnd={handlers.handleImageDragEnd}
          onImageTransformEnd={handlers.handleImageTransformEnd}
          onTemplateTransformEnd={handlers.handleTemplateTransformEnd}
          onSnapChange={handleSnapChange}
          onSnapLinesChange={setSnapLines}
          stageWidth={stageWidth}
          stageHeight={stageHeight}
          getSnapTargets={getSnapTargets}
        />
      );
    }

    // Render Balken
    if (item.type === 'balken') {
      const balken = item.data;
      return (
        <SelectableBalkenGroup
          key={balken.id}
          elementId={balken.id}
          mode={balken.mode}
          colorSchemeId={balken.colorSchemeId}
          offset={balken.offset}
          scale={balken.scale}
          widthScale={balken.widthScale}
          texts={balken.texts}
          rotation={balken.rotation}
          barOffsets={balken.barOffsets}
          onSelect={() => handlers.handleBalkenSelect(balken.id)}
          onTextChange={(idx, txt) => handlers.handleBalkenTextChange(balken.id, idx, txt)}
          onDragEnd={(x, y) => handlers.handleBalkenDragEnd(balken.id, x, y)}
          onTransformEnd={(x, y, s, r) => handlers.handleBalkenTransformEnd(balken.id, x, y, s, r)}
          onSnapChange={handleSnapChange}
          onSnapLinesChange={(lines) => setSnapLines(lines as SnapLine[])}
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

      // Type-safe access to optional iconStates property
      const stateWithOptional = state as TState & Partial<OptionalCanvasStateProperties>;
      const iconState = stateWithOptional.iconStates?.[iconId];

      // `item.id` ist die INSTANZ-ID. Welches Katalog-Icon sie zeigt, steht in
      // `iconState.iconId`; fehlt es, ist die Instanz-ID selbst die Katalog-ID
      // (so liegen alle Dokumente von vor #3404 vor). Ohne diese Auflösung
      // findet jede Kopie mit frischer ID keine Definition und zeichnet nichts.
      const iconDef = resolveIconDef(iconId, stateWithOptional.iconStates, getIconMapSync());

      const x = iconState?.x ?? stageWidth / 2;
      const y = iconState?.y ?? stageHeight / 2;
      const scale = iconState?.scale ?? 1;
      const rotation = iconState?.rotation ?? 0;
      const color = iconState?.color ?? '#000000';

      if (!iconDef) return null;

      return (
        <SelectableIconPrimitive
          key={iconId}
          elementId={iconId}
          id={iconId}
          icon={iconDef.id}
          x={x}
          y={y}
          scale={scale}
          rotation={rotation}
          flipX={iconState?.flipX}
          flipY={iconState?.flipY}
          color={color}
          opacity={iconState?.opacity ?? 1}
          onSelect={() => handlers.handleElementSelect(iconId)}
          onDragEnd={(nx, ny) => handlers.handleIconDragEnd(iconId, nx, ny)}
          onTransformEnd={(nx, ny, ns, nr) =>
            handlers.handleIconTransformEnd(iconId, nx, ny, ns, nr)
          }
          stageWidth={stageWidth}
          stageHeight={stageHeight}
          getSnapTargets={getSnapTargets}
          onSnapChange={handleSnapChange}
          onSnapLinesChange={setSnapLines}
          onGeometryChange={registerGeometry}
        />
      );
    }

    // Render Shape
    if (item.type === 'shape') {
      const shape = item.data;
      return (
        <SelectableShapePrimitive
          key={shape.id}
          elementId={shape.id}
          shape={shape}
          onSelect={handlers.handleElementSelect}
          onChange={(attrs) => handlers.handleShapeChange(shape.id, attrs)}
          draggable={true}
        />
      );
    }

    // Render Frame
    if (item.type === 'frame') {
      const frame = item.data;
      return (
        <SelectableFramePrimitive
          key={frame.id}
          elementId={frame.id}
          frame={frame}
          onSelect={handlers.handleElementSelect}
          onChange={(attrs) => handlers.handleFrameChange(frame.id, attrs)}
          onImageUpload={handlers.handleFrameImageUpload}
          draggable={true}
        />
      );
    }

    // Render Illustration
    if (item.type === 'illustration') {
      const ill = item.data;
      return (
        <SelectableIllustrationPrimitive
          key={ill.id}
          elementId={ill.id}
          illustration={ill}
          onSelect={() => handlers.handleElementSelect(ill.id)}
          onDragEnd={(x: number, y: number) => handlers.handleIllustrationDragEnd(ill.id, x, y)}
          onTransformEnd={(x: number, y: number, scale: number, rotation: number) =>
            handlers.handleIllustrationTransformEnd(ill.id, x, y, scale, rotation)
          }
          onSnapChange={handleSnapChange}
          onSnapLinesChange={(lines) => setSnapLines(lines as SnapLine[])}
          getSnapTargets={getSnapTargets}
          stageWidth={stageWidth}
          stageHeight={stageHeight}
        />
      );
    }

    // Render Asset (decorative elements like sunflowers, arrows)
    if (item.type === 'asset') {
      const asset = item.data;
      return (
        <SelectableAssetPrimitive
          key={asset.id}
          elementId={asset.id}
          asset={asset}
          onSelect={() => handlers.handleElementSelect(asset.id)}
          onDragEnd={(x: number, y: number) => handlers.handleAssetDragEnd(asset.id, x, y)}
          onTransformEnd={(x: number, y: number, scale: number, rotation: number) =>
            handlers.handleAssetTransformEnd(asset.id, x, y, scale, rotation)
          }
          stageWidth={stageWidth}
          stageHeight={stageHeight}
          getSnapTargets={getSnapTargets}
          onSnapChange={handleSnapChange}
          onSnapLinesChange={setSnapLines}
          onGeometryChange={registerGeometry}
        />
      );
    }

    // Render Circle Badge (e.g., date circles)
    if (item.type === 'circle-badge') {
      const badge = item.data;
      return (
        <SelectableCircleBadge
          key={badge.id}
          elementId={badge.id}
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
          onSelect={() => handlers.handleCircleBadgeSelect(badge.id)}
          onDragEnd={(x, y) => handlers.handleCircleBadgeDragEnd(badge.id, x, y)}
          onTransformEnd={(x, y, s, r) =>
            handlers.handleCircleBadgeTransformEnd(badge.id, x, y, s, r)
          }
          onTextLineChange={(lineIndex, text) =>
            handlers.handleCircleBadgeTextLineChange(badge.id, lineIndex, text)
          }
          onSnapChange={handleSnapChange}
          onSnapLinesChange={(lines) => setSnapLines(lines as SnapLine[])}
          getSnapTargets={getSnapTargets}
          stageWidth={stageWidth}
          stageHeight={stageHeight}
        />
      );
    }

    // Render Pill Badge (e.g., "Wusstest du?" labels)
    if (item.type === 'pill-badge') {
      const pill = item.data;
      return (
        <SelectablePillBadge
          key={pill.id}
          elementId={pill.id}
          id={pill.id}
          text={pill.text}
          x={pill.x}
          y={pill.y}
          backgroundColor={pill.backgroundColor}
          textColor={pill.textColor}
          fontSize={pill.fontSize}
          fontFamily={pill.fontFamily}
          fontStyle={pill.fontStyle}
          rotation={pill.rotation}
          scale={pill.scale}
          opacity={pill.opacity ?? 1}
          paddingX={pill.paddingX}
          paddingY={pill.paddingY}
          cornerRadius={pill.cornerRadius}
          onSelect={() => handlers.handlePillBadgeSelect(pill.id)}
          onTextChange={(text) => handlers.handlePillBadgeTextChange(pill.id, text)}
          onDragEnd={(x, y) => handlers.handlePillBadgeDragEnd(pill.id, x, y)}
          onTransformEnd={(x, y, s, r) => handlers.handlePillBadgeTransformEnd(pill.id, x, y, s, r)}
          onSnapChange={handleSnapChange}
          onSnapLinesChange={(lines) => setSnapLines(lines as SnapLine[])}
          getSnapTargets={getSnapTargets}
          stageWidth={stageWidth}
          stageHeight={stageHeight}
          isFontAvailable={isFontAvailable}
        />
      );
    }

    // Render User Image
    if (item.type === 'user-image') {
      const userImage = item.data;
      return (
        <SelectableUserImagePrimitive
          key={userImage.id}
          elementId={userImage.id}
          userImage={userImage}
          onSelect={() => handlers.handleElementSelect(userImage.id)}
          onDragEnd={(x: number, y: number) => handlers.handleUserImageDragEnd(userImage.id, x, y)}
          onTransformEnd={(x: number, y: number, w: number, h: number, r: number) =>
            handlers.handleUserImageTransformEnd(userImage.id, x, y, w, h, r)
          }
          onCropEnd={(patch: Partial<UserImageInstance>) =>
            handlers.handleUserImageCropEnd(userImage.id, patch)
          }
          isCropping={croppingElement === userImage.id}
          onCroppingChange={(on: boolean) => setCroppingElement(on ? userImage.id : null)}
        />
      );
    }

    if (item.type === 'chart') {
      const chart = item.data;
      return (
        <SelectableChartPrimitive
          key={chart.id}
          elementId={chart.id}
          chart={chart}
          onSelect={() => handlers.handleElementSelect(chart.id)}
          onDragEnd={(x: number, y: number) => handlers.handleChartDragEnd(chart.id, x, y)}
          onTransformEnd={(x: number, y: number, s: number, r: number) =>
            handlers.handleChartTransformEnd(chart.id, x, y, s, r)
          }
        />
      );
    }

    // Render Additional Text
    if (item.type === 'additional-text') {
      const textItem = item.data;
      if (!textItem) return null;
      return (
        <SelectableCanvasText
          key={textItem.id}
          elementId={textItem.id}
          id={textItem.id}
          text={textItem.text}
          x={textItem.x}
          y={textItem.y}
          width={textItem.width}
          fontSize={textItem.fontSize}
          fontFamily={textItem.fontFamily}
          fontStyle={textItem.fontStyle || 'normal'}
          fill={textItem.fill}
          stroke={textItem.stroke}
          strokeWidth={textItem.strokeWidth}
          shadowColor={textItem.shadowColor}
          shadowBlur={textItem.shadowBlur}
          shadowOffsetX={textItem.shadowOffsetX}
          shadowOffsetY={textItem.shadowOffsetY}
          shadowOpacity={textItem.shadowOpacity}
          fillGradient={textItem.fillGradient}
          align={textItem.align ?? 'left'}
          lineHeight={textItem.lineHeight}
          accent={textItem.accent}
          marker={textItem.marker}
          opacity={textItem.opacity ?? 1}
          rotation={textItem.rotation || 0}
          scaleX={textItem.scale || 1}
          scaleY={textItem.scale || 1}
          draggable={true}
          onSelect={() => handlers.handleElementSelect(textItem.id)}
          onTextChange={(val) => handlers.handleAdditionalTextChange(textItem.id, { text: val })}
          onDragEnd={(x, y) => {
            handlers.handleAdditionalTextChange(textItem.id, { x, y });
          }}
          transformConfig={{ rotateEnabled: true }}
          onTransformEnd={(x, y, width, scaleX, _scaleY, rotation) => {
            handlers.handleAdditionalTextChange(textItem.id, {
              x,
              y,
              width,
              scale: scaleX,
              rotation,
            });
          }}
          editable={true}
          onSnapChange={handleSnapChange}
          onSnapLinesChange={setSnapLines}
          getSnapTargets={getSnapTargets}
          onGeometryChange={registerGeometry}
          stageWidth={stageWidth}
          stageHeight={stageHeight}
        />
      );
    }

    return null;
  };

  const lockedIds = new Set(lockedIdsOf(state));

  return (
    <>
      {sortedRenderList.map((item) => {
        const remote = remoteSelections?.get(item.id) ?? null;
        const rendered = renderCanvasItem(item);
        if (!rendered) return null;
        // Names the item for a ctrl/⌘-click that picks what lies beneath (useDeepSelect).
        return (
          <Group key={item.id} name={CANVAS_ITEM_NAME} canvasItemId={item.id}>
            <CanvasItemLockContext.Provider value={lockedIds.has(item.id)}>
              {remote ? (
                <RemoteSelectionOverlay selector={remote}>{rendered}</RemoteSelectionOverlay>
              ) : (
                rendered
              )}
            </CanvasItemLockContext.Provider>
          </Group>
        );
      })}
      <MultiSelectionTransformer renderKey={sortedRenderList} canRotate={canRotateSelection} />
    </>
  );
}

const MemoizedCanvasRenderLayer = memo(CanvasRenderLayerInner) as React.MemoExoticComponent<
  typeof CanvasRenderLayerInner
> & { displayName?: string };
MemoizedCanvasRenderLayer.displayName = 'CanvasRenderLayer';

export const CanvasRenderLayer = MemoizedCanvasRenderLayer as typeof CanvasRenderLayerInner;
