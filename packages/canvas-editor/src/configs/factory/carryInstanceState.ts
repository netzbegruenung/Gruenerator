/**
 * Carries the element collections a user builds up on a canvas — added icons,
 * shapes, illustrations, texts, badges, frames, charts, uploaded images —
 * from a seed into a freshly built state.
 *
 * `createInitialState` is not only the mint seed. Card renders and the
 * remote-sync re-seed (`GenericCanvas.handleRemotePageState`) push the full
 * previous state back through it, so every collection a config hard-set to
 * `[]` was erased on the next chat edit.
 *
 * Collections a template derives from its own text fields (the slider pill,
 * the event date circle, the dreizeilen balken) are still owned by that
 * template: spread this first, then override the derived key.
 */

import type { IconState } from './baseTypes';
import type { BalkenInstance } from '../../utils/balkenUtils';
import type { AssetInstance } from '../../utils/canvasAssets';
import type { ChartInstance } from '../../utils/chartUtils';
import type { CircleBadgeInstance } from '../../utils/circleBadgeUtils';
import type { FrameInstance } from '../../utils/frameUtils';
import type { IllustrationInstance } from '../../utils/illustrations/types';
import type { PillBadgeInstance } from '../../utils/pillBadgeUtils';
import type { ShapeInstance } from '../../utils/shapes';
import type { UserImageInstance } from '../../utils/userImageUtils';
import type { AdditionalText } from '../types';

export interface CarriedInstanceState {
  assetInstances: AssetInstance[];
  selectedIcons: string[];
  iconStates: Record<string, IconState>;
  shapeInstances: ShapeInstance[];
  illustrationInstances: IllustrationInstance[];
  additionalTexts: AdditionalText[];
  pillBadgeInstances: PillBadgeInstance[];
  circleBadgeInstances: CircleBadgeInstance[];
  balkenInstances: BalkenInstance[];
  frameInstances: FrameInstance[];
  chartInstances: ChartInstance[];
  userImageInstances: UserImageInstance[];
}

/** Every key `carryInstanceState` reads, for guards and re-seed logic. */
export const CARRIED_INSTANCE_KEYS = [
  'assetInstances',
  'selectedIcons',
  'iconStates',
  'shapeInstances',
  'illustrationInstances',
  'additionalTexts',
  'pillBadgeInstances',
  'circleBadgeInstances',
  'balkenInstances',
  'frameInstances',
  'chartInstances',
  'userImageInstances',
] as const;

function list<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function carryInstanceState(props: Record<string, unknown>): CarriedInstanceState {
  return {
    assetInstances: list<AssetInstance>(props.assetInstances),
    selectedIcons: list<string>(props.selectedIcons),
    iconStates:
      props.iconStates && typeof props.iconStates === 'object'
        ? (props.iconStates as Record<string, IconState>)
        : {},
    shapeInstances: list<ShapeInstance>(props.shapeInstances),
    illustrationInstances: list<IllustrationInstance>(props.illustrationInstances),
    additionalTexts: list<AdditionalText>(props.additionalTexts),
    pillBadgeInstances: list<PillBadgeInstance>(props.pillBadgeInstances),
    circleBadgeInstances: list<CircleBadgeInstance>(props.circleBadgeInstances),
    balkenInstances: list<BalkenInstance>(props.balkenInstances),
    frameInstances: list<FrameInstance>(props.frameInstances),
    chartInstances: list<ChartInstance>(props.chartInstances),
    userImageInstances: list<UserImageInstance>(props.userImageInstances),
  };
}
