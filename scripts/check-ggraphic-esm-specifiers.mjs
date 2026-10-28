#!/usr/bin/env node
/**
 * Node-ESM gate for the packages published as @ggraphic/* (schema, core,
 * editor). Inside the monorepo they are consumed from source through bundlers,
 * which resolve './x' happily; the published dist is plain `tsc` output that
 * Node loads as-is, and Node ESM rejects every relative specifier without an
 * explicit extension. A file moved or added with `from './y'` therefore stays
 * green here and breaks only for the first consumer outside the repo.
 *
 * Fails on a relative specifier (`./x`, `../x`, `.`, `..`) without .js/.json
 * in the non-test sources of the three packages and, with `--dist`, in the
 * built dist (.js and .d.ts) that exists. No install needed for the source
 * scan. `--self-test` runs the red probes on fixtures.
 *
 * Repair: add `.js` by hand (`./dir` becomes `./dir/index.js`) or by codemod.
 * (`./dir` becomes `./dir/index.js`).
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PACKAGES = ['ggraphic-schema', 'ggraphic-core', 'ggraphic-editor', 'ggraphic-collab'];

const SPEC = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)(['"])(\.{1,2}(?:\/[^'"]*)?)\1/g;
const OK_EXT = /\.(?:js|mjs|cjs|json|css|svg)$/;

export function findBadSpecifiers(source) {
  const bad = [];
  for (const m of source.matchAll(SPEC)) {
    if (!OK_EXT.test(m[2])) bad.push(m[2]);
  }
  return bad;
}

function walk(dir, test, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== 'node_modules' && e.name !== '__tests__') walk(p, test, out);
    } else if (test(e.name)) out.push(p);
  }
  return out;
}

const isSource = (n) => /\.tsx?$/.test(n) && !/\.vitest\.tsx?$/.test(n) && !n.endsWith('.d.ts') && n !== 'test-utils.ts';
const isDist = (n) => /\.(?:js|d\.ts)$/.test(n);

export function scan(packagesDir, { dist }) {
  const problems = [];
  for (const pkg of PACKAGES) {
    const targets = [[join(packagesDir, pkg, 'src'), isSource]];
    if (dist) targets.push([join(packagesDir, pkg, 'dist'), isDist]);
    for (const [dir, test] of targets) {
      for (const file of walk(dir, test)) {
        for (const spec of findBadSpecifiers(readFileSync(file, 'utf8'))) problems.push(`${file}: '${spec}'`);
      }
    }
  }
  return problems;
}

function selfTest() {
  const failures = [];
  const tmp = mkdtempSync(join(tmpdir(), 'ggraphic-esm-'));
  try {
    const mk = (rel, body) => {
      const f = join(tmp, rel);
      mkdirSync(dirname(f), { recursive: true });
      writeFileSync(f, body);
    };
    for (const p of PACKAGES) mk(`${p}/src/ok.ts`, "import a from './a.js';\nexport * from '../b/index.js';\nimport('./c.js');\n");
    if (scan(tmp, { dist: true }).length) failures.push('clean fixture must pass');
    const probes = [
      ["import x from './y';", 'plain import'],
      ["export * from '../y';", 'export from parent'],
      ["const m = await import('./y');", 'dynamic import'],
      ["import './y';", 'side-effect import'],
      ["export { a } from './dir';", 'directory import'],
      ["import x from '.';", 'bare dot'],
    ];
    for (const [body, label] of probes) {
      mk('ggraphic-editor/src/bad.ts', body);
      if (!scan(tmp, { dist: false }).length) failures.push(`source probe not caught: ${label}`);
    }
    rmSync(join(tmp, 'ggraphic-editor/src/bad.ts'));
    mk('ggraphic-core/dist/bad.d.ts', "export type T = import('./y').T;");
    if (!scan(tmp, { dist: true }).length) failures.push('dist .d.ts probe not caught');
    if (scan(tmp, { dist: false }).length) failures.push('dist must be ignored without --dist');
    mk('ggraphic-editor/src/bad.vitest.ts', "import x from './y';");
    rmSync(join(tmp, 'ggraphic-core/dist'), { recursive: true });
    if (scan(tmp, { dist: true }).length) failures.push('test files must be ignored');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  return failures;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--self-test')) {
    const failures = selfTest();
    if (failures.length) {
      console.error('✖ ggraphic ESM specifier self-test failed:');
      failures.forEach((f) => console.error('  ' + f));
      process.exit(1);
    }
    console.log('✓ ggraphic ESM specifier self-test: 10 probes ok');
  } else {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'packages');
    const dist = process.argv.includes('--dist');
    const problems = scan(root, { dist });
    if (problems.length) {
      console.error(`✖ ${problems.length} relative specifier(s) without extension (Node ESM would reject them):`);
      problems.slice(0, 50).forEach((p) => console.error('  ' + p));
      console.error("Add '.js' ('./dir' -> './dir/index.js'). The published dist is loaded by Node without a bundler.");
      process.exit(1);
    }
    console.log(`✓ ggraphic relative specifiers carry extensions (${dist ? 'src + dist' : 'src'})`);
  }
}
