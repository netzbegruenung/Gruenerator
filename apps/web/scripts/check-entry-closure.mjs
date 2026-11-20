#!/usr/bin/env node
// Budget for the web entry's static import closure (#5891).
//
// Everything the entry chunk reaches through static imports has to load before
// React can mount, so it decides how long a slow connection stares at an empty
// #root. Lazy routes (dynamic imports) are not counted. The closure is read from
// Vite's build manifest (`vite build --manifest`), whose `imports` field lists
// exactly the statically imported chunks, so no JS parsing is needed.
//
// Ratchet: fail above the budget; print the new value when the build is well
// below it, so the PR that shrinks the closure also lowers the budget. The
// numbers are gzip level 6 (roughly what nginx compresses on the fly), measured
// on the CI build. A local build can differ by a few KB, because VITE_* values
// from apps/web/.env are inlined.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const webDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const buildDir = join(webDir, 'build');
const budget = JSON.parse(readFileSync(join(webDir, 'entry-budget.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(join(buildDir, '.vite', 'manifest.json'), 'utf8'));

const entryKey = Object.keys(manifest).find(
  (key) => manifest[key].isEntry && key.endsWith('index.html')
);
if (!entryKey) {
  console.error('check-entry-closure: no index.html entry in build/.vite/manifest.json');
  process.exit(1);
}

const closure = new Set();
const queue = [entryKey];
while (queue.length > 0) {
  const key = queue.pop();
  if (closure.has(key)) continue;
  closure.add(key);
  queue.push(...(manifest[key].imports ?? []));
}

let gzipBytes = 0;
for (const key of closure) {
  gzipBytes += gzipSync(readFileSync(join(buildDir, manifest[key].file)), { level: 6 }).length;
}
const files = closure.size;
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

console.log(`Entry static closure: ${files} files, ${kb(gzipBytes)} gzip`);
console.log(`Budget:               ${budget.maxFiles} files, ${kb(budget.maxGzipBytes)} gzip`);

const failures = [];
if (gzipBytes > budget.maxGzipBytes)
  failures.push(`gzip size ${kb(gzipBytes)} > ${kb(budget.maxGzipBytes)}`);
if (files > budget.maxFiles) failures.push(`file count ${files} > ${budget.maxFiles}`);

if (failures.length > 0) {
  console.error(`\nEntry closure over budget: ${failures.join(', ')}.`);
  console.error(
    'Something new is statically imported on the boot path. Load it with import() / React.lazy,'
  );
  console.error(
    'or, if it really is needed before first paint, raise apps/web/entry-budget.json in the same PR and say why.'
  );
  process.exit(1);
}

const slack = 0.02;
if (gzipBytes < budget.maxGzipBytes * (1 - slack) || files < budget.maxFiles * (1 - slack)) {
  const suggested = { maxGzipBytes: Math.ceil(gzipBytes * 1.01), maxFiles: files };
  console.log(
    `\nWell below budget. Lower apps/web/entry-budget.json to ${JSON.stringify(suggested)}.`
  );
}
