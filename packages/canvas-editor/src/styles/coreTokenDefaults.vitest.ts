import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

// Source guard: a --editor-* token added to this package's variables.css also
// needs a neutral default in the core stylesheet, or a standalone host loses it.
const root = path.resolve(import.meta.dirname, '../../../..');
const read = (p: string) => readFileSync(path.join(root, p), 'utf8');

const tokens = (css: string) =>
  new Set([...css.matchAll(/(--editor-[\w-]+)\s*:/g)].map((m) => m[1]));

describe('core stylesheet token defaults', () => {
  it('covers every --editor-* token this package declares', () => {
    const core = tokens(read('packages/ggraphic-editor/src/styles/editor.css'));
    const ours = tokens(read('packages/canvas-editor/src/styles/variables.css'));
    expect([...ours].filter((t) => !core.has(t)).sort()).toEqual([]);
  });
});
