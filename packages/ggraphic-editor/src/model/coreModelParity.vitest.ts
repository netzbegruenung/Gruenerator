// SPDX-License-Identifier: MPL-2.0
/**
 * The element data model lives in `@ggraphic/core`; the editor's old import
 * paths hand out the very same types and constants. The shapes are stored in
 * canvas documents, so a drift between the two would only surface on load.
 * Type parity is checked by `tsc` over this file, the constants at runtime.
 */
import * as core from '@ggraphic/core';
import { describe, expect, expectTypeOf, it } from 'vitest';

import * as canvasAssets from '../utils/canvasAssets';
import * as textAlign from '../utils/textAlign';

import type * as baseTypes from '../configs/factory/baseTypes';
import type * as configTypes from '../configs/types';
import type * as circleBadge from '../primitives/CircleBadge';
import type * as chartTypes from '../utils/chartTypes';
import type * as frameUtils from '../utils/frameUtils';
import type * as gradientFill from '../utils/gradientFill';
import type * as illustrations from '../utils/illustrations/types';
import type * as pillBadge from '../utils/pillBadgeUtils';
import type * as shapes from '../utils/shapes';
import type * as textUtils from '../utils/textUtils';
import type * as userImage from '../utils/userImageUtils';

describe('core element model parity', () => {
  it('hands out the same types under the old paths', () => {
    expectTypeOf<configTypes.AdditionalText>().toEqualTypeOf<core.AdditionalText>();
    expectTypeOf<textUtils.TextAccent>().toEqualTypeOf<core.TextAccent>();
    expectTypeOf<textUtils.TextMarker>().toEqualTypeOf<core.TextMarker>();
    expectTypeOf<textAlign.TextAlign>().toEqualTypeOf<core.TextAlign>();
    expectTypeOf<gradientFill.GradientFill>().toEqualTypeOf<core.GradientFill>();
    expectTypeOf<gradientFill.GradientStop>().toEqualTypeOf<core.GradientStop>();
    expectTypeOf<shapes.ShapeInstance>().toEqualTypeOf<core.ShapeInstance>();
    expectTypeOf<shapes.ShapeType>().toEqualTypeOf<core.ShapeType>();
    expectTypeOf<shapes.ShapeBlendMode>().toEqualTypeOf<core.ShapeBlendMode>();
    expectTypeOf<canvasAssets.AssetInstance>().toEqualTypeOf<core.AssetInstance>();
    expectTypeOf<chartTypes.ChartInstance>().toEqualTypeOf<core.ChartInstance>();
    expectTypeOf<chartTypes.ChartType>().toEqualTypeOf<core.ChartType>();
    expectTypeOf<chartTypes.ChartDataPoint>().toEqualTypeOf<core.ChartDataPoint>();
    expectTypeOf<chartTypes.ChartSeries>().toEqualTypeOf<core.ChartSeries>();
    expectTypeOf<chartTypes.ChartLegendPosition>().toEqualTypeOf<core.ChartLegendPosition>();
    expectTypeOf<circleBadge.CircleBadgeInstance>().toEqualTypeOf<core.CircleBadgeInstance>();
    expectTypeOf<circleBadge.CircleBadgeTextLine>().toEqualTypeOf<core.CircleBadgeTextLine>();
    expectTypeOf<pillBadge.PillBadgeInstance>().toEqualTypeOf<core.PillBadgeInstance>();
    expectTypeOf<pillBadge.PillBadgeFontStyle>().toEqualTypeOf<core.PillBadgeFontStyle>();
    expectTypeOf<userImage.UserImageInstance>().toEqualTypeOf<core.UserImageInstance>();
    expectTypeOf<userImage.ElementPlacement>().toEqualTypeOf<core.ElementPlacement>();
    expectTypeOf<frameUtils.FrameInstance>().toEqualTypeOf<core.FrameInstance>();
    expectTypeOf<frameUtils.FrameClipType>().toEqualTypeOf<core.FrameClipType>();
    expectTypeOf<frameUtils.FrameCategory>().toEqualTypeOf<core.FrameCategory>();
    expectTypeOf<illustrations.IllustrationInstance>().toEqualTypeOf<core.IllustrationInstance>();
    expectTypeOf<illustrations.KawaiiInstance>().toEqualTypeOf<core.KawaiiInstance>();
    expectTypeOf<illustrations.SvgInstance>().toEqualTypeOf<core.SvgInstance>();
    expectTypeOf<illustrations.KawaiiMood>().toEqualTypeOf<core.KawaiiMood>();
    expectTypeOf<illustrations.KawaiiIllustrationType>().toEqualTypeOf<core.KawaiiIllustrationType>();
    expectTypeOf<illustrations.SvgSource>().toEqualTypeOf<core.SvgSource>();
    expectTypeOf<baseTypes.IconState>().toEqualTypeOf<core.IconState>();
  });

  it('hands out the same constants, not copies', () => {
    expect(canvasAssets.ASSET_TARGET_SIZE).toBe(core.ASSET_TARGET_SIZE);
    expect(textAlign.TEXT_ALIGNS).toBe(core.TEXT_ALIGNS);
  });
});
