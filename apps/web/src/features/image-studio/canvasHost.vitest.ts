import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The canvas host data is registered by `canvasHost.ts` as a side effect, no
 * longer from the entry (#5891). A canvas module that renders without that
 * import shows a sharepic without stickers, logos or brand packs, and nothing
 * fails. This test reads the source: every file in apps/web/src that imports
 * the canvas stack at runtime must import canvasHost too.
 */
const SRC = join(__dirname, '../..');
const CANVAS_IMPORT =
  /import\s+(type\s+)?([^;]*?)from\s*['"](?:@ggraphic\/editor|@gruenerator\/canvas-editor)[^'"]*['"]/gs;
const HOST_IMPORT = /import\s+['"][./]+(?:[\w-]+\/)*canvasHost['"]/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((f) => /\.tsx?$/.test(f) && !/\.vitest\.tsx?$/.test(f))
    .map((f) => join(dir, f));
}

function importsCanvasAtRuntime(source: string): boolean {
  for (const m of source.matchAll(CANVAS_IMPORT)) {
    if (m[1]) continue;
    const names = (m[2] ?? '')
      .replace(/[{}]/g, '')
      .split(',')
      .map((n) => n.trim())
      .filter((n) => n && !n.startsWith('type '));
    if (names.length > 0) return true;
  }
  return false;
}

describe('canvas host registration', () => {
  const files = sourceFiles(SRC).filter((f) => !f.endsWith('canvasHost.ts'));
  const canvasFiles = files.filter((f) => importsCanvasAtRuntime(readFileSync(f, 'utf8')));

  it('finds the canvas entry points (guards the scan itself)', () => {
    expect(canvasFiles.length).toBeGreaterThan(10);
  });

  it('every runtime importer of the canvas stack imports canvasHost', () => {
    const missing = canvasFiles
      .filter((f) => !HOST_IMPORT.test(readFileSync(f, 'utf8')))
      .map((f) => relative(SRC, f));
    expect(missing).toEqual([]);
  });

  it('the entry does not import the canvas stack', () => {
    expect(canvasFiles.map((f) => relative(SRC, f))).not.toContain('index.tsx');
  });
});
