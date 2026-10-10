/**
 * Chunking guard (#4383): Rolldown assigns modules to chunks by static
 * reachability, before unused barrel exports are tree-shaken. A module the
 * `@gruenerator/ui` barrel re-exports is therefore grouped with `cn` and every
 * other barrel member, and its static imports load wherever `cn` does. When
 * the barrel re-exported the recharts chart components, ~489 KB of recharts
 * loaded eagerly app-wide. Chart code must stay behind the `./chat-chart`
 * subpath, reached only via the dynamic import in LazyChatChart.
 */
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const uiSrc = path.resolve(import.meta.dirname, '../../../../ui/src');
const importRe =
  /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(?\s*['"]([^'"]+)['"]/g;

function resolveRelative(fromFile: string, spec: string): string | null {
  const base = path.resolve(path.dirname(fromFile), spec);
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
  ]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function staticImportersOf(pkg: string, entry: string): string[] {
  const seen = new Set<string>();
  const hits: string[] = [];
  const queue = [entry];
  while (queue.length) {
    const file = queue.shift()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const source = fs.readFileSync(file, 'utf8').replace(/import\s*\(\s*['"][^'"]+['"]\s*\)/g, '');
    for (const match of source.matchAll(importRe)) {
      const spec = match[1] ?? match[2];
      if (spec === pkg) hits.push(path.relative(uiSrc, file));
      else if (spec.startsWith('.')) {
        const resolved = resolveRelative(file, spec);
        if (resolved) queue.push(resolved);
      }
    }
  }
  return hits;
}

describe('recharts stays out of the @gruenerator/ui barrel', () => {
  it('no module statically reachable from the barrel imports recharts', () => {
    expect(staticImportersOf('recharts', path.join(uiSrc, 'index.ts'))).toEqual([]);
  });

  it('LazyChatChart loads the chart via the subpath, not the barrel', () => {
    const source = fs.readFileSync(path.resolve(import.meta.dirname, 'LazyChatChart.tsx'), 'utf8');
    expect(source).toContain("import('@gruenerator/ui/chat-chart')");
    expect(source).not.toContain("import('@gruenerator/ui')");
  });
});
