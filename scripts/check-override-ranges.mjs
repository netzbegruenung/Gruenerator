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
//
// ── Gelesen werden `dependencies` UND `peerDependencies` (auch optionale) ──
//
// Ein Bereich, den ein Paket als (optionale) peerDependency deklariert, ist
// derselbe Vertrag wie eine dependency — er stand hier nur nicht drin. Genau
// dort lag #2807: `mem0ai@3.1.6` deklariert `@qdrant/js-client-rest` als
// optionale peerDependency `^1.18.0`, und der Check sah den Bereich nie.
// pnpm warnt an dieser Stelle auch nicht, weil es nur UNERFÜLLTE peers meldet.
//
// Der Zusatz ist zugleich die einzige brauchbare Antwort auf „Bumps nach
// oben": sechs unbegrenzte `>=`-Overrides standen am 25.08.2026 auf einer
// höheren Major als ihre untere Schranke, und nur bei einem war das ein
// Fehler — `>=7.29.4` auf dem systemjs-Plugin hatte 8.0.1 in eine geschlossene
// 7er-Babel-Familie geholt. Sichtbar wurde genau dieser eine, weil er als
// einziger einen deklarierten Bereich nach UNTEN verletzte (peer
// `@babel/core: ^8.0.0` gegen installiertes 7.29.7). Das Override trägt
// seitdem `<8`. Die anderen fünf sind gewollte Security-Bumps.
//
// ── Was dieser Check NICHT sehen kann ──
//
// Die zweite Hälfte von #2807 bleibt unsichtbar, und zwar bauartbedingt: dort
// lag die installierte Version IM Bereich (`1.19.0` erfüllt `^1.18.0`) und
// brach trotzdem die API — `QdrantClient.search()` war ersatzlos weg. „Im
// Bereich" ist der Normalfall; ein Versionsvergleich kann das nicht von einem
// gesunden Zustand unterscheiden. Der Vergleich umzudrehen hilft nicht: über
// den ganzen Baum gemessen liegen 83 installierte Versionen ÜBER dem, was ein
// Abhängiger deklariert, und nahezu alle davon sind unsere eigenen,
// beabsichtigten Security-Bumps.
//
// Diese Ausfallart fängt nur ein Rauchtest, der den echten Fremdcode gegen das
// echte Objekt fährt — Vorbild: `apps/api/services/mem0/qdrantSearchCompat.vitest.ts`
// (seit #2810), inklusive Kanarienvogel auf dem installierten Client.
//
// Die Nähte, an denen wir einem Fremdpaket ein lebendes Objekt hereinreichen,
// auf dem es dann Methoden ruft (erhoben am 25.08.2026):
//   1. mem0ai ← `@qdrant/js-client-rest`-Client  (services/mem0/config.ts,
//      optionaler peer `^1.18.0`) — der Fall von #2807, mit Rauchtest gedeckt.
//   2. mem0ai ← `LiteLLMAdapter` / `MistralEmbeddingsAdapter` (dieselbe Datei,
//      `provider: 'langchain'`). Handgeschriebene, nicht von einer
//      LangChain-Basisklasse abgeleitete Attrappen: ruft mem0 eine Methode
//      mehr, gibt es keinen Compiler, der das meldet. Ungedeckt.
//   3. @better-auth/drizzle-adapter ← drizzle-Instanz (config/betterAuth.ts),
//      optionaler peer `drizzle-orm ^0.45.2` — Caret auf 0.x, also minor-eng.
//   4. drizzle-orm ← `pg`-Pool (database/services/DrizzleService.ts),
//      optionaler peer `pg >=8` — nach oben offen, die gleiche Bauform wie 1.
// Wer eine fünfte baut, gehört in diese Liste.
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
  // peerDependencies zuerst, damit eine gleichnamige dependency gewinnt: wer
  // beides deklariert, meint den engeren dependency-Bereich.
  const declared = { ...(manifest.peerDependencies ?? {}), ...(manifest.dependencies ?? {}) };
  const isPeer = (name) =>
    name in (manifest.peerDependencies ?? {}) && !(name in (manifest.dependencies ?? {}));
  for (const target of targets) {
    const range = declared[target];
    if (!range || !semver.validRange(range)) continue;
    const installed = resolveFrom(dir, target);
    if (!installed || !semver.ltr(installed, range)) continue;
    if (!violations.has(target)) violations.set(target, []);
    violations.get(target).push({
      dependent: `${manifest.name ?? dir}@${manifest.version ?? '?'}`,
      dependentName: manifest.name ?? null,
      kind: isPeer(target) ? 'peer' : 'dep',
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
    for (const hit of hits)
      console.error(
        `    ${hit.dependent} braucht ${hit.range}${hit.kind === 'peer' ? ' (peerDependency)' : ''}`
      );
    console.error(`    → Override auf einen Bereich heben, der ${needed} erfüllt.`);
    // Der Abhängige kann selbst override-erzwungen sein — dann ist das Heben
    // des Ziels der falsche Weg herum. So lag der Babel-Fall: ein unbegrenztes
    // `>=7.29.4` auf dem systemjs-Plugin holte 8.0.1 in eine 7er-Familie.
    for (const forced of [...new Set(hits.map((h) => h.dependentName))]) {
      if (forced && forced in overrides)
        console.error(
          `    ⚠ ${forced} steht selbst in den overrides ("${overrides[forced]}") —` +
            ` prüfe erst, ob DIESES Override zu weit nach oben reicht.`
        );
    }
  }
  console.error(
    '\nEin Override, der unter den geforderten Bereich zurückfällt, bricht erst' +
      '\nbeim Bundeln ab (fehlender Export). Overrides einer Paketfamilie immer' +
      '\ngemeinsam heben.'
  );
  process.exit(1);
}

console.log(
  `✓ Overrides erfüllen die deklarierten Bereiche in dependencies und peerDependencies` +
    ` (${targets.length} Pakete geprüft)`
);
