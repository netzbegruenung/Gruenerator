#!/usr/bin/env node
// Welche geänderten Dateien hat der Claude-Review wirklich gesehen?
//
// Bis #4854 zählte das Gate in pr-review.yml Werkzeugnamen: `Read` auf die
// Datei, oder `Grep` mit `output_mode: content`. Las der Lauf dieselbe Datei
// per `cat`, `sed -n` oder `git log -p`, galt sie als ungeöffnet — und ein
// `Read` mit `offset`/`limit` zählte, auch wenn er am geänderten Code
// vorbeiging. Hier zählt stattdessen, was in den Werkzeugergebnissen steht:
//
// - Jede Datei hat Fenster: der neue Bereich jedes Hunks, nach beiden Seiten
//   um EXTRA Zeilen erweitert, als Text aus dem Head-Commit. Ein Diff mit
//   den üblichen drei Kontextzeilen deckt die Fenster nicht; einer mit
//   DIFF_CONTEXT Zeilen deckt sie (#5691). Der Prompt in pr-review.yml
//   verlangt deshalb `git diff -U<n>`, und der Test hält n >= DIFF_CONTEXT.
// - Ein Fenster gilt als gesehen, wenn seine nicht-leeren Zeilen in den
//   Werkzeugergebnissen in dieser Reihenfolge vorkommen — über alle
//   Ergebnisse in Aufrufreihenfolge hinweg, damit ein in Stücken gelesenes
//   Fenster zählt. Zeilennummern von Read, `cat -n` und `grep -n` und das
//   Diff-Zeichen am Zeilenanfang werden dafür abgestreift.
// - Eine Datei zählt, wenn alle ihre Fenster gesehen wurden.
// - Reine Ergänzungen (#4839) zählen außerdem, wenn ihre `+`-Zeilen
//   vollständig gezeigt wurden: dort zeigt der Diff alles, was es gibt.
// - Ohne Patch (Binärdatei, zu großer Diff) bleibt nur der alte Weg: ein
//   `Read` auf genau diese Datei.
//
// Ein Lauf, der anders liest, als hier vorgesehen, wird abgelehnt, nicht
// durchgewunken — die Fehlerrichtung bleibt ein falsches Rot.
//
// Aufruf: review-read-gate.mjs <execution.json> <patches.json> <head-sha> [workspace]
// Ausgabe: die gesehenen Dateien, eine je Zeile. Auf stderr steht je nicht
// gesehener Datei, welches Fenster fehlte — ohne das blieb bei einem roten
// Gate nur die Zahl (#5691).

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const EXTRA = 5;

/**
 * So viele Kontextzeilen braucht ein Diff, damit er allein die Fenster deckt:
 * die Hunks der GitHub-API tragen schon drei, EXTRA kommt obendrauf.
 */
export const DIFF_CONTEXT = EXTRA + 3;

const READ_PREFIX = /^\s*\d+(\t|→)/;
const GREP_PREFIX = /^(?:.*?[:-])?\d+[:-]/;

/** Alle Lesarten einer Ausgabezeile, auf die eine Fensterzeile passen darf. */
function readings(line) {
  const out = new Set([line.trim()]);
  for (const stripped of [line.replace(READ_PREFIX, ''), line.replace(GREP_PREFIX, '')]) {
    out.add(stripped.trim());
  }
  for (const s of [...out]) {
    if (s.startsWith('+')) out.add(s.slice(1).trim());
  }
  // Diff-Kontextzeilen tragen ein führendes Leerzeichen; trim() hat es schon.
  return out;
}

/** Tool-Ergebnisse in Aufrufreihenfolge, als Liste von Lesarten je Zeile. */
export function resultLines(execution) {
  const lines = [];
  for (const entry of execution) {
    if (entry.type !== 'user') continue;
    for (const part of entry.message?.content ?? []) {
      if (part?.type !== 'tool_result') continue;
      const text =
        typeof part.content === 'string'
          ? part.content
          : (part.content ?? []).map((c) => c?.text ?? '').join('\n');
      for (const line of text.split('\n')) lines.push(readings(line));
    }
  }
  return lines;
}

/**
 * Kommen die nicht-leeren `wanted`-Zeilen in `lines` in dieser Reihenfolge vor?
 * Ohne eine einzige nicht-leere Zeile gibt es nichts, was ein Ergebnis gezeigt
 * haben könnte — das ist kein Beleg, also nein (sonst zählte ein Patch aus
 * Leerzeilen ohne einen Werkzeugaufruf).
 */
