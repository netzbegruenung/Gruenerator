import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * The editor core reaches the sharepic composer's blocks and carousel chrome
 * only through the host's `CanvasEditorServices.blocks` and `.carousel`
 * (`src/hostServices.ts`); the block mechanics themselves (placing a block,
 * its element ids) live in the core, `src/blocks/` (ggraphic plan). apps/web
 * passes `grueneratorBlocks` and `grueneratorCarousel` from the composer.
 *
 * Production code outside `src/composer/` must not import `liftBlock`,
 * `carouselChrome`, `composeSharepic` or `composeTypes` from the composer.
 * The package barrel (`src/index.ts`, `export * from './composer'`) is the
 * public API, not a core import, and stays out of scope here. Tests may
 * import the composer to wire the real implementation in.
 *
 * `ALLOWED` lists the files that may still import them. It may only shrink,
 * and it is exact both ways: a new importer is red, and so is an entry that no
 * longer imports.
 */
const ALLOWED: readonly string[] = [
  // Grünerator template configs (sharepic colours, the block insert action, slide
  // layouts): they move with the template configs into the template registry.
  // utils/vorlagenRelevance.ts and configs/freeform_at_full.config.tsx belong to
  // that move too, but import other composer modules (chromeParts, sharepicThemes).
  'configs/freeform_full.config.tsx',
  'slides/slideLayouts.ts',
];

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Static imports and re-exports (`from '…'`), side-effect imports and dynamic import().
const SHAREPIC_IMPORT =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"](?:\.{1,2}\/)+composer\/(?:liftBlock|carouselChrome|composeSharepic|composeTypes)['"]/;

function productionFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : productionFiles(full);
    return /\.tsx?$/.test(entry.name) && !/\.(vitest|test|spec)\.tsx?$/.test(entry.name)
      ? [full]
      : [];
  });
}

describe('no sharepic composer imports in canvas-editor core code', () => {
  it('the pattern sees every import form and ignores prose', () => {
    expect(SHAREPIC_IMPORT.test(`import { a } from '../../composer/liftBlock';`)).toBe(true);
    expect(SHAREPIC_IMPORT.test(`import type { A } from "../composer/composeTypes";`)).toBe(true);
    expect(SHAREPIC_IMPORT.test(`export { a } from './composer/carouselChrome';`)).toBe(true);
    expect(SHAREPIC_IMPORT.test(`const m = await import('../composer/composeSharepic');`)).toBe(
      true
    );
    expect(SHAREPIC_IMPORT.test(`import '../composer/liftBlock';`)).toBe(true);
    expect(SHAREPIC_IMPORT.test(`// cut out by composer/liftBlock`)).toBe(false);
    expect(SHAREPIC_IMPORT.test(`import { a } from '../composer/chromeParts';`)).toBe(false);
    expect(SHAREPIC_IMPORT.test(`import { a } from '@ggraphic/editor/blocks/liftedBlock';`)).toBe(
      false
    );
  });

  it('only the allowlisted files import them, and every allowlisted file still does', () => {
    const importers = productionFiles(SRC)
      .map((file) => path.relative(SRC, file).split(path.sep).join('/'))
      .filter((rel) => !rel.startsWith('composer/'))
      .filter((rel) => SHAREPIC_IMPORT.test(readFileSync(path.join(SRC, rel), 'utf8')))
      .sort();
    expect(importers).toEqual([...ALLOWED].sort());
  });
});
