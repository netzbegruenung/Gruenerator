import { type BrandFonts, type FontRole, resolveFontRole } from '@ggraphic/core';
import { expect } from 'vitest';

import { type ComposedSlide } from './composeSharepic';

const BRAND_ROLES = ['headline', 'body', 'quoteShort', 'quoteEmphasis'] as const;

/**
 * Every text and pill that sets a brand family also carries the role it came
 * from, and the role resolves to that very family. `except` names elements
 * that set a family by hand (the AI label), not from the brand.
 */
export function expectBrandFontsBound(
  slides: ComposedSlide[],
  fonts: BrandFonts,
  except: readonly string[] = []
): number {
  let bound = 0;
  for (const slide of slides) {
    for (const element of [...slide.additionalTexts, ...slide.pillBadgeInstances]) {
      const binding = element.bind?.fontFamily;
      if (binding) {
        const role = binding.ref.slice('font.'.length) as FontRole;
        expect(resolveFontRole(fonts, role), `${element.id} role`).toBe(element.fontFamily);
        expect(binding.value, `${element.id} value`).toBe(element.fontFamily);
        bound += 1;
      } else if (!except.includes(element.id)) {
        const family = BRAND_ROLES.find((role) => fonts[role] === element.fontFamily);
        expect(family, `${element.id} sets ${element.fontFamily} without a role`).toBeUndefined();
      }
    }
  }
  return bound;
}
