#!/usr/bin/env node
// Ein Image wird nur gebaut, wenn `dorny/paths-filter` in build-images.yml eine
// seiner Pfad-Regeln getroffen sieht. Kopiert das Dockerfile etwas, das dort
// nicht steht, dann landet eine Änderung an genau dieser Datei auf master, der
// Workflow läuft — und baut nichts. Die Änderung ist gemergt und wird nie
// ausgeliefert; es gibt keinen roten Job, der das meldet.
//
// Gemessen am 02.08.2026: `packages/query` fehlte in ALLEN Filtern, obwohl vier
// Dockerfiles es kopieren; `contracts` fehlte in vier von fünf. Am 16.09.2026
// kamen drei Image-Brüche an einem Tag aus `pnpm-workspace.yaml`, das in keinem
// Filter stand (#3389). Geprüft wird deshalb jede COPY-Quelle, nicht nur Pakete.
//
// Die Trigger sind eine zweite, unabhängige Schicht: ein Pfad, den nur der
// Filter kennt, startet den Workflow nie; einer, den nur der Trigger kennt,
// ergibt einen grünen Lauf, der nichts gebaut hat. Beides wird mitgeprüft.
//
// Zuordnung Job → Dockerfile → Filter wird aus dem Workflow selbst gelesen,
// damit hier keine zweite Liste entsteht, die ihrerseits driften kann.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const WORKFLOW = '.github/workflows/build-images.yml';
const workflow = readFileSync(join(ROOT, WORKFLOW), 'utf8').split('\n');

