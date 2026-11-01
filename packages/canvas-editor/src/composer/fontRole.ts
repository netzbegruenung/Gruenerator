import {
  type ElementBind,
  type BrandFonts,
  type RequiredFontRole,
  resolveFontRole,
} from '@ggraphic/core';

/**
 * A text's font as the composer writes it: the family, and the brand role it
 * came from, so a later change of role knows which texts to move. `fontFamily`
 * stays what it always was; `bind` only remembers where it came from.
 */
export function brandFont(
  fonts: BrandFonts,
  role: RequiredFontRole
): { fontFamily: string; bind: ElementBind } {
  const fontFamily = resolveFontRole(fonts, role);
  return { fontFamily, bind: { fontFamily: { ref: `font.${role}`, value: fontFamily } } };
}
