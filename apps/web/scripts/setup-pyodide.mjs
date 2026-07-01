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
// NOTE: only packages bundled in pyodide-lock.json can be vendored offline via
// the BFS below. seaborn is still absent from this Pyodide version's lock.
const PACKAGES = ['pandas', 'matplotlib', 'scipy', 'sympy', 'scikit-learn'];

// Pure-Python packages NOT in pyodide-lock.json (so the BFS can't resolve them),
// vendored as direct PyPI wheels instead. Installed at runtime via micropip from
// our own /pyodide/ origin (deps disabled) — never fetched from PyPI in-browser,
// so the offline/no-CDN guarantee holds. openpyxl (+ its only dep et_xmlfile)
// gives pandas the .xlsx engine; xlrd gives the legacy .xls engine (no deps).
// The worker installs each lazily, only for the format actually uploaded.
// (.ods is intentionally omitted: odfpy publishes no wheel, only an sdist, so it
// can't be micropip-installed offline — .ods falls back to document extraction.)
const PYPI_WHEELS = [
  'https://files.pythonhosted.org/packages/c1/8b/5fe2cc11fee489817272089c4203e679c63b570a5aaeb18d852ae3cbba6a/et_xmlfile-2.0.0-py3-none-any.whl',
  'https://files.pythonhosted.org/packages/c0/da/977ded879c29cbd04de313843e76868e6e13408a94ed6b987245dc7c8506/openpyxl-3.1.5-py2.py3-none-any.whl',
  'https://files.pythonhosted.org/packages/1a/62/c8d562e7766786ba6587d09c5a8ba9f718ed3fa8af7f4553e8f91c36f302/xlrd-2.0.2-py2.py3-none-any.whl',
];

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

  // 3b. direct PyPI wheels not covered by the lock (openpyxl for Excel).
  // Same idempotent download; the file name is the URL's basename.
  for (const url of PYPI_WHEELS) {
    const file = url.split('/').pop();
    const dest = path.join(outDir, file);
    if (await exists(dest)) continue;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`download failed (${res.status}): ${file}`);
    await writeFile(dest, Buffer.from(await res.arrayBuffer()));
    console.log(`[pyodide]   + ${file} (PyPI)`);
  }

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