/** paths-filter-Glob → RegExp; hier kommen nur `**` und `*` vor. */
function globToRegExp(glob) {
  const source = glob
    .split(/(\*\*\/?|\*)/)
    .map((part) => {
      if (part === '**/') return '(?:.*/)?';
      if (part === '**') return '.*';
      if (part === '*') return '[^/]*';
      return part.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('');
  return new RegExp(`^${source}$`);
}

const matchesAny = (globs, path) => globs.some((g) => globToRegExp(g).test(path));

/** Die `filters: |`-Blockskalar aus dem detect-changes-Job: Schlüssel → Pfade, Anker aufgelöst. */
function parseFilters() {
  const start = workflow.findIndex((l) => /^\s+filters: \|\s*$/.test(l));
  if (start === -1) throw new Error(`${WORKFLOW}: kein "filters: |"-Block gefunden`);
  const filters = new Map();
  const anchors = new Map();
  let current = null;
  for (const line of workflow.slice(start + 1)) {
    const key = /^ {12}([\w-]+):(?:\s*&([\w-]+))?\s*$/.exec(line);
    if (key) {
      current = [];
      filters.set(key[1], current);
      if (key[2]) anchors.set(key[2], current);
      continue;
    }
    const path = /^ {14}- '(.+)'\s*$/.exec(line);
    if (path && current) {
      current.push(path[1]);
      continue;
    }
    const alias = /^ {14}- \*([\w-]+)\s*$/.exec(line);
    if (alias && current) {
      const target = anchors.get(alias[1]);
      if (!target) throw new Error(`${WORKFLOW}: Alias *${alias[1]} vor seinem Anker`);
      current.push(...target);
      continue;
    }
    if (line.trim() !== '') break; // Blockskalar endet an der ersten flacheren Zeile
  }
  return filters;
}

/** `paths:` eines Triggers (`push`, `pull_request`), leer wenn es ihn nicht gibt. */
function parseTriggerPaths(event) {
  const start = workflow.findIndex((l) => l === `  ${event}:`);
  if (start === -1) return [];
  const paths = [];
  let inPaths = false;
  for (const line of workflow.slice(start + 1)) {
    if (/^ {0,2}\S/.test(line)) break; // nächster Trigger
    const key = /^ {4}(\w+):/.exec(line);
    if (key) {
      inPaths = key[1] === 'paths';
      continue;
    }
    const path = /^ {6}- '(.+)'\s*$/.exec(line);
    if (inPaths && path) paths.push(path[1]);
  }
  return paths;
}

/** Jeder build-*-Job nennt Filter-Ergebnis, Dockerfile (`file:`) und Build-Kontext. */
function parseJobs() {
  const jobs = [];
  let current = null;
  for (const line of workflow) {
    const header = /^ {2}(build-[\w-]+):\s*$/.exec(line);
    if (header) {
      current = { job: header[1], filter: null, dockerfile: null, context: null };
      jobs.push(current);
      continue;
    }
    if (!current) continue;
    const filter = /needs\.detect-changes\.outputs\.([\w-]+) == 'true'/.exec(line);
    if (filter && !current.filter) current.filter = filter[1];
    const file = /^\s+file: (\S+)\s*$/.exec(line);
    if (file && !current.dockerfile) current.dockerfile = file[1];
    const context = /^\s+context: (\S+)\s*$/.exec(line);
    if (context && !current.context) current.context = context[1];
  }
  return jobs;
}

/** Was das Dockerfile aus dem Build-Kontext holt, als Repo-Pfade. */
function copiedSources(dockerfile, context) {
  const full = join(ROOT, dockerfile);
  if (!existsSync(full)) return null;
  const sources = new Set();
  for (const [, args] of readFileSync(full, 'utf8').matchAll(/^COPY\s+(.+)$/gm)) {
    if (/--from=|<</.test(args)) continue; // aus einer Stage bzw. Heredoc, nicht aus dem Kontext
    const tokens = args.split(/\s+/).filter((t) => t && !t.startsWith('--'));
    for (const source of tokens.slice(0, -1)) {
      const path = posix.normalize(posix.join(context, source)).replace(/\/$/, '');
      if (path !== '.') sources.add(path);
    }
  }
  return sources;
}

const filters = parseFilters();
const jobs = parseJobs();
const errors = [];
let checked = 0;

for (const { job, filter, dockerfile, context } of jobs) {
  if (!filter || !dockerfile || !context) {
    const missing = !filter ? 'detect-changes-Filter' : !dockerfile ? 'file:' : 'context:';
    errors.push(`${job}: kein ${missing} erkennbar`);
    continue;
  }
  const sources = copiedSources(dockerfile, context);
  if (sources === null) {
    errors.push(`${job}: ${dockerfile} existiert nicht`);
    continue;
  }
  const declared = filters.get(filter);
  if (!declared) {
    errors.push(`${job}: Filter "${filter}" ist in ${WORKFLOW} nicht definiert`);
    continue;
  }
  checked++;
  // Eine Verzeichnis-Quelle gilt als beobachtet, wenn ihr Inhalt es ist.
  for (const source of [...sources].sort()) {
    if (!matchesAny(declared, source) && !matchesAny(declared, `${source}/x`)) {
      errors.push(`${filter}: ${dockerfile} kopiert ${source}, der Filter beobachtet es nicht`);
    }
  }
}

// Schicht 2: der push-Trigger muss jeden Filterpfad starten können.
const imageGlobs = jobs.flatMap(({ filter }) => filters.get(filter) ?? []);
const pushPaths = parseTriggerPaths('push');
for (const glob of new Set(imageGlobs)) {
  const sample = glob.replace(/\*\*/g, 'x').replace(/\*/g, 'x');
  if (!matchesAny(pushPaths, sample)) {
    errors.push(`on.push.paths: startet den Workflow nicht für Filterpfad '${glob}'`);
  }
}

// Schicht 3: was den pull_request-Trigger auslöst, muss auch ein Image bauen.
const prPaths = parseTriggerPaths('pull_request');
if (prPaths.length > 0) {
  const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n');
  for (const file of tracked.filter((f) => f && matchesAny(prPaths, f))) {
    if (!matchesAny(imageGlobs, file)) {
      errors.push(
        `on.pull_request.paths: ${file} startet den Workflow, aber kein Image-Filter baut dafür`
      );
    }
  }
}

if (errors.length > 0) {
  console.error('\n✖ Trigger, Pfadfilter und Dockerfiles in build-images.yml driften auseinander:\n');
  for (const error of errors) console.error(`    ${error}`);
  console.error(
    `\nEine Änderung an einer nicht beobachteten Datei baut kein Image — sie landet` +
      `\nauf master und wird nie ausgeliefert, ohne dass ein Job rot wird. Entweder` +
      `\nden Pfad in Filter und Trigger aufnehmen oder das COPY entfernen, wenn` +
      `\ndas Image die Datei gar nicht braucht.`
  );
  process.exit(1);
}

console.log(`✓ ${checked} Image-Pfadfilter decken ihre Dockerfiles ab, Trigger passen dazu`);
