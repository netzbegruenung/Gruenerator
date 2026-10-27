import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * The editor core reaches print (the V.i.S.d.P. / Impressum line, the print
 * Vorlagen composer) only through the host's `CanvasEditorServices.print`
 * (`src/hostServices.ts`), so a host without it can mount the editor (ggraphic
 * plan). apps/web passes `grueneratorPrint` from the composer.
 *
 * Production code outside `src/composer/` must not import `composePrint`,
 * `printImpressum` or `printService` from the composer. The package barrel
 * (`src/index.ts`, `export * from './composer'`) is the public API, not a core
 * import, and stays out of scope here. Tests may import the composer to wire
 * the real implementation in.
 *
 * `ALLOWED` lists the files that may still import them. It may only shrink,
 * and it is exact both ways: a new importer is red, and so is an entry that no
 * longer imports.
 */
const ALLOWED: readonly string[] = [];

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Static imports and re-exports (`from '…'`), side-effect imports and dynamic import().
const PRINT_IMPORT =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"](?:\.{1,2}\/)+composer\/(?:composePrint|printImpressum|printService)['"]/;

function productionFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : productionFiles(full);
    return /\.tsx?$/.test(entry.name) && !/\.(vitest|test|spec)\.tsx?$/.test(entry.name)
      ? [full]
      : [];
  });
}

describe('no print composer imports in canvas-editor core code', () => {
  it('the pattern sees every import form and ignores prose', () => {
    expect(PRINT_IMPORT.test(`import { a } from '../../composer/composePrint';`)).toBe(true);
    expect(PRINT_IMPORT.test(`import type { A } from "../composer/printImpressum";`)).toBe(true);
    expect(PRINT_IMPORT.test(`export { a } from './composer/printService';`)).toBe(true);
    expect(PRINT_IMPORT.test(`const m = await import('../composer/composePrint');`)).toBe(true);
    expect(PRINT_IMPORT.test(`import '../composer/printImpressum';`)).toBe(true);
    expect(PRINT_IMPORT.test(`// composes through composer/composePrint`)).toBe(false);
    expect(PRINT_IMPORT.test(`import { a } from '../composer/composeSharepic';`)).toBe(false);
  });

  it('only the allowlisted files import them, and every allowlisted file still does', () => {
    const importers = productionFiles(SRC)
      .map((file) => path.relative(SRC, file).split(path.sep).join('/'))
      .filter((rel) => !rel.startsWith('composer/'))
      .filter((rel) => PRINT_IMPORT.test(readFileSync(path.join(SRC, rel), 'utf8')))
      .sort();
    expect(importers).toEqual([...ALLOWED].sort());
  });
});
