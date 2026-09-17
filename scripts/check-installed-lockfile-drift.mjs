#!/usr/bin/env node
// Guard: node_modules muss das sein, was pnpm-lock.yaml sagt.
//
// Alle anderen Dependency-Checks hier vergleichen DEKLARATIONEN miteinander —
// Manifest gegen Lockfile (sync-pnpm-overrides), Override gegen deklarierten
// Bereich (check-override-ranges), Lockfile gegen sich selbst
// (check-singleton-versions). Keiner sieht den installierten Baum. Genau dort
// lag der Ausfall vom 17.09.2026: das Lockfile war korrekt und jeder Check
// gruen, waehrend in node_modules die halbe @assistant-ui-Familie eine
// Patch-Version zu hoch stand. Vier jsdom-Suiten in packages/chat starben mit
//   SyntaxError: The requested module 'assistant-cloud' does not provide an
//   export named 'createRunReport'
// weil `@assistant-ui/core@0.3.18` (Lockfile: 0.3.16) den Export aus
// `assistant-cloud@^0.2.0` zieht, der Baum aber 0.1.42 trug.
//
// Wie ein Baum von seinem Lockfile abkommt: `node-linker=hoisted` (.npmrc)
// legt EINEN flachen Baum an, und die Worktrees teilen ihn sich. Ein Install
// aus einem Worktree auf einem anderen Branch schreibt damit die Versionen des
// FREMDEN Manifests in dieses node_modules. Verraeterisch ist
// `node_modules/.pnpm/lock.yaml` — pnpms Mitschrift des zuletzt installierten
// Lockfiles. Weicht sie von pnpm-lock.yaml ab, war ein fremder Install hier.
//
// Der Haken, der die Reparatur verzoegert: `pnpm install` merkt das NICHT.
// pnpm 10 cached den Workspace-Zustand in `node_modules/.pnpm-workspace-state.json`
// und meldet danach "Already up to date" in ~130 ms — auch mit --force, und
// auch wenn Pakete physisch fehlen (am 17.09.2026 gemessen: der Zustand war
// von master's pnpm@12.4.2 geschrieben, der aeltere Branch lief mit pnpm@10.0.0
// und konnte ihn nicht lesen). Erst das Loeschen
// dieser Datei erzwingt einen echten Install:
//   rm node_modules/.pnpm-workspace-state.json && pnpm install --frozen-lockfile
//
// Geprueft werden die DIREKTEN Abhaengigkeiten der Workspace-Importer (628 am
// 17.09.2026) gegen die im Lockfile aufgeloeste Version — exakter Vergleich,
// kein Bereich. Auf einem sauber installierten Baum ist das per Bauart still;
// ein Treffer ist immer ein echter Befund, nie Rauschen.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.env.REPO_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

const nodeModules = join(root, 'node_modules');
if (!existsSync(nodeModules)) {
  console.error('✖ node_modules fehlt — dieser Check läuft nach `pnpm install`.');
  process.exit(1);
}

const lock = readFileSync(join(root, 'pnpm-lock.yaml'), 'utf8');
// Seit `packageManager: pnpm@12` traegt das Lockfile ZWEI `importers:`-Bloecke:
// der erste ist pnpms Selbstverwaltung der eigenen Binary (einziger Importer
// `.` mit `packageManagerDependencies`), der echte Workspace kommt danach.
// Deshalb der LETZTE `importers:` und das `packages:`, das ihm folgt — wie in
// check-singleton-versions.mjs.
const importersStart = lock.lastIndexOf('\nimporters:');
const importersSection = lock.slice(importersStart, lock.indexOf('\npackages:', importersStart));

// importer -> Map<paket, aufgeloeste Version>. Der Peer-Suffix hinter der
// Version ("1.2.3(react@19.2.8)") benennt die Variante, nicht die Version.
const wanted = new Map();
let importer = null;
let pendingPkg = null;
for (const line of importersSection.split('\n')) {
  const impMatch = line.match(/^ {2}([\w@./-]+):$/);
  if (impMatch) {
    importer = impMatch[1];
    wanted.set(importer, new Map());
    pendingPkg = null;
    continue;
  }
  if (!importer) continue;
  const depMatch = line.match(/^ {6}'?([^':]+)'?:$/);
  if (depMatch) {
    pendingPkg = depMatch[1];
    continue;
  }
  const verMatch = line.match(/^ {8}version: (.+)$/);
  if (verMatch && pendingPkg) {
    const version = verMatch[1].trim().replace(/^'|'$/g, '').split('(')[0];
    // `link:`/`file:`-Eintraege (Workspace-Pakete) tragen keine Version.
    if (/^\d/.test(version)) wanted.get(importer).set(pendingPkg, version);
    pendingPkg = null;
  }
}

// Node-Aufloesung im hoisted Baum: erst das nested node_modules des
// Importers, dann die Wurzel — mehr Ebenen gibt es hier nicht.
const resolveFrom = (dir, name) => {
  for (const base of [dir, root]) {
    const manifest = join(base, 'node_modules', name, 'package.json');
    if (existsSync(manifest)) {
      try {
        return readJson(manifest).version;
      } catch {
        return null;
      }
    }
  }
  return null;
};

const mismatches = [];
const missing = [];
let checked = 0;

for (const [name, deps] of wanted) {
  const dir = name === '.' ? root : join(root, name);
  if (!existsSync(join(dir, 'package.json'))) continue;
  for (const [pkg, wantVersion] of deps) {
    const installed = resolveFrom(dir, pkg);
    if (installed === null) {
      missing.push({ importer: name, pkg, wantVersion });
      continue;
    }
    checked += 1;
    if (installed !== wantVersion) {
      mismatches.push({ importer: name, pkg, wantVersion, installed });
    }
  }
}

if (mismatches.length === 0 && missing.length === 0) {
  console.log(`✔ node_modules deckt sich mit dem Lockfile (${checked} direkte Abhängigkeiten).`);
  process.exit(0);
}

for (const hit of missing) {
  console.error(
    `\n✖ ${hit.pkg} fehlt in node_modules — ${hit.importer} braucht ${hit.wantVersion} laut Lockfile.`
  );
}
for (const hit of mismatches) {
  console.error(
    `\n✖ ${hit.pkg}@${hit.installed} installiert, Lockfile sagt ${hit.wantVersion}` +
      `\n    Importer: ${hit.importer}`
  );
}

const stateLock = join(nodeModules, '.pnpm', 'lock.yaml');
if (existsSync(stateLock) && readFileSync(stateLock, 'utf8') !== lock) {
  console.error(
    '\n⚠ node_modules/.pnpm/lock.yaml weicht von pnpm-lock.yaml ab: dieser Baum' +
      '\n  wurde zuletzt aus einem ANDEREN Lockfile installiert (fremder Worktree).'
  );
}

console.error(
  '\nEin Baum, der nicht zum Lockfile passt, faellt nicht beim Install auf,' +
    '\nsondern erst beim Laden eines Moduls (fehlender Export). `pnpm install`' +
    '\nmeldet hier "Already up to date" — auch mit --force. Reparatur:' +
    '\n  rm node_modules/.pnpm-workspace-state.json && pnpm install --frozen-lockfile'
);
process.exit(1);
