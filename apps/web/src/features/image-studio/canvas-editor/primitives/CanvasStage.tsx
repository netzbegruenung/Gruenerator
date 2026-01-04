/**
 * CanvasStage - Responsive Konva Stage wrapper
 * Handles responsive container sizing and provides ref methods for export
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
import type Konva from 'konva';
import type { ExportOptions, ExportFormat } from '@gruenerator/shared/canvas-editor';

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
    const stageRef = useRef<Konva.Stage>(null);
    const [containerSize, setContainerSize] = useState({ width: 400, height: 400 });

    const aspectRatio = width / height;
    const displayScale = containerSize.width / width;

    useEffect(() => {
      if (!responsive) {
        setContainerSize({ width, height });
        return;
      }

      const updateSize = () => {
        const maxW = Math.min(window.innerWidth - 48, maxContainerWidth);
        const maxH = maxContainerHeight ?? window.innerHeight - 200;

        let containerW = maxW;
        let containerH = containerW / aspectRatio;

        if (containerH > maxH) {
          containerH = maxH;
          containerW = containerH * aspectRatio;
        }

        setContainerSize({
          width: Math.round(containerW),
          height: Math.round(containerH),
        });
      };

      updateSize();
      window.addEventListener('resize', updateSize);
      return () => window.removeEventListener('resize', updateSize);
    }, [responsive, width, height, aspectRatio, maxContainerWidth, maxContainerHeight]);

    const toDataURL = useCallback(
      (options: Partial<ExportOptions> = {}): string | undefined => {
        const stage = stageRef.current;
        if (!stage) return undefined;

        const format = options.format || 'png';
        const mimeType: string = `image/${format}`;

        return stage.toDataURL({
          pixelRatio: options.pixelRatio ?? width / containerSize.width,
          mimeType: mimeType as 'image/png' | 'image/jpeg',
          quality: options.quality,
        });
      },
      [width, containerSize.width]
    );

    useImperativeHandle(
      ref,
      () => ({
        getStage: () => stageRef.current,
        toDataURL,
        getContainerSize: () => containerSize,
        getDisplayScale: () => displayScale,
      }),
      [toDataURL, containerSize, displayScale]
    );

    return (
      <div
        className={className}
        style={{
          width: containerSize.width,
          height: containerSize.height,
          ...style,
        }}
      >
        <Stage
          ref={stageRef}
          width={containerSize.width}
          height={containerSize.height}
          scale={{ x: displayScale, y: displayScale }}
          onMouseDown={onStageClick}
          onTouchStart={onStageClick}
        >
          <Layer>{children}</Layer>
        </Stage>
      </div>
    );
  }
);

CanvasStage.displayName = 'CanvasStage';
