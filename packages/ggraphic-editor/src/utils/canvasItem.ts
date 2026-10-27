// SPDX-License-Identifier: MPL-2.0
import type { AssetInstance } from './canvasAssets.js';
import type { AdditionalText, CanvasElementConfig } from '../configs/types.js';
import type { BalkenInstance } from '@ggraphic/editor/utils/balkenUtils';
import type { ChartInstance } from '@ggraphic/editor/utils/chartTypes';
import type { CircleBadgeInstance } from '@ggraphic/editor/utils/circleBadgeUtils';
import type { FrameInstance } from '@ggraphic/editor/utils/frameUtils';
import type { IllustrationInstance } from '@ggraphic/editor/utils/illustrations/types';
import type { PillBadgeInstance } from '@ggraphic/editor/utils/pillBadgeUtils';
import type { ShapeInstance } from '@ggraphic/editor/utils/shapes';
import type { UserImageInstance } from '@ggraphic/editor/utils/userImageUtils';

/**
 * One item of a page's layer list. Its own module so the element-kind
 * registry (`elementKinds.ts`) can name it without importing the layer
 * manager, which imports the registry.
 */
export type CanvasItem =
  | { id: string; type: 'element'; data: CanvasElementConfig }
  | { id: string; type: 'balken'; data: BalkenInstance }
  | { id: string; type: 'icon' }
  | { id: string; type: 'shape'; data: ShapeInstance }
  | { id: string; type: 'frame'; data: FrameInstance }
  | { id: string; type: 'additional-text'; data: AdditionalText }
  | { id: string; type: 'illustration'; data: IllustrationInstance }
  | { id: string; type: 'asset'; data: AssetInstance }
  | { id: string; type: 'circle-badge'; data: CircleBadgeInstance }
  | { id: string; type: 'pill-badge'; data: PillBadgeInstance }
  | { id: string; type: 'user-image'; data: UserImageInstance }
  | { id: string; type: 'chart'; data: ChartInstance };
