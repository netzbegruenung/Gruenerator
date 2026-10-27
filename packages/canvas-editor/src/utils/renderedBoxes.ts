/**
 * Die gerenderte Box je Elementart, aus ihren Props — Grundlage für Snap und
 * Snap-Ziel (`useBoxSnap`). Kein Knoten, keine Messung.
 *
 * Formen nehmen ihr Nennmass (Breite × Höhe, mittig). Bei Vielecken und Sternen
 * ist die gezeichnete Fläche etwas kleiner als dieser Kasten; gesnappt wird
 * trotzdem am Kasten, weil die genaue Fläche nur eine Messung am Knoten kennt.
 */

import { ILLUSTRATION_TARGET_SIZE } from './motifSizes';
import { PATH_OFFSETS, PATH_VIEWBOX } from './shapeTransform';

import type { ChartInstance } from './chartTypes';
import type { FrameInstance } from './frameUtils';
import type { IllustrationInstance } from './illustrations/types';
import type { ShapeInstance } from './shapes';
import type { UserImageInstance } from './userImageUtils';
import type { RenderedBox } from '../hooks/useBoxSnap';

export function shapeBox(shape: ShapeInstance): RenderedBox {
  // Pfad-Formen sitzen auf ihrem `PATH_OFFSETS`-Punkt im 100er-Raster — bei
  // Wolke, Sprechblasen, Berg nicht in der Mitte. Gespiegelt wandert er mit.
  const offset = (PATH_OFFSETS as Partial<Record<ShapeInstance['type'], { x: number; y: number }>>)[
    shape.type
  ];
  const fx = offset ? offset.x / PATH_VIEWBOX : 0.5;
  const fy = offset ? offset.y / PATH_VIEWBOX : 0.5;
  return {
    x: shape.x,
    y: shape.y,
    width: shape.width * Math.abs(shape.scaleX),
    height: shape.height * Math.abs(shape.scaleY),
    rotation: shape.rotation,
    pivot: { x: shape.flipX ? 1 - fx : fx, y: shape.flipY ? 1 - fy : fy },
  };
}

export function frameBox(frame: FrameInstance): RenderedBox {
  return {
    x: frame.x,
    y: frame.y,
    width: frame.width * Math.abs(frame.scaleX),
    height: frame.height * Math.abs(frame.scaleY),
    rotation: frame.rotation,
    pivot: 'centre',
  };
}

export function userImageBox(image: UserImageInstance): RenderedBox {
  return {
    x: image.x,
    y: image.y,
    width: image.width * image.scale,
    height: image.height * image.scale,
    rotation: image.rotation,
    pivot: 'top-left',
  };
}

export function chartBox(chart: ChartInstance): RenderedBox {
  return {
    x: chart.x,
    y: chart.y,
    width: chart.width * chart.scale,
    height: chart.height * chart.scale,
    rotation: chart.rotation,
    pivot: 'top-left',
  };
}

export function illustrationBox(illustration: IllustrationInstance): RenderedBox {
  const size = ILLUSTRATION_TARGET_SIZE * illustration.scale;
  return {
    x: illustration.x,
    y: illustration.y,
    width: size,
    height: size,
    rotation: illustration.rotation,
    pivot: 'centre',
  };
}
