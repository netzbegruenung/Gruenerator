// SPDX-License-Identifier: MPL-2.0
import React, { memo } from 'react';

import { type GeometryReporter } from '@ggraphic/editor/hooks/useGeometryReporter';
import { ChartPrimitive } from '@ggraphic/editor/primitives/ChartPrimitive';
import { CircleBadge } from '@ggraphic/editor/primitives/CircleBadge';
import { FramePrimitive } from '@ggraphic/editor/primitives/FramePrimitive';
import { IconPrimitive } from '@ggraphic/editor/primitives/IconPrimitive';
import { PillBadge } from '@ggraphic/editor/primitives/PillBadge';
import { ShapePrimitive } from '@ggraphic/editor/primitives/ShapePrimitive';
import { UserImagePrimitive } from '@ggraphic/editor/primitives/UserImagePrimitive';
import { useIsElementSelected } from '@ggraphic/editor/stores/CanvasStoreProvider';
import { getIconMapSync } from '@ggraphic/editor/utils/canvasIcons';

import { AssetPrimitive } from '../primitives/AssetPrimitive.js';
import { IllustrationPrimitive } from '../primitives/IllustrationPrimitive.js';
import { CanvasText } from '../primitives/index.js';
import { resolveIconDef } from '../utils/iconInstances.js';

import type { OptionalCanvasActions } from '../hooks/useCanvasElementHandlers.js';
import type { HostElementKindName } from '../utils/canvasItem.js';
import type { CanvasItem } from '../utils/canvasLayerManager.js';
import type { CropAspectId } from '@ggraphic/editor/utils/cropAspect';
import type { FrameInstance } from '@ggraphic/editor/utils/frameUtils';
import type { ShapeInstance } from '@ggraphic/editor/utils/shapes';
import type { SnapLine, SnapTarget } from '@ggraphic/editor/utils/snapping';
import type { UserImageInstance } from '@ggraphic/editor/utils/userImageUtils';

type KindName = Exclude<CanvasItem['type'], 'element'>;

/**
 * Optional properties that may exist on canvas state for different element types
 */
export interface OptionalCanvasStateProperties {
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

export interface CanvasRenderHandlers {
  /** The config's actions, for the renderers of the host's kinds (`registerKindRenderers`). */
  actions: OptionalCanvasActions;
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
}

/** What a kind's renderer reads from the layer: its props plus the crop state of the store. */
export interface RenderCtx {
  state: Record<string, unknown>;
  handlers: CanvasRenderHandlers;
  getSnapTargets: (id: string) => SnapTarget[];
  registerGeometry: GeometryReporter;
  handleSnapChange: (h: boolean, v: boolean) => void;
  setSnapLines: (lines: SnapLine[]) => void;
  stageWidth: number;
  stageHeight: number;
  isFontAvailable?: boolean;
  croppingElement: string | null;
  setCroppingElement: (id: string | null) => void;
  cropAspect: CropAspectId;
}

// Selectable wrapper factory: each wrapper subscribes to the store for its
// element's selected state, so only 2 elements re-render per click.
// Primitives keep their selected/isSelected prop for testability.
export function createSelectableWrapper<P extends object>(
  Component: React.ComponentType<P>,
  propName: 'selected' | 'isSelected' = 'selected'
) {
  type WrapperProps = Omit<P, 'selected' | 'isSelected'> & { elementId: string };
  return memo(function SelectableWrapper({ elementId, ...rest }: WrapperProps) {
    const selected = useIsElementSelected(elementId);
    return <Component {...({ ...rest, [propName]: selected } as P)} />;
  });
}

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

/** How one kind is drawn: its item from the layer list, and the layer's context. */
export type KindRenderer<K extends KindName> = (
  item: Extract<CanvasItem, { type: K }>,
  ctx: RenderCtx
) => React.ReactNode;

type KindRenderers = {
  [K in Exclude<KindName, HostElementKindName>]: KindRenderer<K>;
};

/** The renderers a host supplies for its own kinds (`HostElementKinds`, `registerElementKind`). */
export type HostKindRenderers = { [K in HostElementKindName]?: KindRenderer<K> };

/**
 * A module-level registry, like the asset catalogue: offscreen renders draw
 * the layer list without a React context. Without a host, its kinds draw
 * nothing.
 */
let hostRenderers: HostKindRenderers = {};

/** The host's renderers, installed once at startup; replaces the ones before. */
export function registerKindRenderers(renderers: HostKindRenderers): void {
  hostRenderers = renderers;
}

/**
 * How each core element kind is drawn. Keyed by kind, so a kind added to
 * `ELEMENT_KINDS` does not compile until it has a renderer here; a host's
 * kinds are drawn by `registerKindRenderers`.
 */
export const KIND_RENDERERS: KindRenderers = {
  // Render Icon
  icon: (item, ctx) => {
    const {
      state,
      handlers,
      handleSnapChange,
      setSnapLines,
      getSnapTargets,
      registerGeometry,
      stageWidth,
      stageHeight,
    } = ctx;
    const iconId = item.id;

    // Type-safe access to optional iconStates property
    const stateWithOptional = state as Partial<OptionalCanvasStateProperties>;
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
        onTransformEnd={(nx, ny, ns, nr) => handlers.handleIconTransformEnd(iconId, nx, ny, ns, nr)}
        stageWidth={stageWidth}
        stageHeight={stageHeight}
        getSnapTargets={getSnapTargets}
        onSnapChange={handleSnapChange}
        onSnapLinesChange={setSnapLines}
        onGeometryChange={registerGeometry}
      />
    );
  },

