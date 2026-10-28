#!/usr/bin/env node
/**
 * Licence gate for the packages that will be published as @ggraphic/* under
 * MPL-2.0 (packages/ggraphic-schema, -core, -editor, -collab). Walks the production
 * dependency tree (dependencies, peerDependencies, optionalDependencies — not
 * devDependencies) from the installed node_modules and fails when any package
 * declares a licence outside ALLOWED, or none. @iconify-json/* sets must also
 * be allowed in their info.json: the package.json can say MIT while the icon
 * data carries a different licence (Remix Icon changed its licence at 4.9.0).
 *
 * Needs node_modules (runs on the typecheck job). No dependencies.
 * `--self-test` builds fixture trees and runs the red probes; needs no install.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ALLOWED = new Set([
  'MIT',
  'ISC',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  '0BSD',
  'MPL-2.0',
  'CC0-1.0',
  'OFL-1.1',
]);

export const ROOT_PACKAGES = ['ggraphic-schema', 'ggraphic-core', 'ggraphic-editor', 'ggraphic-collab'];

// Packages whose manifest declares no licence although they ship one. Keyed by exact
// version, so a bump falls back to the manifest and needs a fresh look.
const VERIFIED_LICENSES = new Map([
  // LICENSE.md is the MIT text; package.json and the registry carry no `license`.
  ['react-kawaii@1.6.0', 'MIT'],
]);

/** True when an SPDX expression is composed only of allowed ids. OR needs one side, AND both. */
export function expressionAllowed(expression) {
  const tokens = expression.replace(/([()])/g, ' $1 ').split(/\s+/).filter(Boolean);
  let pos = 0;
  const parseOr = () => {
    let ok = parseAnd();
    while (tokens[pos] === 'OR') {
      pos++;
      const right = parseAnd();
      ok = ok || right;
    }
    return ok;
  };
  const parseAnd = () => {
    let ok = parseAtom();
    while (tokens[pos] === 'AND') {
      pos++;
      const right = parseAtom();
      ok = ok && right;
    }
    return ok;
  };
  const parseAtom = () => {
    const token = tokens[pos++];
    if (token === '(') {
      const ok = parseOr();
      if (tokens[pos++] !== ')') throw new Error('unbalanced');
      return ok;
    }
    return token !== undefined && ALLOWED.has(token);
  };
  try {
    const ok = parseOr();
    return ok && pos === tokens.length;
  } catch {
    return false;
  }
}

