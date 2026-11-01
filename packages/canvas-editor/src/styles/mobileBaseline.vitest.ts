import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { editorDist } from '../__tests__/editorDist';

// Source guard: these CSS rules are invisible to the type checker, and a
// dropped selector silently brings back 500 ms press fades or page bounce.
const root = path.resolve(import.meta.dirname, '../../../..');
const read = (p: string) => readFileSync(path.join(root, p), 'utf8');

// The neutral rules live in the core stylesheet; canvas-editor.css only imports it
// and re-colours the stage border.
const css = readFileSync(editorDist('styles/editor.css'), 'utf8');
const brandCss = read('packages/canvas-editor/src/canvas-editor.css');
const webVars = read('apps/web/src/assets/styles/common/variables.css');
const editorVars = read('packages/canvas-editor/src/styles/variables.css');

describe('canvas editor mobile baseline', () => {
  // apps/web loads global.css in `@layer legacy` (order: base, legacy,
  // components, utilities). Unlayered, the baseline also beat every utility
  // (duration-*, touch-none, select-text); in `components` it beats only the
  // legacy `button { transition: … 0.5s }`.
  it('puts the touch baseline in the components layer', () => {
    const layer = /@layer components\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
    expect(layer).toMatch(/\.canvas-editor-layout button[^{]*\{[^}]*transition-duration:\s*100ms/);
    expect(layer).toMatch(/touch-action:\s*manipulation/);
    expect(layer).toMatch(/html:has\(\.canvas-editor-layout\)/);
  });

  it('stops page overscroll only in the mobile layout', () => {
    // Desktop keeps trackpad swipe-back.
    expect(css).toMatch(
      /@media \(max-width: 899px\)\s*\{\s*html:has\(\.canvas-editor-layout\)[^{]*\{[^}]*overscroll-behavior:\s*none/
    );
  });

  it('scopes instant press feedback and touch rules to the editor', () => {
    expect(css).toMatch(/\.canvas-editor-layout button[^{]*\{[^}]*transition-duration:\s*100ms/);
    expect(css).toMatch(/touch-action:\s*manipulation/);
    expect(css).toMatch(/-webkit-touch-callout:\s*none/);
  });

  it('gates the page-wrapper hover border', () => {
    for (const sheet of [css, brandCss]) {
      expect(sheet).toMatch(
        /@media \(hover: hover\) and \(pointer: fine\)\s*\{[^@]*page-wrapper:hover/
      );
    }
  });

  it('declares the motion tokens in both variable files', () => {
    for (const file of [webVars, editorVars]) {
      expect(file).toContain('--editor-ease-out: cubic-bezier(0.23, 1, 0.32, 1)');
      expect(file).toContain('--editor-ease-drawer: cubic-bezier(0.32, 0.72, 0, 1)');
    }
  });
});