  // Render Shape
  shape: (item, ctx) => {
    const {
      handlers,
      handleSnapChange,
      setSnapLines,
      getSnapTargets,
      registerGeometry,
      stageWidth,
      stageHeight,
    } = ctx;
    const shape = item.data;
    return (
      <SelectableShapePrimitive
        key={shape.id}
        elementId={shape.id}
        shape={shape}
        onSelect={handlers.handleElementSelect}
        onChange={(attrs) => handlers.handleShapeChange(shape.id, attrs)}
        draggable={true}
        stageWidth={stageWidth}
        stageHeight={stageHeight}
        getSnapTargets={getSnapTargets}
        onSnapChange={handleSnapChange}
        onSnapLinesChange={setSnapLines}
        onGeometryChange={registerGeometry}
      />
    );
  },

  // Render Frame
  frame: (item, ctx) => {
    const {
      handlers,
      handleSnapChange,
      setSnapLines,
      getSnapTargets,
      registerGeometry,
      stageWidth,
      stageHeight,
    } = ctx;
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
        stageWidth={stageWidth}
        stageHeight={stageHeight}
        getSnapTargets={getSnapTargets}
        onSnapChange={handleSnapChange}
        onSnapLinesChange={setSnapLines}
        onGeometryChange={registerGeometry}
      />
    );
  },

  // Render Illustration
  illustration: (item, ctx) => {
    const {
      handlers,
      handleSnapChange,
      setSnapLines,
      getSnapTargets,
      registerGeometry,
      stageWidth,
      stageHeight,
    } = ctx;
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
        stageWidth={stageWidth}
        stageHeight={stageHeight}
        getSnapTargets={getSnapTargets}
        onSnapChange={handleSnapChange}
        onSnapLinesChange={setSnapLines}
        onGeometryChange={registerGeometry}
      />
    );
  },

  // Render Asset (decorative elements like sunflowers, arrows)
  asset: (item, ctx) => {
    const {
      handlers,
      handleSnapChange,
      setSnapLines,
      getSnapTargets,
      registerGeometry,
      stageWidth,
      stageHeight,
    } = ctx;
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
  },

  // Render Circle Badge (e.g., date circles)
  'circle-badge': (item, ctx) => {
    const { handlers, handleSnapChange, setSnapLines, getSnapTargets, stageWidth, stageHeight } =
      ctx;
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
        outline={badge.outline}
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
  },

  // Render Pill Badge (e.g., "Wusstest du?" labels)
  'pill-badge': (item, ctx) => {
    const {
      handlers,
      handleSnapChange,
      setSnapLines,
      getSnapTargets,
      stageWidth,
      stageHeight,
      isFontAvailable,
    } = ctx;
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
  },

  // Render User Image
  'user-image': (item, ctx) => {
    const {
      handlers,
      handleSnapChange,
      setSnapLines,
      getSnapTargets,
      registerGeometry,
      stageWidth,
      stageHeight,
      croppingElement,
      setCroppingElement,
      cropAspect,
    } = ctx;
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
        cropAspect={croppingElement === userImage.id ? cropAspect : 'free'}
        onCroppingChange={(on: boolean) => setCroppingElement(on ? userImage.id : null)}
        stageWidth={stageWidth}
        stageHeight={stageHeight}
        getSnapTargets={getSnapTargets}
        onSnapChange={handleSnapChange}
        onSnapLinesChange={setSnapLines}
        onGeometryChange={registerGeometry}
      />
    );
  },

  chart: (item, ctx) => {
    const {
      handlers,
      handleSnapChange,
      setSnapLines,
      getSnapTargets,
      registerGeometry,
      stageWidth,
      stageHeight,
    } = ctx;
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
        stageWidth={stageWidth}
        stageHeight={stageHeight}
        getSnapTargets={getSnapTargets}
        onSnapChange={handleSnapChange}
        onSnapLinesChange={setSnapLines}
        onGeometryChange={registerGeometry}
      />
    );
  },

  // Render Additional Text
  'additional-text': (item, ctx) => {
    const {
      handlers,
      handleSnapChange,
      setSnapLines,
      getSnapTargets,
      registerGeometry,
      stageWidth,
      stageHeight,
    } = ctx;
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
  },
};

/** Draws one item of a kind through its table entry, or the host's renderer. */
export function renderKindItem(item: Exclude<CanvasItem, { type: 'element' }>, ctx: RenderCtx) {
  // The tables are keyed by `item.type`, so the entry takes exactly this item;
  // TypeScript cannot correlate the two through the lookup.
  const render = (
    item.type in KIND_RENDERERS
      ? KIND_RENDERERS[item.type as keyof KindRenderers]
      : hostRenderers[item.type as HostElementKindName]
  ) as ((item: CanvasItem, ctx: RenderCtx) => React.ReactNode) | undefined;
  return render ? render(item, ctx) : null;
}
