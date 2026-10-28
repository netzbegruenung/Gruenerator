// SPDX-License-Identifier: MPL-2.0
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

// Source guard: `var(--x)` with no declaration is silently invalid — the
// property falls back to its initial value and nothing fails. The stylesheet is
// the only place a standalone host gets the tokens from, so every custom
// property the core reads needs a neutral default there, `--editor-*` or not.
const SRC = path.resolve(import.meta.dirname, '..');
const TOKENS = path.join(SRC, 'styles/tokens.css');
const RULES = path.join(SRC, 'styles/editor.css');

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

const declaredIn = (body: string) => [...body.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]);

// Custom properties the core reads but must not default: it writes them
// itself, at runtime or in its own rules, so a default would only shadow
// the real value or mask a missing writer.
const SET_BY_THE_CORE: Readonly<Record<string, string>> = {
  '--canvas-zoom': 'written on the pages container by CanvasEditorShell and useZoomGestures',
  '--canvas-sheet-scale': 'written by useMobileSheetFit',
  '--canvas-sheet-shift': 'written by useMobileSheetFit',
  '--canvas-total-scale': 'derived from the two above in editor.css',
  '--canvas-panel-width': 'written on <html> by SidebarPanel; every read carries a 0px fallback',
  '--sheet-rest-bottom': 'written on the mobile sheet by SidebarPanel',
  '--canvas-fade-start': 'registered with @property and set by the scroll-fade rules in editor.css',
  '--canvas-fade-end': 'registered with @property and set by the scroll-fade rules in editor.css',
  '--canvas-rte-list-indent': 'inline style of the rich-text overlay (CanvasTextOverlay)',
  '--canvas-rte-marker-fill': 'inline style of the rich-text overlay (CanvasTextOverlay)',
  '--canvas-rte-marker-color': 'inline style of the rich-text overlay (CanvasTextOverlay)',
  '--canvas-rte-accent-color': 'inline style of the rich-text overlay (CanvasTextOverlay)',
  '--canvas-rte-accent-font': 'inline style of the rich-text overlay (CanvasTextOverlay)',
  '--canvas-rte-accent-style': 'inline style of the rich-text overlay (CanvasTextOverlay)',
  '--canvas-rte-accent-weight': 'inline style of the rich-text overlay (CanvasTextOverlay)',
  '--mark-color': 'attribute of the accent mark (accentMark.ts)',
  '--mark-fill': 'attribute of the marker mark (markerMark.ts)',
  '--mark-ink': 'attribute of the marker mark (markerMark.ts)',
  '--marker-box': 'declared in the marker rule of editor.css',
  '--i': 'inline style of the Elemente tiles (ElementTile, CategoryCard)',
  '--enter-from': 'utility class on the Elemente cards (CategoryCard)',
  '--radix-select-trigger-width': 'set by Radix on the select content',
  '--radix-select-trigger-height': 'set by Radix on the select content',
};

const reads = (css: string) => [...css.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]);

describe('core editor stylesheet', () => {
  const css = readFileSync(TOKENS, 'utf8');

  // A host that declares the tokens itself imports editor.css alone; a token
  // declared there would override the host (unlayered beats layered).
  it('declares no --editor-* custom property in editor.css', () => {
    expect(
      declaredIn(stripComments(readFileSync(RULES, 'utf8'))).filter((n) =>
        n.startsWith('--editor-')
      )
    ).toEqual([]);
  });

  const lightDefaults = () =>
    new Set(
      blocks(css)
        .filter((b) => b.selector === ':where(:root)')
        .flatMap((b) => declaredIn(b.body))
    );

  const readsBySource = () => {
    const found = new Map<string, string>();
    for (const file of sourceFiles(SRC)) {
      for (const name of reads(stripComments(readFileSync(file, 'utf8')))) {
        found.set(name, found.get(name) ?? path.relative(SRC, file));
      }
    }
    return found;
  };

  it('declares a default for every custom property the core reads, bar the ones it sets itself', () => {
    const defaults = lightDefaults();
    const missing = [...readsBySource()]
      .filter(([name]) => !defaults.has(name) && !(name in SET_BY_THE_CORE))
      .map(([name, file]) => `${name} (${file})`);
    expect(missing.sort()).toEqual([]);
  });

  it('keeps the set-by-the-core list honest: each entry is read and has no default', () => {
    const read = readsBySource();
    const defaults = lightDefaults();
    const stale = Object.keys(SET_BY_THE_CORE).filter((n) => !read.has(n) || defaults.has(n));
    expect(stale).toEqual([]);
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

// The Tailwind entry for hosts on Tailwind v4: the core's classes need a
// theme mapping, two utilities and a variant that no stock Tailwind has.
describe('core tailwind entry', () => {
  const tw = () => stripComments(readFileSync(path.join(SRC, 'styles/tailwind.css'), 'utf8'));

  it('defines the utilities and the variant the core classes use', () => {
    const css = tw();
    expect(css).toMatch(/@utility touch-target\b/);
    expect(css).toMatch(/@utility element-enter\b/);
    expect(css).toMatch(/@custom-variant kbd\b/);
  });

  it('maps every --color-editor-* utility the core uses', () => {
    const mapped = new Set([...tw().matchAll(/(--color-editor-[\w-]+)\s*:/g)].map((m) => m[1]));
    const missing = new Set<string>();
    for (const file of sourceFiles(SRC)) {
      const text = stripComments(readFileSync(file, 'utf8'));
      for (const m of text.matchAll(
        /(?<![\w-])(?:bg|text|border|ring|fill|stroke|from|to|via|outline|divide|shadow|decoration|accent|caret)-(editor-[a-z-]+[a-z])/g
      )) {
        if (!mapped.has(`--color-${m[1]}`))
          missing.add(`--color-${m[1]} (${path.relative(SRC, file)})`);
      }
    }
    expect([...missing].sort()).toEqual([]);
  });
});
