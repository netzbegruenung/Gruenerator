import type { AssetInstance } from './canvasAssets';
import type { ChartInstance } from './chartTypes';
import type { FrameInstance } from './frameUtils';
import type { IllustrationInstance } from './illustrations/types';
import type { PillBadgeInstance } from './pillBadgeUtils';
import type { ShapeInstance } from './shapes';
import type { UserImageInstance } from './userImageUtils';
import type { AdditionalText, CanvasElementConfig } from '../configs/types';
import type { BalkenInstance } from '../primitives/BalkenGroup';
import type { CircleBadgeInstance } from '../utils/circleBadgeUtils';

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
