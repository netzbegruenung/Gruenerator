#!/usr/bin/env node
// Guard gegen Dependency Confusion (gemeldet 30.07.2026): keiner der
// `@gruenerator/*`-Namen ist auf der öffentlichen npm-Registry registriert.
// Solange jede interne Abhängigkeit `workspace:` spezifiziert, löst pnpm sie
// hart im Workspace auf und fragt die Registry nie — ein `^1.0.0` an einer
// einzigen Stelle würde dagegen genau dort landen, wo ein Angreifer den Namen
// belegen kann. `private: true` ist die zweite Hälfte: es macht ein
// versehentliches `npm publish` unmöglich, das denselben Namensraum aufmachen
// würde.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
// Spiegelt pnpm-workspace.yaml.
const GLOBS = ['apps/*', 'packages/*', 'services/hocuspocus', 'services/mcp', 'documentation'];

const manifests = [];
for (const glob of GLOBS) {
  const dirs = glob.endsWith('/*')
    ? readdirSync(join(ROOT, glob.slice(0, -2))).map((d) => `${glob.slice(0, -2)}/${d}`)
    : [glob];
  for (const dir of dirs) {
    const file = join(ROOT, dir, 'package.json');
    try {
      if (!statSync(file).isFile()) continue;
    } catch {
      continue;
    }
    manifests.push({ dir, pkg: JSON.parse(readFileSync(file, 'utf8')) });
  }
}

const DEP_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
const errors = [];

for (const { dir, pkg } of manifests) {
  if (pkg.private !== true) {
    errors.push(`${dir}/package.json (${pkg.name}): "private": true fehlt`);
  }
  for (const field of DEP_FIELDS) {
    for (const [name, spec] of Object.entries(pkg[field] ?? {})) {
      if (!name.startsWith('@gruenerator/')) continue;
      // peerDependencies werden nicht installiert, sondern nur deklariert —
      // dort ist ein Range korrekt und erreicht keine Registry.
      if (field === 'peerDependencies') continue;
      if (!String(spec).startsWith('workspace:')) {
        errors.push(`${dir}/package.json → ${field}.${name}: "${spec}" statt "workspace:*"`);
      }
    }
  }
}

if (errors.length > 0) {
  console.error('\n✖ Workspace-Pakete nicht gegen Dependency Confusion abgedichtet:\n');
  for (const error of errors) console.error(`    ${error}`);
  console.error(
    '\nInterne Pakete müssen `"private": true` sein und ausschließlich über' +
      '\n`workspace:*` referenziert werden — sonst kann die Auflösung auf der' +
      '\nöffentlichen npm-Registry landen, wo die @gruenerator-Namen frei sind.'
  );
  process.exit(1);
}

console.log(`✓ ${manifests.length} Workspace-Pakete privat und workspace-intern aufgelöst`);
