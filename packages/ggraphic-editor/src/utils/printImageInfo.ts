// SPDX-License-Identifier: MPL-2.0
import { type PrintImageInfo } from '../primitives/CanvasStage.js';

import type Konva from 'konva';

/** Config element id of the freeform background photo. */
export const BACKGROUND_IMAGE_NODE_ID = 'background-image';

/**
 * Konva's crop() getter always returns an object (cropWidth 0 when no crop is
 * set), so an uncropped image must fall back to the source's natural width.
 */
export function printImageInfo(node: Konva.Image, displayScale: number): PrintImageInfo | null {
  const source = node.image();
  if (!source) return null;
  const naturalWidthPx = node.cropWidth() || (source as HTMLImageElement).naturalWidth;
  const displayedWidthPx = (node.width() * Math.abs(node.getAbsoluteScale().x)) / displayScale;
  return { naturalWidthPx, displayedWidthPx };
}
