#!/usr/bin/env node
/**
 * Resource-efficient Pyodide self-hosting.
 *
 * The npm `pyodide` package ships only the ~12 MB core (wasm + stdlib + lock),
 * NOT the package wheels. This script vendors the minimal runtime into
 * apps/web/public/pyodide/ so the browser loads everything from our own origin
 * (no CDN at runtime → privacy-clean, CSP needs no third-party allowlist):
 *
 *   1. copy the core binary assets from node_modules/pyodide
 *   2. compute the transitive dependency closure of PACKAGES from pyodide-lock.json
 *   3. download ONLY those wheels from the pinned Pyodide CDN (idempotent)
 *
 * public/pyodide/ is gitignored — assets are produced here, never committed.
 * Re-run is cheap (skips files already present). Wire into predev/prebuild.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, copyFile, writeFile, access } from 'node:fs/promises';

// Packages the in-browser code interpreter is allowed to use. Their transitive
// deps are resolved automatically from the lockfile — keep in sync with the
// detection map in packages/chat/src/lib/pyodidePackages.ts.
// NOTE: only packages bundled in pyodide-lock.json can be vendored offline.
// seaborn + openpyxl (Excel) are NOT in this Pyodide version's lock — they need
// micropip/PyPI-wheel injection, deferred to a dedicated change.
const PACKAGES = ['pandas', 'matplotlib', 'scipy', 'sympy', 'scikit-learn'];

// Core files loadPyodide() fetches from indexURL at runtime (the JS loader
// itself is bundled into the worker from the npm package, so it's not copied).
const CORE_FILES = ['pyodide.asm.js', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json'];

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pyodideDir = path.dirname(require.resolve('pyodide/package.json'));
const outDir = path.resolve(__dirname, '../public/pyodide');
const version = require('pyodide/package.json').version;
const cdnBase = `https://cdn.jsdelivr.net/pyodide/v${version}/full`;

const exists = (p) =>
  access(p)
    .then(() => true)
    .catch(() => false);

async function main() {
  await mkdir(outDir, { recursive: true });

  // 1. core assets
  for (const f of CORE_FILES) {
    await copyFile(path.join(pyodideDir, f), path.join(outDir, f));
  }

  // 2. transitive closure of PACKAGES — collect wheel file_names during BFS.
  // Dep names in the lock reference package keys directly, so key `seen` by the
  // pushed name (with a normalized fallback for the rare underscore/case skew).
  const lock = require('pyodide/pyodide-lock.json');
  const pkgs = lock.packages;
  const seen = new Set();
  const wheels = [];
  const queue = [...PACKAGES];
  while (queue.length) {
    const name = queue.shift();
    if (seen.has(name)) continue;
    seen.add(name);
    const entry = pkgs[name] ?? pkgs[name.toLowerCase().replace(/_/g, '-')];
    if (!entry) {
      console.warn(
        `[pyodide] WARN: "${name}" not in pyodide-lock.json — skipped (not bundled in v${version})`
      );
      continue;
    }
    wheels.push(entry.file_name);
    for (const dep of entry.depends ?? []) queue.push(dep);
  }
  console.log(`[pyodide] ${PACKAGES.join('+')} → ${wheels.length} wheels (v${version})`);

  // 3. download only the needed wheels (idempotent)
  let downloaded = 0;
  for (const file of wheels) {
    const dest = path.join(outDir, file);
    if (await exists(dest)) continue;
    const res = await fetch(`${cdnBase}/${file}`);
    if (!res.ok) throw new Error(`download failed (${res.status}): ${file}`);
    await writeFile(dest, Buffer.from(await res.arrayBuffer()));
    downloaded++;
    console.log(`[pyodide]   + ${file}`);
  }
  console.log(
    `[pyodide] done — ${downloaded} downloaded, ${wheels.length - downloaded} cached, in public/pyodide/`
  );

  // 4. version marker — drives the service-worker cache name so a Pyodide
  // version bump busts the cached runtime+wheels automatically (see
  // public/sw-illustration-cache.js). Served no-cache so the SW always sees
  // the current version.
  await writeFile(path.join(outDir, 'version.json'), JSON.stringify({ version }) + '\n');
}

main().catch((err) => {
  console.error('[pyodide] setup failed:', err.message);
  process.exit(1);
});
