#!/usr/bin/env node
/**
 * Dry run of the export of packages/ggraphic-* into the future `ggraphic` repo.
 *
 *   node scripts/ggraphic-export-dryrun.mjs [git-ref] [--keep]
 *
 * Exports the packages at <git-ref> (default HEAD, via `git archive` — never the
 * working tree) into a temp directory laid out like the future repo:
 *
 *   packages/ggraphic-schema -> packages/schema   (@ggraphic/schema)
 *   packages/ggraphic-core   -> packages/core     (@ggraphic/core)
 *   packages/ggraphic-editor -> packages/editor   (@ggraphic/editor)
 *
 * The directory name drops the `ggraphic-` prefix because the repo is called
 * ggraphic; the npm names (`@ggraphic/*`) are unchanged. Then it runs the
 * boundary rules (scripts/ggraphic-boundary/rules.mjs) over that tree and
 * reports everything that would break outside this monorepo:
 *
 *   - boundary:   brand/licence rules (a)-(f), unchanged
 *   - imports:    bare imports that are no dependency of the importing package
 *                 (`@gruenerator/*` is workspace-only, so named separately)
 *   - manifest:   `workspace:` / `catalog:` / `link:` / `file:` versions,
 *                 exports/main/types targets that do not exist
 *   - tsconfig:   `extends` / `paths` / `references` that leave the exported tree
 *   - root-config: scripts or config files that rely on the monorepo root's
 *                 eslint / prettier / vitest / tsconfig.base
 *   - license:    missing LICENSE file, package.json `license` not MPL-2.0
 *
 * `workspace:` on a package that is itself exported is not a finding: the new
 * repo is a pnpm workspace as well. It is listed as a note, together with
 * `private: true`, which must go before the first npm publish.
 *
 * Exit 1 if anything is found, 2 if the export itself fails. No dependencies —
 * plain node. `--keep` leaves the temp tree in place and prints its path.
 */
import { execFileSync } from 'node:child_process';
import { builtinModules } from 'node:module';
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { posix, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CORE_PATHSPEC, checkFiles } from './ggraphic-boundary/rules.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const EXPORT_PACKAGE_DIR = /^packages\/[^/]+/;
const SOURCE = /\.(?:tsx?|jsx?|mjs|cjs|mts|cts)$/i;
const BUILTINS = new Set(builtinModules.map((name) => name.replace(/^node:/, '')));
const DEP_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
const CONFIG_FILE =
  /(?:^|\/)(?:vitest|vite|eslint|prettier|tailwind|postcss)(?:\.[\w-]+)*\.config\.[cm]?[jt]s$|(?:^|\/)vitest\.(?:workspace|shared)\.[cm]?[jt]s$/;

export const CATEGORIES = [
  ['boundary', 'Boundary rules (brand, assets, SPDX)'],
  ['imports', 'Imports that are not dependencies of the exported package'],
  ['manifest', 'package.json that only works inside the monorepo'],
  ['tsconfig', 'tsconfig pointing outside the exported tree'],
  ['root-config', 'Reliance on root configs the export does not carry'],
  ['license', 'License files and fields'],
];

/** Parse JSON with comments and trailing commas (tsconfig). */
function parseJsonc(text) {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j;
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n';
    } else if (c === '/' && text[i + 1] === '*') {
      i = text.indexOf('*/', i + 2);
      if (i === -1) break;
      i++;
    } else out += c;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'));
}

