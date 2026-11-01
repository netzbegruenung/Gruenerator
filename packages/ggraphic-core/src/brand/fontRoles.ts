// SPDX-License-Identifier: MPL-2.0
import { type ElementBind } from '../model/bind.js';
import { type BrandFonts, type FontRole } from './brandPack.js';

/** The roles a person picks from, in picker order. */
export const FONT_ROLES = [
  'headline',
  'body',
  'quoteEmphasis',
  'quoteShort',
  'handwriting',
] as const satisfies readonly FontRole[];

export interface FontRoleOption {
  role: FontRole;
  /** The brand's family for the role, as the brand sets it. */
  family: string;
}

/** First family of a CSS font stack, without quotes. */
function firstFamily(fontFamily: string): string {
  return (fontFamily.split(',')[0] ?? '').trim().replace(/^['"]|['"]$/g, '');
}

/**
 * The roles a brand offers on a text, in `FONT_ROLES` order, each with the family it stands for.
 * A role whose family an earlier role already has is left out (the first role wins), and
 * `handwriting` appears only when the brand sets it: the same font twice under two names would
 * only confuse.
 */
export function fontRoleOptions(fonts: BrandFonts): FontRoleOption[] {
  const options: FontRoleOption[] = [];
  for (const role of FONT_ROLES) {
    const family = fonts[role];
    if (family === undefined || family.trim() === '') continue;
    if (options.some((o) => firstFamily(o.family) === firstFamily(family))) continue;
    options.push({ role, family });
  }
  return options;
}

/**
 * The offered role a text stands for: the one it is bound to, else the one whose family it
 * uses (a text from before roles existed); null for a family no offered role has.
 */
export function currentFontRole(
  text: { fontFamily: string; bind?: ElementBind },
  options: readonly FontRoleOption[]
): FontRole | null {
  const ref = text.bind?.fontFamily?.ref;
  const bound = options.find((o) => `font.${o.role}` === ref);
  if (bound) return bound.role;
  const family = firstFamily(text.fontFamily);
  if (family === '') return null;
  return options.find((o) => firstFamily(o.family) === family)?.role ?? null;
}

/** A text's font as a role writes it: the family and the binding to the role, set together. */
export function bindFontRole(
  fonts: BrandFonts,
  role: FontRole
): { fontFamily: string; bind: ElementBind } | null {
  const fontFamily = fonts[role];
  if (fontFamily === undefined || fontFamily.trim() === '') return null;
  return { fontFamily, bind: { fontFamily: { ref: `font.${role}`, value: fontFamily } } };
}
