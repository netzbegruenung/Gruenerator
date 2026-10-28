// SPDX-License-Identifier: MPL-2.0
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

// Source guard: `var(--editor-x)` with no declaration is silently invalid — the
// property falls back to its initial value and nothing fails. The stylesheet is
// the only place a standalone host gets the tokens from, so every token the
// core reads needs a neutral default there.
const SRC = path.resolve(import.meta.dirname, '..');
const STYLESHEET = path.join(SRC, 'styles/editor.css');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx|css)$/.test(name) && !/\.vitest\.tsx?$/.test(name) ? [full] : [];
  });
}

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Blocks `selector { declarations }` of the stylesheet (nested @media bodies included). */
function blocks(css: string): { selector: string; body: string }[] {
  return [...stripComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selector: m[1].trim(),
    body: m[2],
  }));
}

const declaredIn = (body: string) => [...body.matchAll(/(--editor-[\w-]+)\s*:/g)].map((m) => m[1]);

describe('core editor stylesheet', () => {
  const css = readFileSync(STYLESHEET, 'utf8');

  it('declares a default for every --editor-* token the core reads', () => {
    const lightDefaults = new Set(
      blocks(css)
        .filter((b) => b.selector === ':where(:root)')
        .flatMap((b) => declaredIn(b.body))
    );
    const missing = new Set<string>();
    for (const file of sourceFiles(SRC)) {
      for (const m of stripComments(readFileSync(file, 'utf8')).matchAll(
        /var\(\s*(--editor-[\w-]+)/g
      )) {
        if (!lightDefaults.has(m[1])) missing.add(`${m[1]} (${path.relative(SRC, file)})`);
      }
    }
    expect([...missing].sort()).toEqual([]);
  });

  it('keeps every token default at specificity 0 so host values always win', () => {
    const loud = blocks(css).filter(
      (b) => declaredIn(b.body).length > 0 && !b.selector.startsWith(':where(')
    );
    expect(loud.map((b) => b.selector)).toEqual([]);
  });

  it('gives the dark blocks a subset of the light defaults, never a new token', () => {
    const all = blocks(css).filter((b) => b.selector.startsWith(':where('));
    const light = new Set(
      all.filter((b) => b.selector === ':where(:root)').flatMap((b) => declaredIn(b.body))
    );
    const extra = all
      .filter((b) => b.selector !== ':where(:root)')
      .flatMap((b) => declaredIn(b.body))
      .filter((token) => !light.has(token));
    expect(extra).toEqual([]);
  });
});
