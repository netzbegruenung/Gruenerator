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

function reducedMotionKeyframes(css: string): string[] {
  const names: string[] = [];
  const re = /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/g;
  for (let m = re.exec(css); m; m = re.exec(css)) {
    for (const k of m[1].matchAll(/@keyframes ([\w-]+)/g)) names.push(k[1]);
  }
  return names.sort();
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
    const expected = ['flyout-enter', 'slideDownFade', 'subsectionFadeIn'];
    expect(reducedMotionKeyframes(twins.editor)).toEqual(expected);
    expect(reducedMotionKeyframes(twins.web)).toEqual(expected);
  });
});
