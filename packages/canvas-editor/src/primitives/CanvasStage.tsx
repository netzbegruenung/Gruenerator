/**
 * CanvasStage - Responsive Konva Stage wrapper
 *
 * Renders a single responsive Konva stage for editing.
 * Uses pixelRatio compensation during export to achieve pixel-perfect exports
 * regardless of display scaling.
 */

import Konva from 'konva';
import {
  useRef,
  useState,
  useEffect,
  forwardRef,
  useImperativeHandle,
  useCallback,
  type ReactNode,
} from 'react';
import { Stage, Layer, Group, Rect } from 'react-konva';

import { CanvasTextEditorProvider } from '../components/CanvasTextOverlay';
import { useHoverOutline } from '../hooks/useHoverOutline';
import { withSelectionChromeHidden } from '../utils/captureStage';
import { cn } from '../utils/cn';
import { MOUSE_DRAG_DISTANCE, TOUCH_DRAG_DISTANCE } from '../utils/touchInput';

import type { ExportOptions } from '@gruenerator/shared/canvas-editor';

export interface CanvasStageProps {
  width: number;
  height: number;
  /**
   * Logical coordinate space used by layout calculators. Defaults to width/height (no scaling).
   * When different from width/height, children are wrapped in a Konva Group with the
   * appropriate scale so reference-space layouts render proportionally on a different
   * canvas size (e.g. 1080×1350 layouts on a 2480×3508 A4 flyer).
   */
  logicalWidth?: number;
  logicalHeight?: number;
  responsive?: boolean;
  maxContainerWidth?: number;
  maxContainerHeight?: number;
  onStageClick?: (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
  /**
   * Hit detection for the whole stage. `false` skips Konva's hit graph — it
   * keeps a second canvas per layer purely to answer "what is under the
   * pointer", which a render-once offscreen snapshot never asks. Defaults to
   * true; only the preview path turns it off.
   */
  listening?: boolean;
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * The stage region to hand Konva's `toDataURL` so the PNG is exactly the
 * format size times `pixelRatio`. Deriving the output from the display
 * container instead loses a row or two: the container rounds width and height
 * independently, while the export scale comes from the width alone (#4091).
 * Konva sizes the bitmap as `floor(region * ratio)`, so the region aims half
 * a device pixel past the target — float error can then never floor it short.
 */
export function stageExportRegion(
  width: number,
  height: number,
  displayScale: number,
  pixelRatio: number
): { width: number; height: number; pixelRatio: number } {
  const ratio = pixelRatio / displayScale;
  return {
    width: (Math.round(width * pixelRatio) + 0.5) / ratio,
    height: (Math.round(height * pixelRatio) + 0.5) / ratio,
    pixelRatio: ratio,
  };
}

// Elements select on press; a click that wobbles a pixel or two must stay a
// click instead of starting a drag (Konva's default threshold is 0).
Konva.dragDistance = MOUSE_DRAG_DISTANCE;

// A press that has not moved past the drag threshold yet is only dropped:
// `stopDrag` would fire a `dragend` without a `dragstart`.
// Acts on every stage: a pinch can span pages.
function cancelDrags() {
  for (const [key, elem] of [...Konva.DD._dragElements]) {
    if (elem.dragStatus !== 'dragging') {
      Konva.DD._dragElements.delete(key);
      continue;
    }
    elem.node.absolutePosition({
      x: elem.startPointerPos.x - elem.offset.x,
      y: elem.startPointerPos.y - elem.offset.y,
    });
    elem.node.stopDrag();
  }
}

// Taken when the first finger lands, before Konva starts a transform from an
// anchor; live text reflow changes width during the transform, so all attrs.
function snapshotTransformerNodes() {
  const snapshot = new Map<Konva.Node, Konva.NodeConfig>();
  for (const stage of Konva.stages) {
    for (const tr of stage.find<Konva.Transformer>('Transformer')) {
      for (const node of tr.nodes()) snapshot.set(node, { ...node.getAttrs() });
    }
  }
  return snapshot;
}

// Restoring first means the single `transformend` that `stopTransform` fires
// commits the untouched element, matching its `transformstart`.
function cancelTransforms(before: Map<Konva.Node, Konva.NodeConfig>) {
  for (const stage of Konva.stages) {
    for (const tr of stage.find<Konva.Transformer>('Transformer')) {
      if (!tr.isTransforming()) continue;
      for (const node of tr.nodes()) {
        const attrs = before.get(node);
        if (!attrs) continue;
        // An attr first set by the transform (e.g. scaleX) goes back to its default.
        for (const key of Object.keys(node.getAttrs())) {
          if (!(key in attrs)) node._setAttr(key, undefined);
        }
        node.setAttrs(attrs);
      }
      tr.stopTransform();
    }
  }
}

const exportMimeType = (options: Partial<ExportOptions>) =>
  `image/${options.format || 'png'}` as 'image/png' | 'image/jpeg' | 'image/webp';

export interface CanvasStageRef {
  getStage: () => Konva.Stage | null;
  toDataURL: (options?: Partial<ExportOptions>) => string | undefined;
  toDataURLAsync: (options?: Partial<ExportOptions>) => Promise<string | null>;
  getContainerSize: () => { width: number; height: number };
  getDisplayScale: () => number;
}

export const CanvasStage = forwardRef<CanvasStageRef, CanvasStageProps>(
  (
    {
      width,
      height,
      logicalWidth,
      logicalHeight,
      responsive = true,
      maxContainerWidth = 600,
      maxContainerHeight,
      onStageClick,
      listening = true,
      children,
      className,
      style,
    },
    ref
  ) => {
    const displayStageRef = useRef<Konva.Stage>(null);
    const containerDivRef = useRef<HTMLDivElement>(null);
    const [containerSize, setContainerSize] = useState({ width: 400, height: 400 });

    const aspectRatio = width / height;
    const displayScale = containerSize.width / width;

    useEffect(() => {
      if (!responsive) {
        setContainerSize({ width, height });
        return;
      }

      const updateSize = () => {
        // Use actual parent container width if available
        const actualContainerWidth = containerDivRef.current?.parentElement?.clientWidth;
        const maxW = actualContainerWidth
          ? Math.min(actualContainerWidth, maxContainerWidth)
          : Math.min(window.innerWidth - 48, maxContainerWidth);
        const maxH = maxContainerHeight ?? window.innerHeight - 120;

        let containerW = maxW;
        let containerH = containerW / aspectRatio;

        if (containerH > maxH) {
          containerH = maxH;
          containerW = containerH * aspectRatio;
        }

        const newSize = {
          width: Math.round(containerW),
          height: Math.round(containerH),
        };

        setContainerSize(newSize);
      };

      updateSize();

      // Use ResizeObserver for more accurate container size tracking
      const resizeObserver = new ResizeObserver(updateSize);
      if (containerDivRef.current?.parentElement) {
        resizeObserver.observe(containerDivRef.current.parentElement);
      }

      window.addEventListener('resize', updateSize);
      return () => {
        resizeObserver.disconnect();
        window.removeEventListener('resize', updateSize);
      };
    }, [responsive, width, height, aspectRatio, maxContainerWidth, maxContainerHeight]);

    // Renders `capture` against the export view of the stage: the export
    // region at the requested pixel ratio, selection chrome hidden and — for a
    // transparent export — the background hidden. Selection chrome is hidden
    // HERE rather than at the call sites: this is the single door every export
    // goes through (download, page thumbnails, auto-save snapshots, the
    // imperative ref handles). Leaving it to the caller is what let the
    // download bake the Transformer of the selected element into the PNG.
    const withExportView = useCallback(
      <T,>(
        options: Partial<ExportOptions>,
        capture: (stage: Konva.Stage, region: ReturnType<typeof stageExportRegion>) => T
      ): T | undefined => {
        const stage = displayStageRef.current;
        if (!stage) return undefined;

        const format = options.format || 'png';
        const region = stageExportRegion(width, height, displayScale, options.pixelRatio ?? 1);

        // includeBackground === false → transparent export: hide the background
        // node(s) for the capture, then restore. JPEG has no alpha, so the flag
        // is a no-op there (the DownloadSection UI only offers it for PNG/WebP).
        const hideBackground = options.includeBackground === false && format !== 'jpeg';
        const backgroundNodes = hideBackground
          ? stage.find('.canvas-background').filter((node) => node.visible())
          : [];

        const run = () => withSelectionChromeHidden(stage, () => capture(stage, region));

        if (backgroundNodes.length === 0) return run();
        backgroundNodes.forEach((node) => node.hide());
        stage.draw();
        try {
          return run();
        } finally {
          backgroundNodes.forEach((node) => node.show());
          stage.draw();
        }
      },
      [width, height, displayScale]
    );

    const toDataURL = useCallback(
      (options: Partial<ExportOptions> = {}): string | undefined =>
        withExportView(options, (stage, region) =>
          stage.toDataURL({
            x: 0,
            y: 0,
            ...region,
            mimeType: exportMimeType(options),
            quality: options.quality,
          })
        ),
      [withExportView]
    );

    // Same image as toDataURL, but only the scene render is synchronous: the
    // PNG encode (≈200 ms at pixelRatio 2) runs off the main thread via
    // canvas.toBlob, so a background capture no longer freezes the editor.
    const toDataURLAsync = useCallback(
      async (options: Partial<ExportOptions> = {}): Promise<string | null> => {
        const canvas = withExportView(options, (stage, region) =>
          stage.toCanvas({ x: 0, y: 0, ...region })
        );
        if (!canvas) return null;
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, exportMimeType(options), options.quality)
        );
        // Safari counts canvas memory against a cap until GC; free it now.
        canvas.width = 0;
        canvas.height = 0;
        if (!blob) return null;
        return await new Promise<string | null>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);
        });
      },
      [withExportView]
    );

    useHoverOutline(displayStageRef, listening);

    // Konva only has a global drag threshold, read on every move. Capture
    // phase, so it is set before any element's own press handler runs.
    // A second finger makes the gesture a pinch (useZoomGestures): its press
    // never reaches Konva, so it can't select what it lands on, and a drag or
    // resize the first finger started is put back and ended.
    useEffect(() => {
      const stage = displayStageRef.current;
      const container = stage?.container();
      if (!stage || !container) return;
      // Listening on the whole canvas region catches a second finger that lands
      // on another page or in the gutter; every stage registers it, which is
      // idempotent.
      const region = container.closest<HTMLElement>('.canvas-editor-layout__canvas') ?? container;
      let beforeTransform = new Map<Konva.Node, Konva.NodeConfig>();
      const useTouch = (e: TouchEvent) => {
        Konva.dragDistance = TOUCH_DRAG_DISTANCE;
        if (e.touches.length < 2) {
          beforeTransform = snapshotTransformerNodes();
          return;
        }
        // Deliberately hidden from bubble listeners too: a second finger is
        // never a tap or a sheet swipe, and the pinch itself runs on pointer
        // events.
        e.stopPropagation();
        cancelTransforms(beforeTransform);
        cancelDrags();
      };
      const useMouse = () => {
        Konva.dragDistance = MOUSE_DRAG_DISTANCE;
        beforeTransform = snapshotTransformerNodes();
      };
      region.addEventListener('touchstart', useTouch, true);
      container.addEventListener('mousedown', useMouse, true);
      return () => {
        region.removeEventListener('touchstart', useTouch, true);
        container.removeEventListener('mousedown', useMouse, true);
      };
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        getStage: () => displayStageRef.current,
        toDataURL,
        toDataURLAsync,
        getContainerSize: () => containerSize,
        getDisplayScale: () => displayScale,
      }),
      [toDataURL, toDataURLAsync, containerSize, displayScale]
    );

    return (
      // Der Text-Editor gehört ins DOM, nicht auf die Bühne: `react-konva`
      // hat einen eigenen Reconciler und löst ein Portal aus einem Knoten
      // heraus zu Konva-Knoten auf, statt zu DOM-Elementen. Der Provider
      // steht deshalb HIER, außerhalb von `<Stage>` — siehe
      // `components/CanvasTextOverlay.tsx`.
      <CanvasTextEditorProvider>
        {/* Display Stage - Visible, interactive, responsively scaled */}
        <div
          ref={containerDivRef}
          className={cn('canvas-stage-container relative', className)}
          style={{
            width: containerSize.width,
            height: containerSize.height,
            ...style,
          }}
        >
          <Stage
            ref={displayStageRef}
            width={containerSize.width}
            height={containerSize.height}
            scale={{ x: displayScale, y: displayScale }}
            listening={listening}
            onMouseDown={onStageClick}
            onTouchStart={onStageClick}
          >
            <Layer listening={listening}>
              {logicalWidth &&
              logicalHeight &&
              (logicalWidth !== width || logicalHeight !== height) ? (
                <>
                  {/* Solid-color backdrop for non-default formats. Sharepic
                      templates were designed with their own backgrounds (image
                      or color); for non-sharepic formats (Story, Präsentation,
                      Flyer, Plakat) we render a clean SAND base behind the
                      scaled design so it never sits on a transparent canvas. */}
                  <Rect x={0} y={0} width={width} height={height} fill="#f5f1e9" />
                  <Group scaleX={width / logicalWidth} scaleY={height / logicalHeight}>
                    {children}
                  </Group>
                </>
              ) : (
                children
              )}
            </Layer>
          </Stage>
        </div>
      </CanvasTextEditorProvider>
    );
  }
);

CanvasStage.displayName = 'CanvasStage';
