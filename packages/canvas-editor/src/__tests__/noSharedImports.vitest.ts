import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * The editor's production code does not import @gruenerator/shared (ggraphic
 * plan, phase 1 step 4). What it used to read from there is either its own now
 * (`src/types/editorTypes.ts`, `src/utils/photoCredit.ts`), lives in
 * @gruenerator/contracts, or comes from the host through `CanvasEditorServices`
 * (`src/hostServices.ts`). Tests may still use shared to wire the real
 * implementations in.
 *
 * `ALLOWED` lists the files that may still import it. It may only shrink, and
 * it is exact both ways: a new importer is red, and so is an entry that no
 * longer imports.
 */
const ALLOWED: readonly string[] = [];

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Static imports and re-exports (`from '…'`), side-effect imports and dynamic import().
const SHARED_IMPORT =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"]@gruenerator\/shared(?:\/[^'"]*)?['"]/;

function productionFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : productionFiles(full);
    return /\.tsx?$/.test(entry.name) && !/\.(vitest|test|spec)\.tsx?$/.test(entry.name)
      ? [full]
      : [];
  });
}

describe('no @gruenerator/shared in canvas-editor production code', () => {
  it('the pattern sees every import form and ignores prose', () => {
    expect(SHARED_IMPORT.test(`import { a } from '@gruenerator/shared';`)).toBe(true);
    expect(SHARED_IMPORT.test(`import type { A } from "@gruenerator/shared/media-library";`)).toBe(
      true
    );
    expect(SHARED_IMPORT.test(`export { a } from '@gruenerator/shared/stickers';`)).toBe(true);
    expect(SHARED_IMPORT.test(`const m = await import('@gruenerator/shared/share');`)).toBe(true);
    expect(SHARED_IMPORT.test(`import '@gruenerator/shared/styles';`)).toBe(true);
    expect(SHARED_IMPORT.test(`// moved from @gruenerator/shared/canvas-editor`)).toBe(false);
    expect(SHARED_IMPORT.test(`import { a } from '@gruenerator/shared-ui';`)).toBe(false);
  });

  it('only the allowlisted files import it, and every allowlisted file still does', () => {
    const importers = productionFiles(SRC)
      .filter((file) => SHARED_IMPORT.test(readFileSync(file, 'utf8')))
      .map((file) => path.relative(SRC, file).split(path.sep).join('/'))
      .sort();
    expect(importers).toEqual([...ALLOWED].sort());
  });
});
