import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

// Source guard: the web app compiles its own copy of the editor's utilities and
// keyframes (apps/web index.css), so tailwind-input.css alone never reaches the
// app. These twins must not drift apart again.
const root = path.resolve(import.meta.dirname, '../../../..');
const read = (p: string) => readFileSync(path.join(root, p), 'utf8');

const twins = {
  editor: read('packages/canvas-editor/src/styles/tailwind-input.css'),
  web: read('apps/web/src/assets/styles/index.css'),
};

function elementEnter(css: string): string {
  const match = /@utility element-enter\s*\{([\s\S]*?)\n\}/.exec(css);
  if (!match) throw new Error('element-enter utility missing');
  return match[1].replace(/\s+/g, ' ').trim();
}

/** Formatting differs between the twins (one-line vs. prettier), so compare without whitespace. */
const squash = (text: string) => text.replace(/\s+/g, '');

/** `@keyframes name { … }` bodies (two brace levels) found in `css`, keyed by name. */
function keyframes(css: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const k of css.matchAll(/@keyframes ([\w-]+)\s*\{((?:[^{}]*\{[^{}]*\})*\s*)\}/g)) {
    found.set(k[1], squash(k[2]));
  }
  return found;
}

/** Keyframes redefined inside top-level `@media (prefers-reduced-motion: reduce)` blocks. */
function reducedMotionKeyframes(css: string): Map<string, string> {
  const found = new Map<string, string>();
  const re = /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/g;
  for (let m = re.exec(css); m; m = re.exec(css)) {
    for (const [name, body] of keyframes(m[1])) found.set(name, body);
  }
  return found;
}

describe('editor motion twins', () => {
  it('runs the element entrance with the plan timing in both files', () => {
    for (const css of Object.values(twins)) {
      const body = elementEnter(css);
      expect(body).toContain('elementFade 0.2s var(--editor-ease-out) both');
      expect(body).toContain('elementRise 0.25s var(--editor-ease-out) both');
      expect(body).toContain('animation-delay: calc(min(var(--i, 0), 7) * 30ms)');
    }
    expect(elementEnter(twins.web)).toBe(elementEnter(twins.editor));
  });

  it('ships the same reduced-motion keyframe variants in both files', () => {
    const editor = reducedMotionKeyframes(twins.editor);
    const web = reducedMotionKeyframes(twins.web);
    expect([...editor.keys()].sort()).toEqual([
      'flyout-enter',
      'slideDownFade',
      'subsectionFadeIn',
    ]);
    expect(Object.fromEntries(web)).toEqual(Object.fromEntries(editor));
    // Reduced motion keeps the fade and drops the movement.
    for (const body of editor.values()) expect(body).not.toContain('transform');
  });

  it('keeps the tile entrance keyframes identical', () => {
    const editor = keyframes(twins.editor);
    const web = keyframes(twins.web);
    for (const name of ['elementFade', 'elementRise']) {
      expect(editor.get(name), name).toBeTruthy();
      expect(web.get(name), name).toBe(editor.get(name));
    }
  });
});
