// SPDX-License-Identifier: MPL-2.0
/// <reference types="node" />
/**
 * The core is what a server can load: the element model has to stay free of
 * the editor, React, Konva and icon packs. A type import counts too — it pulls
 * the editor's sources into every build that compiles the core.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('..', import.meta.url));
const ALLOWED = (specifier: string) =>
  specifier.startsWith('./') || specifier.startsWith('../') || specifier === '@ggraphic/schema';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.vitest.ts') ? [path] : [];
  });
}

function foreignSpecifiers(): string[] {
  const found: string[] = [];
  for (const file of sourceFiles(SRC)) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/(?:import|export)[^'";]*?from\s*['"]([^'"]+)['"]/g)) {
      const specifier = match[1]!;
      if (!ALLOWED(specifier)) found.push(`${relative(SRC, file)}: ${specifier}`);
    }
  }
  return found;
}

describe('core element model', () => {
  it('imports only from itself and @ggraphic/schema', () => {
    expect(foreignSpecifiers()).toEqual([]);
  });

  it('exposes the element model', async () => {
    const core = await import('../index.js');
    expect(core.ASSET_TARGET_SIZE).toBe(150);
    expect(core.TEXT_ALIGNS).toEqual(['left', 'center', 'right']);
  });
});
