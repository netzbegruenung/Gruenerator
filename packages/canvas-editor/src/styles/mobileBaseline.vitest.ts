import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

// Source guard: these CSS rules are invisible to the type checker, and a
// dropped selector silently brings back 500 ms press fades or page bounce.
const root = path.resolve(import.meta.dirname, '../../../..');
const read = (p: string) => readFileSync(path.join(root, p), 'utf8');

const css = read('packages/canvas-editor/src/canvas-editor.css');
const webVars = read('apps/web/src/assets/styles/common/variables.css');
const editorVars = read('packages/canvas-editor/src/styles/variables.css');

describe('canvas editor mobile baseline', () => {
  it('scopes instant press feedback and touch rules to the editor', () => {
    expect(css).toMatch(
      /html:has\(\.canvas-editor-layout\)[^{]*\{[^}]*overscroll-behavior:\s*none/
    );
    expect(css).toMatch(/\.canvas-editor-layout button[^{]*\{[^}]*transition-duration:\s*100ms/);
    expect(css).toMatch(/touch-action:\s*manipulation/);
    expect(css).toMatch(/-webkit-touch-callout:\s*none/);
  });

  it('gates the page-wrapper hover border', () => {
    expect(css).toMatch(
      /@media \(hover: hover\) and \(pointer: fine\)\s*\{[^@]*page-wrapper:hover/
    );
  });

  it('declares the motion tokens in both variable files', () => {
    for (const file of [webVars, editorVars]) {
      expect(file).toContain('--editor-ease-out: cubic-bezier(0.23, 1, 0.32, 1)');
      expect(file).toContain('--editor-ease-drawer: cubic-bezier(0.32, 0.72, 0, 1)');
    }
  });
});
