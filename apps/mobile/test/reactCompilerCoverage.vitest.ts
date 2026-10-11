import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { transformSync } from '@babel/core';
import reactCompiler from 'babel-plugin-react-compiler';
import { describe, expect, it } from 'vitest';

// Release builds run the React Compiler with `panicThreshold: 'NONE'`
// (babel-preset-expo), so a component it cannot handle ships unmemoized
// without a warning (#4419). This lists every function the compiler skips and
// pins the list as a snapshot: a new skip fails CI, and a fixed one fails too
// until the snapshot is refreshed with `pnpm vitest run -u`, so the list only
// ever shrinks on purpose.

const root = path.resolve(import.meta.dirname, '..');
const skipDirs = new Set(['node_modules', '.expo', 'android', 'ios', 'test', '__perf__']);

function sourceFiles(): string[] {
  return readdirSync(root, { recursive: true, encoding: 'utf8' })
    .filter((file) => /\.tsx?$/.test(file) && !/\.(d|test|vitest)\.tsx?$/.test(file))
    .filter((file) => !file.split(path.sep).some((segment) => skipDirs.has(segment)))
    .sort();
}

function compileErrors(file: string): string[] {
  const errors: string[] = [];
  transformSync(readFileSync(path.join(root, file), 'utf8'), {
    filename: file,
    babelrc: false,
    configFile: false,
    parserOpts: { plugins: ['typescript', 'jsx'] },
    plugins: [
      [
        reactCompiler,
        {
          target: '19',
          panicThreshold: 'none',
          logger: {
            logEvent(
              _filename: string | null,
              event: { kind: string; detail?: { reason: string } }
            ) {
              if (event.kind === 'CompileError' && event.detail) {
                errors.push(
                  `${file.split(path.sep).join('/')}: ${event.detail.reason.split('\n')[0]}`
                );
              }
            },
          },
        },
      ],
    ],
  });
  return errors;
}

describe('React Compiler coverage', () => {
  it('skips only the known functions', { timeout: 120_000 }, () => {
    expect(sourceFiles().flatMap(compileErrors)).toMatchSnapshot();
  });
});
