// SPDX-License-Identifier: MPL-2.0
export { type ByGround, type ComposerBrand } from '@ggraphic/core';
import { type ByGround } from '@ggraphic/core';

/** The value for a slide's ground; `onLight` and `onGrass` never hold together. */
export function onGround<T>(value: ByGround<T>, ground: { onLight: boolean; onGrass: boolean }): T {
  if (ground.onLight) return value.light;
  return ground.onGrass && value.grass !== undefined ? value.grass : value.dark;
}
