import { type Bindings, type BrandFontRole, type BrandFonts } from '@ggraphic/core';

/**
 * The roles the composer sets text in. ggraphic's `BrandFontRole` also has
 * `serif` and `condensed`, which are optional in a pack; the composer only
 * ever asks for the four a pack always declares. A fixed family such as the GJ
 * handwriting is no role: it is written unbound.
 */
export type RequiredFontRole = Exclude<BrandFontRole, 'serif' | 'condensed'>;

/** The pack's family for a role (what `resolveRef('font.<role>', brand, null)` answers for these). */
export function resolveFontRole(fonts: BrandFonts, role: RequiredFontRole): string {
  return fonts[role];
}

/**
 * A text's font as the composer writes it: the family, and the brand role it
 * came from, so a later change of role knows which texts to move. `fontFamily`
 * stays what it always was; `bind` only remembers where it came from.
 */
export function brandFont(
  fonts: BrandFonts,
  role: RequiredFontRole
): { fontFamily: string; bind: Bindings } {
  const fontFamily = resolveFontRole(fonts, role);
  return { fontFamily, bind: { fontFamily: { ref: `font.${role}`, value: fontFamily } } };
}
