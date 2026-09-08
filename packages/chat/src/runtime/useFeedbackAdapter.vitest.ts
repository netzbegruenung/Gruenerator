import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('..', import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry) && !/\.vitest\.tsx?$/.test(entry) ? [full] : [];
  });
}

/**
 * assistant-ui's `submitFeedback` throws "Feedback adapter not configured" when
 * the runtime has no feedback adapter, and AssistantMessage shows the thumbs
 * on every surface as soon as a trace id arrives. Each surface that builds a
 * local runtime must therefore register the shared adapter — the notebook
 * (d52ca1e3d2) and the editor sidebar (GlitchTip #572) were both missed once.
 */
describe('useFeedbackAdapter registration', () => {
  it('every local runtime in packages/chat registers the feedback adapter', () => {
    const missing = sourceFiles(SRC)
      .filter((file) => {
        const source = readFileSync(file, 'utf8');
        return source.includes('useLocalRuntime(') && !source.includes('useFeedbackAdapter()');
      })
      .map((file) => path.relative(SRC, file));
    expect(missing).toEqual([]);
  });
});
