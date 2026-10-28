// SPDX-License-Identifier: MPL-2.0
import React, { memo, type ComponentProps } from 'react';
import { Group } from 'react-konva';

import { CanvasItemLockContext } from '@ggraphic/editor/components/canvasItemLock';
import { MultiSelectionTransformer } from '@ggraphic/editor/components/MultiSelectionTransformer';
import {
  RemoteSelectionOverlay,
  type RemoteSelector,
} from '@ggraphic/editor/components/RemoteSelectionOverlay';
import { type GeometryReporter } from '@ggraphic/editor/hooks/useGeometryReporter';
import { useCanvasStoreSelector } from '@ggraphic/editor/stores/CanvasStoreProvider';
import { CANVAS_ITEM_NAME } from '@ggraphic/editor/utils/deepSelect';

import { useIconSetsFor } from '../hooks/useIconSetsFor.js';
import { lockedIdsOf } from '../utils/layerLock.js';

import { GenericCanvasElement } from './GenericCanvasElement.js';
import {
  renderKindItem,
  type CanvasRenderHandlers,
  type OptionalCanvasStateProperties,
} from './kindRenderers.js';

import type { CanvasElementConfig, FullCanvasConfig, LayoutResult } from '../configs/types.js';
import type { CanvasItem } from '../utils/canvasLayerManager.js';
import type { SnapLine, SnapTarget } from '@ggraphic/editor/utils/snapping';

/**
 * CanvasRenderLayer - Renders all canvas elements in layer order
 *
 * Maps over sortedRenderList and renders the appropriate component
 * for each item type (element, icon, shape, illustration, text, host kinds).
 */

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
  handlers: CanvasRenderHandlers;
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
  const cropAspect = useCanvasStoreSelector((s) => s.cropAspect);
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

    return renderKindItem(item, {
      state,
      handlers,
      getSnapTargets,
      registerGeometry,
      handleSnapChange,
      setSnapLines,
      stageWidth,
      stageHeight,
      isFontAvailable,
      croppingElement,
      setCroppingElement,
      cropAspect,
    });
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
      <MultiSelectionTransformer
        renderKey={sortedRenderList}
        canRotate={canRotateSelection}
        stageWidth={stageWidth}
        stageHeight={stageHeight}
      />
    </>
  );
}

const MemoizedCanvasRenderLayer = memo(CanvasRenderLayerInner) as React.MemoExoticComponent<
  typeof CanvasRenderLayerInner
> & { displayName?: string };
MemoizedCanvasRenderLayer.displayName = 'CanvasRenderLayer';

export const CanvasRenderLayer = MemoizedCanvasRenderLayer as typeof CanvasRenderLayerInner;
