#!/usr/bin/env node
// Ein Image wird nur gebaut, wenn `dorny/paths-filter` in build-images.yml eine
// seiner Pfad-Regeln getroffen sieht. Kopiert das Dockerfile ein Paket, das dort
// nicht steht, dann landet eine Änderung an genau diesem Paket auf master, der
// Workflow läuft (`packages/**` steht im Trigger) — und baut nichts. Die
// Änderung ist gemergt und wird nie ausgeliefert; es gibt keinen roten Job, der
// das meldet.
//
// Gemessen am 02.08.2026: `packages/query` fehlte in ALLEN Filtern, obwohl vier
// Dockerfiles es kopieren; `contracts` fehlte in vier von fünf. Aufgefallen ist
// es nie, weil diese Pakete in der Praxis nie allein in einem PR landen.
//
// Zuordnung Job → Dockerfile → Filter wird aus dem Workflow selbst gelesen,
// damit hier keine zweite Liste entsteht, die ihrerseits driften kann.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const WORKFLOW = '.github/workflows/build-images.yml';
const workflow = readFileSync(join(ROOT, WORKFLOW), 'utf8').split('\n');

/** Die `filters: |`-Blockskalar aus dem detect-changes-Job: Schlüssel → Pfade. */
function parseFilters() {
  const start = workflow.findIndex((l) => /^\s+filters: \|\s*$/.test(l));
  if (start === -1) throw new Error(`${WORKFLOW}: kein "filters: |"-Block gefunden`);
  const filters = new Map();
  let current = null;
  for (const line of workflow.slice(start + 1)) {
    const key = /^ {12}([\w-]+):\s*$/.exec(line);
    if (key) {
      current = key[1];
      filters.set(current, []);
      continue;
    }
    const path = /^ {14}- '(.+)'\s*$/.exec(line);
    if (path && current) {
      filters.get(current).push(path[1]);
      continue;
    }
    if (line.trim() !== '') break; // Blockskalar endet an der ersten flacheren Zeile
  }
  return filters;
}

/** Jeder build-*-Job nennt sein Dockerfile (`file:`) und sein Filter-Ergebnis. */
function parseJobs() {
  const jobs = [];
  let current = null;
  for (const line of workflow) {
    const header = /^ {2}(build-[\w-]+):\s*$/.exec(line);
    if (header) {
      current = { job: header[1], filter: null, dockerfile: null };
      jobs.push(current);
      continue;
    }
    if (!current) continue;
    const filter = /needs\.detect-changes\.outputs\.([\w-]+) == 'true'/.exec(line);
    if (filter && !current.filter) current.filter = filter[1];
    const file = /^\s+file: (\S+)\s*$/.exec(line);
    if (file && !current.dockerfile) current.dockerfile = file[1];
  }
  return jobs;
}

/** Welche Workspace-Pakete das Dockerfile in den Build-Kontext holt. */
function copiedPackages(dockerfile) {
  const full = join(ROOT, dockerfile);
  if (!existsSync(full)) return null;
  const names = new Set();
  for (const match of readFileSync(full, 'utf8').matchAll(/^COPY\s+packages\/([\w-]+)/gm)) {
    names.add(match[1]);
  }
  return names;
}

const filters = parseFilters();
const jobs = parseJobs();
const errors = [];
let checked = 0;

for (const { job, filter, dockerfile } of jobs) {
  if (!filter || !dockerfile) {
    errors.push(`${job}: ${!filter ? 'kein detect-changes-Filter' : 'kein file:'} erkennbar`);
    continue;
  }
  const packages = copiedPackages(dockerfile);
  if (packages === null) {
    errors.push(`${job}: ${dockerfile} existiert nicht`);
    continue;
  }
  const declared = filters.get(filter);
  if (!declared) {
    errors.push(`${job}: Filter "${filter}" ist in ${WORKFLOW} nicht definiert`);
    continue;
  }
  checked++;
  const watched = new Set(
    declared.map((p) => /^packages\/([\w-]+)\//.exec(p)?.[1]).filter((n) => n != null)
  );
  for (const name of [...packages].sort()) {
    if (!watched.has(name)) {
      errors.push(`${filter}: ${dockerfile} kopiert packages/${name}, der Filter beobachtet es nicht`);
    }
  }
}

if (errors.length > 0) {
  console.error('\n✖ Pfadfilter und Dockerfiles in build-images.yml driften auseinander:\n');
  for (const error of errors) console.error(`    ${error}`);
  console.error(
    `\nEine Änderung an einem nicht beobachteten Paket baut kein Image — sie landet` +
      `\nauf master und wird nie ausgeliefert, ohne dass ein Job rot wird. Entweder` +
      `\n'packages/<name>/**' in den Filter aufnehmen oder das COPY entfernen, wenn` +
      `\ndas Image das Paket gar nicht braucht.`
  );
  process.exit(1);
}

console.log(`✓ ${checked} Image-Pfadfilter decken ihre Dockerfile-Abhängigkeiten ab`);
