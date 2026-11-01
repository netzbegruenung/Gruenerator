#!/usr/bin/env node
// Ein Image, das das `dist` eines Workspace-Pakets ausliefert, muss auch das
// `dist` jeder Workspace-Abhängigkeit ausliefern, die das Paket zur Laufzeit
// lädt. Fehlt eines, baut das Image grün (tsc sieht die Quellen) und stirbt
// erst beim Start an ERR_MODULE_NOT_FOUND.
//
// So am 30.10.2026: `contracts` lud seit 64df4540b9 `@ggraphic/core`, das
// API-Image bekam dessen dist, das Hocuspocus-Image nicht. Hocuspocus lief in
// eine Neustartschleife, und weil nginx auf dessen Gesundheit wartete, stand
// die ganze Seite auf 502. `check-image-build-filters.mjs` sah nichts: kopiert
// wurde das Paket ja, nur nicht gebaut.
//
// Gelesen wird ausschliesslich, was im Repo steht — die `COPY … /dist`-Zeilen
// der Dockerfiles und die `dependencies` der package.json —, damit hier keine
// zweite Liste entsteht.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const readJson = (path) => JSON.parse(readFileSync(join(ROOT, path), 'utf8'));

const workspaceDirs = execFileSync('git', ['ls-files', '*/package.json'], {
  cwd: ROOT,
  encoding: 'utf8',
})
  .split('\n')
  .filter((p) => /^(apps|packages|services)\/[^/]+\/package\.json$/.test(p))
  .map((p) => p.slice(0, -'/package.json'.length));

/** Paketname → Verzeichnis, für jedes Workspace-Paket. */
const dirByName = new Map(workspaceDirs.map((dir) => [readJson(`${dir}/package.json`).name, dir]));

/** Lädt das Paket zur Laufzeit aus `dist`? Pakete, die nur Quellen exportieren, brauchen keins. */
function loadsFromDist(dir) {
  const pkg = readJson(`${dir}/package.json`);
  return JSON.stringify([pkg.main, pkg.exports]).includes('./dist/');
}

function runtimeWorkspaceDeps(dir) {
  const deps = readJson(`${dir}/package.json`).dependencies ?? {};
  return Object.entries(deps)
    .filter(([, range]) => String(range).startsWith('workspace:'))
    .map(([name]) => {
      const depDir = dirByName.get(name);
      if (!depDir)
        throw new Error(`${dir}/package.json: workspace-Abhängigkeit ${name} nicht gefunden`);
      return { name, dir: depDir };
    })
    .filter((dep) => loadsFromDist(dep.dir));
}

const dockerfiles = execFileSync(
  'git',
  ['ls-files', 'Dockerfile', '*/Dockerfile', '*/Dockerfile.*'],
  {
    cwd: ROOT,
    encoding: 'utf8',
  }
)
  .split('\n')
  .filter(Boolean);

const problems = [];
for (const dockerfile of dockerfiles) {
  const lines = readFileSync(join(ROOT, dockerfile), 'utf8').split('\n');
  const shipped = new Set();
  for (const line of lines) {
    const m = /^COPY\s+--from=\S+.*?\s\/app\/((?:apps|packages|services)\/[^/\s]+)\/dist\s/.exec(
      line
    );
    if (m) shipped.add(m[1]);
  }
  for (const dir of [...shipped].sort()) {
    if (!existsSync(join(ROOT, dir, 'package.json'))) continue;
    for (const dep of runtimeWorkspaceDeps(dir)) {
      if (!shipped.has(dep.dir)) {
        problems.push(
          `${dockerfile}: liefert ${dir}/dist aus, aber nicht ${dep.dir}/dist (${dep.name})`
        );
      }
    }
  }
}

if (problems.length > 0) {
  console.error('Image ohne Laufzeit-Abhängigkeit — startet mit ERR_MODULE_NOT_FOUND:\n');
  for (const p of problems) console.error(`  ${p}`);
  console.error(
    '\nIm Builder bauen (`pnpm exec tsc --project tsconfig.build.json`) und das dist in die Production-Stage kopieren.'
  );
  process.exit(1);
}
console.log(
  `Image-Laufzeitabhängigkeiten vollständig (${dockerfiles.length} Dockerfiles geprüft).`
);
