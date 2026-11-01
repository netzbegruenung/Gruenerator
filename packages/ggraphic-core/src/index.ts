// SPDX-License-Identifier: MPL-2.0
export { type BackgroundColorOption } from './brand/backgroundColorOption.js';
export { brandDefault } from './brand/brandDefault.js';
export {
  type BrandBackground,
  type BrandColors,
  type BrandEffects,
  type BrandFontFace,
  type BrandFonts,
  type BrandImage,
  type BrandPack,
  type BrandSwatch,
  type FontRole,
  type RequiredFontRole,
  resolveFontRole,
} from './brand/brandPack.js';
export {
  FONT_ROLES,
  bindFontRole,
  currentFontRole,
  fontRoleOptions,
  type FontRoleOption,
} from './brand/fontRoles.js';
export * from './model/index.js';
