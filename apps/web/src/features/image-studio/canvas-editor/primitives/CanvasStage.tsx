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
import { Stage, Layer } from 'react-konva';

import type { ExportOptions } from '@gruenerator/shared/canvas-editor';
import type Konva from 'konva';
import './CanvasStage.css';

export interface CanvasStageProps {
  width: number;
  height: number;
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
        const mimeType: string = `image/${format}`;

        // Compensate for display scaling: if stage is rendered at 0.5x scale,
        // we need 2x pixelRatio to get 1:1 output resolution
        const effectivePixelRatio = (options.pixelRatio ?? 1) / displayScale;

        return stage.toDataURL({
          pixelRatio: effectivePixelRatio,
          mimeType: mimeType as 'image/png' | 'image/jpeg',
          quality: options.quality,
        });
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
          className={`canvas-stage-container ${className || ''}`}
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
            <Layer>{children}</Layer>
          </Stage>
        </div>
      </>
    );
  }
);

CanvasStage.displayName = 'CanvasStage';