function declaredLicense(pkg) {
  const lic = pkg.license ?? pkg.licenses;
  if (typeof lic === 'string') return lic;
  if (lic && typeof lic === 'object' && !Array.isArray(lic)) return lic.type ?? null;
  if (Array.isArray(lic) && lic.length > 0) {
    const types = lic.map((l) => (typeof l === 'string' ? l : l?.type));
    return types.every(Boolean) ? types.join(' OR ') : null;
  }
  return null;
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/** Node resolution from the real dir of the requiring package. */
function resolveDep(fromDir, name) {
  let dir = fromDir;
  for (;;) {
    const candidate = join(dir, 'node_modules', name);
    if (existsSync(join(candidate, 'package.json'))) return realpathSync(candidate);
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** Returns a list of { path, message } problems for the given root package dirs. */
export function checkLicenses(rootDirs) {
  const problems = [];
  const seen = new Set();
  const visit = (dir, trail) => {
    const pkg = readJson(join(dir, 'package.json'));
    if (!pkg) return;
    const id = `${pkg.name}@${pkg.version}`;
    if (seen.has(dir)) return;
    seen.add(dir);
    const label = trail.join(' > ');
    const isRoot = trail.length === 1;
    if (!isRoot) {
      const license = declaredLicense(pkg) ?? VERIFIED_LICENSES.get(id) ?? null;
      if (!license) problems.push({ path: label, message: `${id}: no license field` });
      else if (!expressionAllowed(license))
        problems.push({ path: label, message: `${id}: license "${license}" is not allowed` });
    }
    if (pkg.name?.startsWith('@iconify-json/')) {
      const info = readJson(join(dir, 'info.json'));
      const spdx = info?.license?.spdx ?? null;
      if (!spdx || !expressionAllowed(spdx))
        problems.push({
          path: label,
          message: `${id}: icon data licence "${spdx ?? 'missing'}" (info.json) is not allowed`,
        });
    }
    const optionalPeers = new Set(
      Object.entries(pkg.peerDependenciesMeta ?? {})
        .filter(([, meta]) => meta?.optional)
        .map(([name]) => name)
    );
    const names = new Set([
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.peerDependencies ?? {}),
      ...Object.keys(pkg.optionalDependencies ?? {}),
    ]);
    for (const name of names) {
      const child = resolveDep(dir, name);
      if (!child) {
        const optional =
          optionalPeers.has(name) || (pkg.optionalDependencies ?? {})[name] !== undefined;
        if (!optional)
          problems.push({ path: `${label} > ${name}`, message: `${name} is not installed` });
        continue;
      }
      visit(child, [...trail, name]);
    }
  };
  for (const dir of rootDirs) {
    const pkg = readJson(join(dir, 'package.json'));
    visit(realpathSync(dir), [pkg?.name ?? dir]);
  }
  return { problems, count: seen.size };
}

function selfTest() {
  const base = mkdtempSync(join(tmpdir(), 'ggraphic-licenses-'));
  const failures = [];
  const write = (file, data) => {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(data));
  };
  const fixture = (name, deps) => {
    const root = join(base, name);
    write(join(root, 'package.json'), { name: 'root', version: '1.0.0', license: 'MPL-2.0', dependencies: Object.fromEntries(Object.keys(deps).map((d) => [d, '*'])) });
    for (const [dep, meta] of Object.entries(deps))
      write(join(root, 'node_modules', dep, 'package.json'), { name: dep, version: '1.0.0', ...meta });
    return root;
  };
  const expect = (label, root, wantRed, needle) => {
    const { problems } = checkLicenses([root]);
    const red = problems.length > 0;
    if (red !== wantRed || (needle && !problems.some((p) => p.message.includes(needle))))
      failures.push(`${label}: expected ${wantRed ? 'red' : 'green'}, got ${JSON.stringify(problems)}`);
  };
  try {
    expect('clean', fixture('clean', { a: { license: 'MIT' }, b: { license: '(MIT OR GPL-3.0)' } }), false);
    expect('gpl', fixture('gpl', { a: { license: 'GPL-3.0-only' } }), true, 'GPL-3.0-only');
    expect('and-gpl', fixture('and', { a: { license: 'MIT AND GPL-3.0' } }), true);
    expect('missing', fixture('missing', { a: {} }), true, 'no license');
    expect('see-license', fixture('see', { a: { license: 'SEE LICENSE IN LICENSE.md' } }), true);
    const transitive = fixture('transitive', { a: { license: 'MIT', dependencies: { c: '*' } } });
    write(join(transitive, 'node_modules', 'c', 'package.json'), { name: 'c', version: '1.0.0', license: 'AGPL-3.0' });
    expect('transitive', transitive, true, 'AGPL-3.0');
    const peer = fixture('peer', { a: { license: 'MIT', peerDependencies: { p: '*' } } });
    write(join(peer, 'node_modules', 'p', 'package.json'), { name: 'p', version: '1.0.0', license: 'GPL-2.0' });
    expect('peer', peer, true, 'GPL-2.0');
    const icons = fixture('icons-bad', { '@iconify-json/zz': { license: 'MIT' } });
    write(join(icons, 'node_modules', '@iconify-json', 'zz', 'info.json'), { license: { spdx: 'LicenseRef-Custom' } });
    expect('iconify-info-bad', icons, true, 'icon data');
    const good = fixture('icons-good', { '@iconify-json/zz': { license: 'MIT' } });
    write(join(good, 'node_modules', '@iconify-json', 'zz', 'info.json'), { license: { spdx: 'Apache-2.0' } });
    expect('iconify-info-good', good, false);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
  return failures;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--self-test')) {
    const failures = selfTest();
    if (failures.length > 0) {
      console.error('✖ ggraphic licence self-test failed:');
      for (const f of failures) console.error(`  · ${f}`);
      process.exit(1);
    }
    console.log('✓ ggraphic licence self-test: 9 probes ok');
  } else {
    const root = fileURLToPath(new URL('..', import.meta.url));
    const dirs = ROOT_PACKAGES.map((p) => join(root, 'packages', p));
    const missing = dirs.filter((d) => !existsSync(join(d, 'node_modules')) && !existsSync(join(root, 'node_modules')));
    if (missing.length > 0) {
      console.error('✖ node_modules missing — run pnpm install first');
      process.exit(1);
    }
    const { problems, count } = checkLicenses(dirs);
    if (problems.length > 0) {
      console.error(`\n✖ ${problems.length} licence problem(s) in the @ggraphic dependency tree:\n`);
      for (const p of problems) console.error(`  ${p.message}\n    via ${p.path}`);
      process.exit(1);
    }
    console.log(`✓ ${count} package(s) in the @ggraphic dependency tree have allowed licences`);
  }
}
