#!/usr/bin/env node
// Guard: ein `pnpm.overrides`-Eintrag ERSETZT den Bereich, den ein Paket selbst
// deklariert hat — pnpm prüft dabei nicht, ob die erzwungene Version diesen
// Bereich noch erfüllt. Bei regulären `dependencies` gibt es dafür auch keine
// Warnung (nur unerfüllte peerDependencies meldet pnpm).
//
// Daraus wird still roter master: die assistant-ui-Familie steht mit sechs
// Paketen in den overrides, Dependabot hebt `@assistant-ui/react`, die
// Unterpakete bleiben auf ihrem alten Pin stehen (der Caret erlaubt sie ja
// weiterhin) — und der Build bricht erst beim Bundeln ab:
//   [MISSING_EXPORT] "fileMatchesAccept" is not exported by
//   @assistant-ui/core/dist/internal.js
// (Juli 2026: react@0.14.29 braucht core ^0.2.23, das Override hielt 0.2.21.)
//
// Geprüft wird nur die eine Richtung, die immer ein Fehler ist: die erzwungene
// Version liegt UNTER dem geforderten Bereich. Nach oben zeigende Overrides
// sind hier Absicht (die Security-Bumps wie `undici: >=8.5.0` erzwingen
// bewusst eine höhere Major als die Abhängigen deklarieren).
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import semver from 'semver';

// REPO_ROOT wie in sync-pnpm-overrides.mjs: erlaubt, den Check gegen einen
// anderen Checkout laufen zu lassen.
const root = process.env.REPO_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

const rootPkg = readJson(join(root, 'package.json'));
const overrides = rootPkg.pnpm?.overrides ?? {};

// Overrides, die BEWUSST unter dem liegen, was Abhängige deklarieren. Nur diese
// drei — jeder weitere Eintrag hier braucht denselben Nachweis, dass der
// Rückstand gewollt und folgenlos ist, sonst gehört das Override gehoben.
const DELIBERATE = {
  zod: 'Der Workspace steht auf zod 3; wer zod 4 braucht, bekommt ein scoped Override (better-auth>zod).',
  '@expo/dom-webview':
    'Haengt an der Expo-SDK-Version, wird nur mit `npx expo install` bewegt (CLAUDE-expo.md).',
  'http-proxy-middleware':
    'Security-Pin auf der 2er-Linie; nur webpack-dev-server 6 (dev-only) fordert 4.',
};

// Overrides kennen Selektor-Formen, die kein reiner Paketname sind:
// `minimatch@<4`, `vite>esbuild`, `joi@>=17.0.0 <18.0.0`. Die zielen auf einen
// Teilbaum und lassen sich nicht gegen "die eine installierte Version" prüfen.
const isPlainName = (key) => {
  const rest = key.startsWith('@') ? key.slice(1) : key;
  return !rest.includes('@') && !rest.includes('>');
};
const targets = Object.keys(overrides).filter(
  (key) => isPlainName(key) && !(key in DELIBERATE)
);

// Node-Auflösung im (hoisted) Baum: erst das nested node_modules des
// Abhängigen, dann die Wurzel — mehr Ebenen gibt es hier nicht.
const resolveFrom = (dir, name) => {
  for (const base of [dir, root]) {
    const manifest = join(base, 'node_modules', name, 'package.json');
    if (existsSync(manifest)) return readJson(manifest).version;
  }
  return null;
};

const dependentDirs = [];
for (const pattern of rootPkg.workspaces ?? []) {
  if (pattern.endsWith('/*')) {
    const parent = join(root, pattern.slice(0, -2));
    if (!existsSync(parent)) continue;
    for (const entry of readdirSync(parent)) {
      if (existsSync(join(parent, entry, 'package.json')))
        dependentDirs.push(join(parent, entry));
    }
  } else if (existsSync(join(root, pattern, 'package.json'))) {
    dependentDirs.push(join(root, pattern));
  }
}

const nodeModules = join(root, 'node_modules');
if (!existsSync(nodeModules)) {
  console.error('✖ node_modules fehlt — dieser Check läuft nach `pnpm install`.');
  process.exit(1);
}
for (const entry of readdirSync(nodeModules)) {
  if (entry.startsWith('.')) continue;
  if (entry.startsWith('@')) {
    for (const scoped of readdirSync(join(nodeModules, entry))) {
      if (existsSync(join(nodeModules, entry, scoped, 'package.json')))
        dependentDirs.push(join(nodeModules, entry, scoped));
    }
  } else if (existsSync(join(nodeModules, entry, 'package.json'))) {
    dependentDirs.push(join(nodeModules, entry));
  }
}

// target -> Array<{ dependent, range, installed }>
const violations = new Map();

for (const dir of dependentDirs) {
  let manifest;
  try {
    manifest = readJson(join(dir, 'package.json'));
  } catch {
    continue;
  }
  const deps = manifest.dependencies ?? {};
  for (const target of targets) {
    const range = deps[target];
    if (!range || !semver.validRange(range)) continue;
    const installed = resolveFrom(dir, target);
    if (!installed || !semver.ltr(installed, range)) continue;
    if (!violations.has(target)) violations.set(target, []);
    violations.get(target).push({
      dependent: `${manifest.name ?? dir}@${manifest.version ?? '?'}`,
      range,
      installed,
    });
  }
}

if (violations.size > 0) {
  for (const [target, hits] of violations) {
    const needed = [...new Set(hits.map((h) => h.range))].join(', ');
    console.error(
      `\n✖ pnpm.overrides["${target}"] = "${overrides[target]}" hält ${target}@${hits[0].installed} fest,` +
        ` unter dem, was Abhängige fordern:`
    );
    for (const hit of hits) console.error(`    ${hit.dependent} braucht ${hit.range}`);
    console.error(`    → Override auf einen Bereich heben, der ${needed} erfüllt.`);
  }
  console.error(
    '\nEin Override, der unter den geforderten Bereich zurückfällt, bricht erst' +
      '\nbeim Bundeln ab (fehlender Export). Overrides einer Paketfamilie immer' +
      '\ngemeinsam heben.'
  );
  process.exit(1);
}

console.log(`✓ Overrides erfüllen die deklarierten Bereiche (${targets.length} Pakete geprüft)`);
