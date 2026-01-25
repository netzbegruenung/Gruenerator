/**
 * CanvasBackground - Non-interactive background layer
 * Supports solid colors, gradients, and background images
 */

import { useEffect, useState, memo } from 'react';
import { Rect, Image as KonvaImage } from 'react-konva';

export interface GradientStop {
  offset: number;
  color: string;
}

export interface GradientConfig {
  type: 'linear' | 'radial';
  colorStops: GradientStop[];
  start?: { x: number; y: number };
  end?: { x: number; y: number };
}

export interface CanvasBackgroundProps {
  width: number;
  height: number;
  color?: string;
  gradient?: GradientConfig;
  image?: string;
  opacity?: number;
}

function CanvasBackgroundInner({
  width,
  height,
  color = '#ffffff',
  gradient,
  image,
  opacity = 1,
}: CanvasBackgroundProps) {
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!image) {
      setBgImage(null);
      return;
    }

    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => setBgImage(img);
    img.onerror = () => setBgImage(null);
    img.src = image;
  }, [image]);

  if (bgImage) {
    return (
      <KonvaImage
        image={bgImage}
        x={0}
        y={0}
        width={width}
        height={height}
        opacity={opacity}
        listening={false}
      />
    );
  }

  if (gradient?.type === 'linear') {
    const startPoint = gradient.start || { x: 0, y: 0 };
    const endPoint = gradient.end || { x: width, y: height };
    const colorStops = gradient.colorStops.flatMap((s) => [s.offset, s.color]);

    return (
      <Rect
        x={0}
        y={0}
        width={width}
        height={height}
        fillLinearGradientStartPoint={startPoint}
        fillLinearGradientEndPoint={endPoint}
        fillLinearGradientColorStops={colorStops}
        opacity={opacity}
        listening={false}
      />
    );
  }

  if (gradient?.type === 'radial') {
    const startPoint = gradient.start || { x: width / 2, y: height / 2 };
    const endPoint = gradient.end || { x: width / 2, y: height / 2 };
    const colorStops = gradient.colorStops.flatMap((s) => [s.offset, s.color]);

    return (
      <Rect
        x={0}
        y={0}
        width={width}
        height={height}
        fillRadialGradientStartPoint={startPoint}
        fillRadialGradientEndPoint={endPoint}
        fillRadialGradientStartRadius={0}
        fillRadialGradientEndRadius={Math.max(width, height) / 2}
        fillRadialGradientColorStops={colorStops}
        opacity={opacity}
        listening={false}
      />
    );
  }

  return (
    <Rect
      x={0}
      y={0}
      width={width}
      height={height}
      fill={color}
      opacity={opacity}
      listening={false}
    />
  );
}

// Memoize - background rarely changes during drag operations
export const CanvasBackground = memo(CanvasBackgroundInner);
