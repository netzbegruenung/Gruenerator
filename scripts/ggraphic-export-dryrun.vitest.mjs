// Red probes for scripts/ggraphic-export-dryrun.mjs: a clean exported tree must
// pass, and each leak added to it must be reported under its category.
import { describe, expect, it } from 'vitest';
import { analyzeExport } from './ggraphic-export-dryrun.mjs';

const SPDX = '// SPDX-License-Identifier: MPL-2.0\n';
const file = (path, content) => ({ path, bytes: Buffer.from(content, 'utf8') });
const json = (path, value) => file(path, JSON.stringify(value, null, 2));

const manifest = (overrides = {}) => ({
  name: '@ggraphic/core',
  version: '0.0.0',
  license: 'MPL-2.0',
  main: './src/index.ts',
  dependencies: { zod: '^4.0.0' },
  ...overrides,
});

function tree({ pkg = manifest(), extra = [], skip = [] } = {}) {
  return [
    json('packages/core/package.json', pkg),
    file('packages/core/LICENSE', 'Mozilla Public License Version 2.0'),
    file('packages/core/src/index.ts', `${SPDX}import { z } from 'zod';\nexport const a = z.string();\n`),
    json('packages/core/tsconfig.json', { extends: './tsconfig.base.json' }),
    json('packages/core/tsconfig.base.json', { compilerOptions: { strict: true } }),
    ...extra,
  ].filter((f) => !skip.includes(f.path));
}

const categories = (files) => [...new Set(analyzeExport(files).findings.map((f) => f.category))];
const messages = (files) => analyzeExport(files).findings.map((f) => `${f.category}: ${f.message}`);

describe('ggraphic export dry run', () => {
  it('passes a self-contained tree', () => {
    expect(analyzeExport(tree()).findings).toEqual([]);
  });

  it('reports an @gruenerator/* import and a workspace:* dependency', () => {
    const files = tree({
      pkg: manifest({ dependencies: { zod: '^4.0.0', '@gruenerator/x': 'workspace:*' } }),
      extra: [file('packages/core/src/leak.ts', `${SPDX}import { x } from '@gruenerator/x/sub';\n`)],
    });
    const found = messages(files);
    expect(found.some((m) => m.startsWith('imports:') && m.includes('@gruenerator/x/sub'))).toBe(true);
    expect(found.some((m) => m.startsWith('manifest:') && m.includes('workspace:*'))).toBe(true);
  });

  it('reports an undeclared package but accepts builtins and own name', () => {
    const files = tree({
      extra: [
        file(
          'packages/core/src/more.ts',
          `${SPDX}import fs from 'node:fs';\nimport path from 'path';\nimport self from '@ggraphic/core';\nimport k from 'konva';\n`
        ),
      ],
    });
    const found = messages(files).filter((m) => m.startsWith('imports:'));
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('"konva"');
  });

  it('accepts workspace: on an exported sibling, reports it as a note', () => {
    const files = tree({
      pkg: manifest({ dependencies: { zod: '^4.0.0', '@ggraphic/schema': 'workspace:*' } }),
      extra: [
        json('packages/schema/package.json', manifest({ name: '@ggraphic/schema' })),
        file('packages/schema/LICENSE', 'MPL'),
        file('packages/schema/src/index.ts', `${SPDX}export {};\n`),
      ],
    });
    const result = analyzeExport(files);
    expect(result.findings).toEqual([]);
    expect(result.notes.some((n) => n.includes('@ggraphic/schema'))).toBe(true);
  });

  it('reports catalog: versions', () => {
    const files = tree({ pkg: manifest({ devDependencies: { vitest: 'catalog:' } }) });
    expect(categories(files)).toEqual(['manifest']);
  });

  it('reports tsconfig extends and paths that leave the tree', () => {
    const files = tree({
      extra: [
        json('packages/core/tsconfig.build.json', {
          extends: '../../tsconfig.base.json',
          compilerOptions: { paths: { '@x/*': ['../../../shared/src/*'] } },
        }),
      ],
    });
    const found = messages(files).filter((m) => m.startsWith('tsconfig:'));
    expect(found.some((m) => m.includes('extends'))).toBe(true);
    expect(found.some((m) => m.includes('paths'))).toBe(true);
  });

  it('reports a tsconfig extends of a file the export does not carry', () => {
    const files = tree({ skip: ['packages/core/tsconfig.base.json'] });
    expect(categories(files)).toEqual(['tsconfig']);
  });

  it('reports root configs: eslint script without config, config importing the root', () => {
    const files = tree({
      pkg: manifest({ scripts: { lint: 'eslint .' } }),
      extra: [
        file('packages/core/vitest.config.ts', `${SPDX}import base from '../../vitest.shared';\nexport default base;\n`),
      ],
    });
    const found = messages(files).filter((m) => m.startsWith('root-config:'));
    expect(found.some((m) => m.includes('eslint'))).toBe(true);
    expect(found.some((m) => m.includes('../../vitest.shared'))).toBe(true);
  });

  it('reports a missing LICENSE, a missing SPDX header and a wrong license field', () => {
    const files = tree({
      pkg: manifest({ license: 'MIT' }),
      skip: ['packages/core/LICENSE'],
      extra: [file('packages/core/src/nospdx.ts', 'export const b = 1;\n')],
    });
    expect(categories(files).sort()).toEqual(['boundary', 'license']);
  });

  it('reports an entry point that does not exist', () => {
    const files = tree({ pkg: manifest({ main: './src/gone.ts' }) });
    expect(messages(files).some((m) => m.startsWith('manifest:') && m.includes('gone.ts'))).toBe(true);
  });
});