/** Bare package name of an import specifier, or null for relative, builtin or virtual ones. */
function packageOf(specifier) {
  if (/^(?:\.|\/|#)/.test(specifier) || /^[a-z]+:/i.test(specifier)) {
    return null;
  }
  const parts = specifier.split('/');
  const name = specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
  return BUILTINS.has(name) ? null : name;
}

function specifiersOf(path, text) {
  const body = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const found = new Set();
  const patterns = /\.css$/i.test(path)
    ? [/@import\s+(?:url\()?\s*['"]([^'"\n]+)['"]/g]
    : [
        /\bfrom\s*['"]([^'"\n]+)['"]/g,
        /\bimport\s*['"]([^'"\n]+)['"]/g,
        /\bimport\s*\(\s*['"]([^'"\n]+)['"]/g,
        /\brequire\s*\(\s*['"]([^'"\n]+)['"]/g,
      ];
  for (const pattern of patterns) for (const m of body.matchAll(pattern)) found.add(m[1]);
  return [...found];
}

/**
 * @param {{path: string, bytes: Buffer, link?: string}[]} files the exported tree,
 *   paths relative to the export root (`packages/<name>/…`)
 * @returns {{ findings: {category: string, path: string, message: string}[], notes: string[], boundaryWarnings: {path: string, message: string}[] }}
 */
export function analyzeExport(files) {
  const findings = [];
  const notes = [];
  const add = (category, path, message) => findings.push({ category, path, message });
  const present = new Set(files.map((f) => f.path));
  const exists = (path) => {
    if (present.has(path)) return true;
    const dir = path.endsWith('/') ? path : `${path}/`;
    return [...present].some((p) => p.startsWith(dir));
  };
  const read = (file) => file.bytes.toString('utf8');

  // 1. brand / asset / SPDX rules, unchanged
  const { failures, warnings } = checkFiles(files, { packageDir: EXPORT_PACKAGE_DIR });
  for (const f of failures) add('boundary', f.path, `[${f.rule}] ${f.message}`);

  // package manifests
  const packages = new Map(); // dir -> { name, json }
  for (const file of files) {
    const m = /^(packages\/[^/]+)\/package\.json$/.exec(file.path);
    if (!m) continue;
    try {
      packages.set(m[1], { name: JSON.parse(read(file)).name, json: JSON.parse(read(file)) });
    } catch (error) {
      add('manifest', file.path, `not valid JSON: ${error.message}`);
    }
  }
  const exportedNames = new Set([...packages.values()].map((p) => p.name));
  for (const dir of new Set(files.map((f) => EXPORT_PACKAGE_DIR.exec(f.path)?.[0]).filter(Boolean))) {
    if (!packages.has(dir)) add('manifest', dir, 'package has no package.json');
  }

  for (const [dir, { name, json }] of packages) {
    const manifestPath = `${dir}/package.json`;

    // 2. manifest: protocol versions, entry points
    for (const field of DEP_FIELDS) {
      for (const [dep, range] of Object.entries(json[field] ?? {})) {
        if (typeof range !== 'string') continue;
        if (range.startsWith('workspace:')) {
          if (exportedNames.has(dep)) {
            notes.push(`${manifestPath}: ${field}.${dep} is "${range}" — fine only if the new repo is a pnpm workspace`);
          } else {
            add('manifest', manifestPath, `${field}.${dep}: "${range}" — ${dep} is not part of the export`);
          }
        } else if (/^(?:catalog:|link:|file:|portal:)/.test(range)) {
          add('manifest', manifestPath, `${field}.${dep}: "${range}" resolves only inside this monorepo`);
        }
      }
    }
    if (json.private === true) notes.push(`${manifestPath}: "private": true — remove before the first npm publish`);
    if (json.license !== 'MPL-2.0') {
      add('license', manifestPath, `"license" is ${JSON.stringify(json.license ?? null)}, expected "MPL-2.0"`);
    }
    if (!files.some((f) => f.path === `${dir}/LICENSE` || f.path.startsWith(`${dir}/LICENSE.`))) {
      add('license', dir, 'no LICENSE file');
    }

    const targets = [];
    const collect = (value) => {
      if (typeof value === 'string') targets.push(value);
      else if (value && typeof value === 'object') Object.values(value).forEach(collect);
    };
    collect(json.exports);
    for (const field of ['main', 'module', 'types', 'bin']) collect(json[field]);
    for (const target of targets) {
      if (!target.startsWith('./') || target.includes('*') || target.startsWith('./dist/')) continue; // build output
      if (!exists(posix.join(dir, target))) add('manifest', manifestPath, `entry point "${target}" does not exist`);
    }

    // root configs behind scripts
    const has = (pattern) => files.some((f) => f.path.startsWith(`${dir}/`) && pattern.test(f.path.slice(dir.length + 1)));
    for (const [script, command] of Object.entries(json.scripts ?? {})) {
      if (/\beslint\b/.test(command) && !has(/^(?:eslint\.config\.[cm]?[jt]s|\.eslintrc[\w.]*)$/)) {
        add('root-config', manifestPath, `script "${script}" runs eslint but the package carries no eslint config (it lives in the monorepo root)`);
      }
      if (/\bprettier\b/.test(command) && !has(/^(?:prettier\.config\.[cm]?[jt]s|\.prettierrc[\w.]*)$/)) {
        add('root-config', manifestPath, `script "${script}" runs prettier but the package carries no prettier config`);
      }
      for (const [ref] of command.matchAll(/(?:\.\.\/)+[^\s'"]*/g)) {
        if (posix.normalize(posix.join(dir, ref)).split('/')[1] !== posix.basename(dir)) {
          add('root-config', manifestPath, `script "${script}" reaches outside the package: ${ref}`);
        }
      }
      for (const m of command.matchAll(/(?:--config|-c)[= ]+(\S+)/g)) {
        const target = posix.normalize(posix.join(dir, m[1]));
        if (!present.has(target)) add('root-config', manifestPath, `script "${script}" uses config ${m[1]}, which the export does not carry`);
      }
    }
  }

  // 3. imports + root-config files + tsconfig
  for (const file of files) {
    if (file.link !== undefined) continue;
    const dir = EXPORT_PACKAGE_DIR.exec(file.path)?.[0];
    const pkg = dir ? packages.get(dir) : null;

    if (SOURCE.test(file.path) || /\.css$/i.test(file.path)) {
      const text = read(file);
      const declared = pkg
        ? new Set([pkg.name, ...DEP_FIELDS.flatMap((field) => Object.keys(pkg.json[field] ?? {}))])
        : new Set();
      for (const specifier of specifiersOf(file.path, text)) {
        const name = packageOf(specifier);
        if (!name) continue;
        // Declared or not: nothing named @gruenerator/* exists outside the monorepo.
        if (name.startsWith('@gruenerator/')) {
          add('imports', file.path, `"${specifier}" — workspace-only package of the Grünerator monorepo`);
        } else if (!declared.has(name)) {
          add('imports', file.path, `"${specifier}" — ${name} is not in dependencies/devDependencies/peerDependencies of ${pkg?.name ?? 'the package'}`);
        }
      }
      if (CONFIG_FILE.test(file.path) && dir) {
        for (const specifier of specifiersOf(file.path, text)) {
          if (!specifier.startsWith('.')) continue;
          const target = posix.normalize(posix.join(posix.dirname(file.path), specifier));
          if (!target.startsWith(`${dir}/`)) {
            add('root-config', file.path, `config imports "${specifier}" from outside the package (a root config the export does not carry)`);
          }
        }
      }
    }

    if (/(?:^|\/)tsconfig[\w.-]*\.json$/.test(file.path)) {
      let config;
      try {
        config = parseJsonc(read(file));
      } catch (error) {
        add('tsconfig', file.path, `not parseable: ${error.message}`);
        continue;
      }
      const here = posix.dirname(file.path);
      const check = (what, ref, base = here, asFile = false) => {
        const candidates = asFile && !ref.endsWith('.json') ? [ref, `${ref}.json`] : [ref];
        const targets = candidates.map((c) => posix.normalize(posix.join(base, c)));
        if (targets.some((t) => t.startsWith('../') || t === '..')) {
          add('tsconfig', file.path, `${what} "${ref}" leaves the exported tree`);
        } else if (!targets.some((t) => exists(t))) {
          add('tsconfig', file.path, `${what} "${ref}" resolves to ${targets[0]}, which the export does not carry`);
        }
      };
      for (const ref of [config.extends ?? []].flat()) {
        if (/^(?:\.|\/)/.test(ref)) check('extends', ref, here, true);
        else {
          const name = packageOf(ref);
          if (name && !DEP_FIELDS.some((f) => pkg?.json[f]?.[name])) {
            add('tsconfig', file.path, `extends "${ref}" but ${name} is not a dependency of ${pkg?.name}`);
          }
        }
      }
      const baseUrl = config.compilerOptions?.baseUrl;
      const pathsBase = posix.join(here, baseUrl ?? '.');
      if (baseUrl) check('baseUrl', baseUrl);
      for (const [alias, list] of Object.entries(config.compilerOptions?.paths ?? {})) {
        for (const target of [list].flat()) {
          check(`paths["${alias}"]`, target.replace(/\*.*$/, ''), pathsBase);
        }
      }
      for (const reference of config.references ?? []) check('references', reference.path, here, true);
      for (const field of ['rootDirs', 'typeRoots']) {
        for (const ref of config.compilerOptions?.[field] ?? []) check(`compilerOptions.${field}`, ref);
      }
    }
  }

  return { findings, notes, boundaryWarnings: warnings };
}

/** Collect the files below `root` (lstat: symlinks stay visible). Paths are posix, relative to root. */
function collect(root, rel = '') {
  const out = [];
  for (const entry of readdirSync(join(root, rel), { withFileTypes: true })) {
    const path = rel ? `${rel}/${entry.name}` : entry.name;
    const full = join(root, path);
    const stat = lstatSync(full);
    if (stat.isSymbolicLink()) out.push({ path, bytes: Buffer.alloc(0), link: readlinkSync(full) });
    else if (stat.isDirectory()) out.push(...collect(root, path));
    else out.push({ path, bytes: readFileSync(full) });
  }
  return out;
}

/** `git archive` of packages/ggraphic-* at `ref` into a fresh temp dir, renamed to packages/<name>. */
export function exportTree(ref) {
  if (ref.startsWith('-')) throw new Error(`invalid git ref: ${ref}`);
  const dir = mkdtempSync(join(tmpdir(), 'ggraphic-export-'));
  const staging = join(dir, 'staging');
  mkdirSync(staging);
  const tar = execFileSync('git', ['archive', '--format=tar', ref, '--', CORE_PATHSPEC], {
    cwd: ROOT,
    maxBuffer: 1 << 30,
  });
  execFileSync('tar', ['-x', '-C', staging], { input: tar });
  const out = join(dir, 'tree');
  mkdirSync(join(out, 'packages'), { recursive: true });
  for (const name of readdirSync(join(staging, 'packages'))) {
    renameSync(join(staging, 'packages', name), join(out, 'packages', name.replace(/^ggraphic-/, '')));
  }
  rmSync(staging, { recursive: true, force: true });
  return { dir, tree: out };
}

export function formatReport(result) {
  const lines = [];
  for (const [category, title] of CATEGORIES) {
    const items = result.findings.filter((f) => f.category === category);
    if (items.length === 0) continue;
    lines.push(`\n✖ ${title} — ${items.length}`);
    const byPath = new Map();
    for (const item of items) byPath.set(item.path, [...(byPath.get(item.path) ?? []), item.message]);
    for (const [path, messages] of byPath) {
      lines.push(`  ${path}`);
      for (const message of messages) lines.push(`    · ${message}`);
    }
  }
  if (result.notes.length > 0) {
    lines.push(`\nNotes (not failures) — ${result.notes.length}`);
    for (const note of result.notes) lines.push(`  · ${note}`);
  }
  const counts = CATEGORIES.map(([c]) => `${c}: ${result.findings.filter((f) => f.category === c).length}`);
  lines.push(`\nSummary — ${counts.join(', ')}; total ${result.findings.length}`);
  return lines.join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const keep = args.includes('--keep');
  const ref = args.find((a) => !a.startsWith('--')) ?? 'HEAD';
  let exported;
  try {
    exported = exportTree(ref);
  } catch (error) {
    console.error(`✖ export of ${CORE_PATHSPEC} at ${ref} failed: ${error.message}`);
    process.exit(2);
  }
  try {
    const files = collect(exported.tree);
    const result = analyzeExport(files);
    console.log(`ggraphic export dry run: ${files.length} file(s) from ${ref}`);
    console.log(formatReport(result));
    if (result.findings.length > 0) {
      console.error('\n✖ the export would not stand on its own yet.');
      process.exitCode = 1;
    } else {
      console.log('\n✓ the exported tree is self-contained.');
    }
  } finally {
    if (keep) console.log(`\nkept: ${exported.tree}`);
    else rmSync(exported.dir, { recursive: true, force: true });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
