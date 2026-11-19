import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

function listFiles(dir: URL, pattern: RegExp): string[] {
  const root = fileURLToPath(dir);
  const walk = (current: string): string[] =>
    readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
      const path = join(current, entry.name);
      if (entry.isDirectory()) return walk(path);
      return pattern.test(entry.name) ? [path] : [];
    });
  return walk(root);
}

describe('sites-design sources', () => {
  const files = listFiles(new URL('.', import.meta.url), /\.(ts|tsx)$/);

  it('every relative import in src ends in .js', () => {
    const offenders = files
      .flatMap((file) =>
        [...readFileSync(file, 'utf8').matchAll(/from '(\.{1,2}\/[^']+)'/g)].map(
          (m) => `${file}: ${m[1]}`
        )
      )
      .filter((line) => !line.endsWith('.js'));
    expect(offenders).toEqual([]);
  });

  it('nothing in src imports the removed libraries', () => {
    const hits = files.filter(
      (file) =>
        file !== fileURLToPath(import.meta.url) &&
        /embla-carousel|class-variance-authority|tailwind-merge|from 'clsx'/.test(
          readFileSync(file, 'utf8')
        )
    );
    expect(hits).toEqual([]);
  });
});