export function shown(wanted, lines) {
  const need = wanted.map((l) => l.trim()).filter(Boolean);
  if (need.length === 0) return false;
  let i = 0;
  for (const r of lines) {
    if (i === need.length) break;
    if (r.has(need[i])) i++;
  }
  return i === need.length;
}

/** Neue Zeilenbereiche der Hunks, um EXTRA erweitert, zusammengelegt, 1-basiert. */
export function windows(patch, lineCount) {
  const ranges = [];
  for (const m of patch.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
    const start = Number(m[1]);
    const len = m[2] === undefined ? 1 : Number(m[2]);
    // Ein reiner Lösch-Hunk (`+c,0`) steht hinter Zeile c.
    const from = len === 0 ? start + 1 : start;
    const to = len === 0 ? start : start + len - 1;
    ranges.push([Math.max(1, from - EXTRA), Math.min(lineCount, to + EXTRA)]);
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const r of ranges) {
    const last = merged.at(-1);
    if (last && r[0] <= last[1] + 1) last[1] = Math.max(last[1], r[1]);
    else merged.push([...r]);
  }
  return merged.filter(([a, b]) => a <= b);
}

/**
 * Je Datei: gesehen oder nicht, und wenn nicht, woran es lag.
 *
 * @param {Array} execution   claude-execution-output.json
 * @param {Array<{file: string, patch: string | null, deletions: number}>} patches
 * @param {(file: string) => string | null} headText   Dateiinhalt im Head-Commit
 * @param {string} workspace  Präfix, das von Read-Pfaden abgestreift wird
 * @returns {Array<{file: string, seen: boolean, reason: string}>}
 */
export function coverage(execution, patches, headText, workspace = '') {
  const lines = resultLines(execution);
  const readPaths = new Set();
  for (const entry of execution) {
    if (entry.type !== 'assistant') continue;
    for (const part of entry.message?.content ?? []) {
      if (part?.type === 'tool_use' && part.name === 'Read' && part.input?.file_path) {
        readPaths.add(part.input.file_path.replace(`${workspace}/`, ''));
      }
    }
  }

  return patches.map(({ file, patch, deletions }) => {
    if (patch == null) {
      const seen = readPaths.has(file);
      return { file, seen, reason: seen ? 'Read' : 'kein Patch und kein Read auf die Datei' };
    }
    if (deletions === 0) {
      const added = patch
        .split('\n')
        .filter((l) => l.startsWith('+'))
        .map((l) => l.slice(1));
      if (shown(added, lines)) return { file, seen: true, reason: 'reine Ergänzung im Diff' };
    }
    const text = headText(file);
    if (text == null) return { file, seen: false, reason: 'im Head-Commit nicht lesbar' };
    const fileLines = text.split('\n');
    const all = windows(patch, fileLines.length);
    const missing = all.filter(([a, b]) => !shown(fileLines.slice(a - 1, b), lines));
    if (missing.length === 0) return { file, seen: true, reason: 'alle Fenster' };
    const [a, b] = missing[0];
    return {
      file,
      seen: false,
      reason: `${all.length - missing.length} von ${all.length} Fenstern gesehen, es fehlt Zeile ${a}–${b}`,
    };
  });
}

export function openedFiles(execution, patches, headText, workspace = '') {
  return coverage(execution, patches, headText, workspace)
    .filter((c) => c.seen)
    .map((c) => c.file)
    .sort();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [execPath, patchesPath, headSha, workspace = ''] = process.argv.slice(2);
  const execution = JSON.parse(readFileSync(execPath, 'utf8'));
  const patches = JSON.parse(readFileSync(patchesPath, 'utf8'));
  const headText = (file) => {
    try {
      return execFileSync('git', ['show', `${headSha}:${file}`], {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch (err) {
      console.error(`::warning::${file} nicht im Head-Commit ${headSha} lesbar: ${err.message}`);
      return null;
    }
  };
  const report = coverage(execution, patches, headText, workspace);
  for (const c of report) if (!c.seen) console.error(`nicht gesehen: ${c.file} — ${c.reason}`);
  for (const file of report
    .filter((c) => c.seen)
    .map((c) => c.file)
    .sort())
    console.log(file);
}
