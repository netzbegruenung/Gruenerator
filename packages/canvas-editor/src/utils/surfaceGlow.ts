import { registeredBrands } from '@ggraphic/editor/brand/brandRegistry';

import type { BrandPack } from '@ggraphic/core';

let builtFor: readonly BrandPack[] | null = null;
let glows: ReadonlyMap<string, readonly string[]> = new Map();

/**
 * The radial glow a stored plane colour is drawn as, centre first — null when
 * it is drawn flat. Read from the registered brand packs' grounds
 * (`registerBrandPacks`). The stored value stays what
 * documents, descriptors and swatches carry; only the paint changes.
 */
export function surfaceGlow(color: string): readonly string[] | null {
  const packs = registeredBrands();
  if (packs !== builtFor) {
    // Built once per registration. A colour two grounds glow takes the later
    // one, as the table built from the packs did before it was read here.
    const next = new Map<string, readonly string[]>();
    for (const pack of packs) {
      for (const ground of pack.backgrounds) {
        if (ground.glow) next.set(ground.color.toLowerCase(), ground.glow);
      }
    }
    glows = next;
    builtFor = packs;
  }
  return glows.get(color.toLowerCase()) ?? null;
}
