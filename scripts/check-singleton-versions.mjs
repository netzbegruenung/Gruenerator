#!/usr/bin/env node
// Guard: React-context-basierte Pakete müssen im Web-Bundle genau einmal
// existieren. Zwei Versionen im Lockfile = zwei Modul-Instanzen = zwei
// Contexts → Laufzeitfehler wie "No QueryClient set" (beta, Juli 2026),
// den weder typecheck noch build fängt. Der Check vergleicht die von den
// Workspace-Importern DIREKT aufgelösten Versionen (nicht das ganze
// Lockfile — transitive Kopien in Fremdlibs sind meist harmlos).
import { readFileSync } from 'node:fs';

const SINGLETONS = [
  'react',
  'react-dom',
  '@tanstack/react-query',
  '@tanstack/react-table',
  '@assistant-ui/react',
  '@assistant-ui/core',
  '@assistant-ui/store',
  '@tiptap/core',
  '@blocknote/core',
  '@hocuspocus/provider',
  'zustand',
  'jotai',
  'yjs',
];

// Expo-Apps bundeln separat via Metro und pinnen react exakt auf die
// SDK-Version (siehe CLAUDE.md) — Abweichungen dort sind gewollt.
const EXCLUDED_IMPORTERS = ['apps/mobile', 'apps/docs-expo'];

const lock = readFileSync(new URL('../pnpm-lock.yaml', import.meta.url), 'utf8');

const importersSection = lock.slice(
  lock.indexOf('\nimporters:'),
  lock.indexOf('\npackages:')
);

// pkg -> version -> Set<importer>
const seen = new Map();
let importer = null;
let pendingPkg = null;

for (const line of importersSection.split('\n')) {
  const impMatch = line.match(/^ {2}([\w@./-]+):$/);
  if (impMatch) {
    importer = impMatch[1];
    pendingPkg = null;
    continue;
  }
  if (!importer || EXCLUDED_IMPORTERS.includes(importer)) continue;

  const depMatch = line.match(/^ {6}'?([^':]+)'?:$/);
  if (depMatch) {
    pendingPkg = SINGLETONS.includes(depMatch[1]) ? depMatch[1] : null;
    continue;
  }
  if (pendingPkg) {
    const verMatch = line.match(/^ {8}version: ([^(\s]+)/);
    if (verMatch) {
      const version = verMatch[1];
      if (!version.startsWith('link:')) {
        if (!seen.has(pendingPkg)) seen.set(pendingPkg, new Map());
        const byVersion = seen.get(pendingPkg);
        if (!byVersion.has(version)) byVersion.set(version, new Set());
        byVersion.get(version).add(importer);
      }
      pendingPkg = null;
    }
  }
}

let failed = false;
for (const [pkg, byVersion] of seen) {
  if (byVersion.size > 1) {
    failed = true;
    console.error(`\n✖ ${pkg} wird in mehreren Versionen aufgelöst:`);
    for (const [version, importers] of byVersion) {
      console.error(`    ${version}  ←  ${[...importers].join(', ')}`);
    }
  }
}

if (failed) {
  console.error(
    '\nSingleton-Pakete müssen workspace-weit auf EINE Version auflösen.' +
      '\nFix: Version in pnpm.overrides (root package.json) pinnen und' +
      ' `pnpm install` laufen lassen (siehe @tanstack/react-query dort).'
  );
  process.exit(1);
}

console.log(`✓ Singleton-Versionen konsistent (${seen.size} Pakete geprüft)`);
