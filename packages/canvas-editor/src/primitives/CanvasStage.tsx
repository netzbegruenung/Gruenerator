/**
 * CanvasStage - Responsive Konva Stage wrapper
 *
 * Renders a single responsive Konva stage for editing.
 * Uses pixelRatio compensation during export to achieve pixel-perfect exports
 * regardless of display scaling.
 */

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

import type { ExportOptions } from '@gruenerator/shared/canvas-editor';
import type Konva from 'konva';

import { cn } from '../utils/cn';

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
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export interface CanvasStageRef {
  getStage: () => Konva.Stage | null;
  toDataURL: (options?: Partial<ExportOptions>) => string | undefined;
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

    const toDataURL = useCallback(
      (options: Partial<ExportOptions> = {}): string | undefined => {
        const stage = displayStageRef.current;
        if (!stage) return undefined;

        const format = options.format || 'png';
        const mimeType = `image/${format}` as 'image/png' | 'image/jpeg' | 'image/webp';

        // Compensate for display scaling: if stage is rendered at 0.5x scale,
        // we need 2x pixelRatio to get 1:1 output resolution
        const effectivePixelRatio = (options.pixelRatio ?? 1) / displayScale;

        // includeBackground === false → transparent export: hide the background
        // node(s) for the capture, then restore. JPEG has no alpha, so the flag
        // is a no-op there (the DownloadSection UI only offers it for PNG/WebP).
        const hideBackground = options.includeBackground === false && format !== 'jpeg';
        const backgroundNodes = hideBackground
          ? stage.find('.canvas-background').filter((node) => node.visible())
          : [];

        const capture = () =>
          stage.toDataURL({
            pixelRatio: effectivePixelRatio,
            mimeType,
            quality: options.quality,
          });

        if (backgroundNodes.length === 0) return capture();
        backgroundNodes.forEach((node) => node.hide());
        stage.draw();
        try {
          return capture();
        } finally {
          backgroundNodes.forEach((node) => node.show());
          stage.draw();
        }
      },
      [displayScale]
    );

    useImperativeHandle(
      ref,
      () => ({
        getStage: () => displayStageRef.current,
        toDataURL,
        getContainerSize: () => containerSize,
        getDisplayScale: () => displayScale,
      }),
      [toDataURL, containerSize, displayScale]
    );

    return (
      <>
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
            onMouseDown={onStageClick}
            onTouchStart={onStageClick}
          >
            <Layer>
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
      </>
    );
  }
);

CanvasStage.displayName = 'CanvasStage';
