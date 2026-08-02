#!/usr/bin/env node
// Ratchet: Fehler im Chat-Code dürfen nicht verschluckt werden. Ein
// `catch {}` / `.catch(() => null)` macht einen Ausfall ununterscheidbar von
// "nichts gefunden" — der Turn sieht erfolgreich aus, das Artefakt fehlt
// kommentarlos (siehe PR-Serie "silent error swallows", Juli 2026).
//
// Der Check zählt die Muster gegen eine eingecheckte Baseline: die Zahl darf
// sinken, nie steigen. Bewusste Ausnahmen (Telemetrie, Cleanup, best-effort
// Caches) mit `// swallow-ok: <Grund>` in derselben oder der Zeile davor
// markieren — die werden nicht gezählt.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const BASELINE_PATH = join(ROOT, 'scripts/silent-swallows-baseline.json');

const SCANNED_DIRS = [
  'apps/api/routes/chat',
  'apps/api/agents/langgraph',
  'packages/chat/src',
];

// Muster, die einen Fehler ohne Signal verwerfen.
const PATTERNS = [
  { name: 'empty-catch', re: /catch\s*(\([^)]*\))?\s*\{\s*\}/g },
  { name: 'catch-noop-arrow', re: /\.catch\(\s*\(\s*[^)]*\)\s*=>\s*\{\s*\}\s*\)/g },
  { name: 'catch-returns-null', re: /\.catch\(\s*\(\s*[^)]*\)\s*=>\s*null\s*\)/g },
  { name: 'catch-returns-empty-array', re: /\.catch\(\s*\(\s*[^)]*\)\s*=>\s*\[\s*\]\s*\)/g },
];

const SKIP_FILE = /\.(vitest|test|spec|stories)\.[tj]sx?$/;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    // stat folgt Symlinks. In apps/mobile/ios/Pods stehen CocoaPods-Symlinks
    // nach node_modules; zeigt einer ins Leere, warf der Lauf bisher ENOENT und
    // brach ab — lokal rot, in der CI grün, weil ios/ dort gitignored ist.
    // Gültige Symlinks sollen weiter verfolgt werden, tote nur übersprungen.
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, out);
    else if (/\.[tj]sx?$/.test(entry) && !SKIP_FILE.test(entry)) out.push(full);
  }
  return out;
}

function countFile(path) {
  const source = readFileSync(path, 'utf8');
  const lines = source.split('\n');
  let count = 0;
  const hits = [];

  for (const { name, re } of PATTERNS) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(source)) !== null) {
      const lineNo = source.slice(0, match.index).split('\n').length;
      const own = lines[lineNo - 1] ?? '';
      const prev = lines[lineNo - 2] ?? '';
      if (/swallow-ok:/.test(own) || /swallow-ok:/.test(prev)) continue;
      count++;
      hits.push({ line: lineNo, pattern: name });
    }
  }
  return { count, hits };
}

const counts = {};
const details = [];
for (const dir of SCANNED_DIRS) {
  for (const file of walk(join(ROOT, dir))) {
    const { count, hits } = countFile(file);
    if (count === 0) continue;
    const rel = relative(ROOT, file);
    counts[rel] = count;
    for (const hit of hits) details.push(`${rel}:${hit.line} (${hit.pattern})`);
  }
}

const total = Object.values(counts).reduce((a, b) => a + b, 0);

if (process.argv.includes('--update-baseline')) {
  writeFileSync(BASELINE_PATH, `${JSON.stringify({ total, files: counts }, null, 2)}\n`);
  console.log(`Baseline aktualisiert: ${total} Swallows in ${Object.keys(counts).length} Dateien.`);
  process.exit(0);
}

let baseline;
try {
  baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
} catch {
  console.error(
    `Baseline fehlt (${relative(ROOT, BASELINE_PATH)}). Erzeugen mit:\n  node scripts/check-silent-swallows.mjs --update-baseline`
  );
  process.exit(1);
}

if (total > baseline.total) {
  const added = Object.entries(counts).filter(([f, c]) => c > (baseline.files[f] ?? 0));
  console.error(`❌ Neue verschluckte Fehler: ${total} (Baseline ${baseline.total}).\n`);
  for (const [file, count] of added) {
    console.error(`  ${file}: ${count} (vorher ${baseline.files[file] ?? 0})`);
  }
  console.error(
    '\nFehler müssen sichtbar werden — je nach Ebene:\n' +
      '  Backend  : sendChatWarning(sse, <code>) bzw. sseInternalError(sse, err)\n' +
      '  Tool-Loop: toolErrorResult(message, expected) — das Modell korrigiert sich selbst\n' +
      '  Frontend : notifyError()/notifyWarning() oder errorStatus() am Message-Yield\n' +
      '\nBewusste Ausnahme? Mit `// swallow-ok: <Grund>` markieren.\n' +
      'Baseline nach Aufräumen senken: node scripts/check-silent-swallows.mjs --update-baseline'
  );
  process.exit(1);
}

if (total < baseline.total) {
  console.log(
    `✅ ${baseline.total - total} Swallow(s) weniger als in der Baseline (${total} < ${baseline.total}).\n` +
      '   Baseline senken: node scripts/check-silent-swallows.mjs --update-baseline'
  );
} else {
  console.log(`✅ Keine neuen verschluckten Fehler (${total}, Baseline ${baseline.total}).`);
}
