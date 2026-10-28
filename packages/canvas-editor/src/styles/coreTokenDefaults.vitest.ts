import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

// Source guard. canvas-editor.css imports only the core's editor.css, never
// tokens.css: the Grünerator's variables.css must declare every --editor-*
// token the core reads, or the property silently turns invalid.
const root = path.resolve(import.meta.dirname, '../../../..');
const read = (p: string) => readFileSync(path.join(root, p), 'utf8');

const tokens = (css: string) =>
  new Set([...css.matchAll(/(--editor-[\w-]+)\s*:/g)].map((m) => m[1]));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx|css)$/.test(name) && !/\.vitest\.tsx?$/.test(name) ? [full] : [];
  });
}

describe('core stylesheet token defaults', () => {
  const ours = tokens(read('packages/canvas-editor/src/styles/variables.css'));

  it('has a core default for every --editor-* token this package declares', () => {
    const core = tokens(read('packages/ggraphic-editor/src/styles/tokens.css'));
    expect([...ours].filter((t) => !core.has(t)).sort()).toEqual([]);
  });

  it('declares every --editor-* token the core reads in variables.css', () => {
    const coreSrc = path.join(root, 'packages/ggraphic-editor/src');
    const missing = new Set<string>();
    for (const file of sourceFiles(coreSrc)) {
      const text = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      for (const m of text.matchAll(/var\(\s*(--editor-[\w-]+)/g)) {
        if (!ours.has(m[1])) missing.add(m[1]);
      }
    }
    expect([...missing].sort()).toEqual([]);
  });
});
