// SPDX-License-Identifier: MPL-2.0
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
 * the event date circle) are still owned by that
 * template: spread this first, then override the derived key.
 *
 * `layerOrder` rides along because it is the z-order OF these collections and
 * nothing else — an id array that `buildSortedRenderList` lets outrank each
 * element's declared `order`. It used to be missing here, so every template
 * except the three-line template and `freeform` (which read it from the props by hand)
 * handed a user their shapes back in the default order after a reload (#3420).
 *
 * `lockedLayerIds` is the same kind of id array: which of these elements the
 * user locked. Copies and pastes get new ids, so they come out unlocked.
 *
 * `backgroundImageAdjustments` is the "Bearbeiten" look of the template's
 * background photo. It rides here for the same reason: one read-back for every
 * template, and the list doubles as the page's writer (pageElementStateKeys()).
 * `backgroundImageRotation` (Begradigen, Grad) is the same photo's straighten
 * angle and rides the same way; missing means never straightened.
 *
 * `templateRotations` is the turn of the template's own text and marks, keyed
 * by element config id. One record for every template, so no template needs a
 * rotation key of its own and the page writer syncs it like the rest.
 * `templateTextAligns` is the same for the alignment of the template's texts.
 */

import { fromHostKinds, hostElementKinds } from '@ggraphic/editor/utils/elementKinds';
import { isTextAlign, type TextAlign } from '@ggraphic/editor/utils/textAlign';

import type { IconState } from './baseTypes.js';
import type { AssetInstance } from '../../utils/canvasAssets.js';
import type { HostElementState } from '../../utils/canvasItem.js';
import type { AdditionalText } from '../types.js';
import type { ChartInstance } from '@ggraphic/editor/utils/chartTypes';
import type { CircleBadgeInstance } from '@ggraphic/editor/utils/circleBadgeUtils';
import type { FrameInstance } from '@ggraphic/editor/utils/frameUtils';
import type { IllustrationInstance } from '@ggraphic/editor/utils/illustrations/types';
import type { PillBadgeInstance } from '@ggraphic/editor/utils/pillBadgeUtils';
import type { ShapeInstance } from '@ggraphic/editor/utils/shapes';
import type { ImageAdjustments, UserImageInstance } from '@ggraphic/editor/utils/userImageUtils';

/** The carried collections; a host kind's list rides along under its `stateKey`. */
export interface CarriedInstanceState extends HostElementState {
  assetInstances: AssetInstance[];
  selectedIcons: string[];
  iconStates: Record<string, IconState>;
  shapeInstances: ShapeInstance[];
  illustrationInstances: IllustrationInstance[];
  additionalTexts: AdditionalText[];
  pillBadgeInstances: PillBadgeInstance[];
  circleBadgeInstances: CircleBadgeInstance[];
  frameInstances: FrameInstance[];
  chartInstances: ChartInstance[];
  userImageInstances: UserImageInstance[];
  layerOrder: string[];
  lockedLayerIds: string[];
  templateRotations: Record<string, number>;
  templateTextAligns: Record<string, TextAlign>;
  backgroundImageAdjustments?: ImageAdjustments;
  backgroundImageRotation?: number;
}

/**
 * The core's keys `carryInstanceState` reads. With the host kinds' lists:
 * `carriedInstanceKeys()`, which guards and re-seed logic read.
 */
export const CARRIED_INSTANCE_KEYS = [
  'assetInstances',
  'selectedIcons',
  'iconStates',
  'shapeInstances',
  'illustrationInstances',
  'additionalTexts',
  'pillBadgeInstances',
  'circleBadgeInstances',
  'frameInstances',
  'chartInstances',
  'userImageInstances',
  'layerOrder',
  'lockedLayerIds',
  'templateRotations',
  'templateTextAligns',
  'backgroundImageAdjustments',
  'backgroundImageRotation',
] as const;

/** Every key `carryInstanceState` reads: the core's, then each host kind's list. */
export const carriedInstanceKeys: () => readonly string[] = fromHostKinds((kinds) => [
  ...CARRIED_INSTANCE_KEYS,
  ...kinds.map((kind) => kind.stateKey),
]);

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
    frameInstances: list<FrameInstance>(props.frameInstances),
    chartInstances: list<ChartInstance>(props.chartInstances),
    userImageInstances: list<UserImageInstance>(props.userImageInstances),
    layerOrder: list<string>(props.layerOrder),
    lockedLayerIds: list<string>(props.lockedLayerIds),
    templateRotations: carryTemplateRotations(props),
    templateTextAligns: carryTemplateTextAligns(props),
    ...carryBackgroundAdjustments(props),
    ...carryBackgroundRotation(props),
    // Boundary: one list per host kind, under the key its type names.
    ...(Object.fromEntries(
      hostElementKinds().map((kind) => [kind.stateKey, list(props[kind.stateKey])])
    ) as HostElementState),
  };
}

/** The background photo's straighten angle, when the seed carries one; omitted otherwise. */
export function carryBackgroundRotation(
  props: Record<string, unknown>
): Pick<CarriedInstanceState, 'backgroundImageRotation'> {
  const value = props.backgroundImageRotation;
  return typeof value === 'number' && Number.isFinite(value)
    ? { backgroundImageRotation: value }
    : {};
}

/** The background photo's look, when the seed carries one; omitted otherwise. */
export function carryBackgroundAdjustments(
  props: Record<string, unknown>
): Pick<CarriedInstanceState, 'backgroundImageAdjustments'> {
  const value = props.backgroundImageAdjustments;
  return value && typeof value === 'object'
    ? { backgroundImageAdjustments: value as ImageAdjustments }
    : {};
}

/** The turn of each template element, keyed by element id; `{}` for anything else. */
export function carryTemplateRotations(props: Record<string, unknown>): Record<string, number> {
  const value = props.templateRotations;
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, number>)
    : {};
}

/** The chosen alignment of each template text, keyed by element id; unknown values are dropped. */
export function carryTemplateTextAligns(props: Record<string, unknown>): Record<string, TextAlign> {
  const value = props.templateTextAligns;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, align]) => isTextAlign(align)));
}
