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
//   um EXTRA Zeilen erweitert, als Text aus dem Head-Commit. Der Diff selbst
//   zeigt nur drei Kontextzeilen; wer nur ihn las, deckt die Fenster nicht.
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
// Ausgabe: die gesehenen Dateien, eine je Zeile.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const EXTRA = 5;

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
 * @param {Array} execution   claude-execution-output.json
 * @param {Array<{file: string, patch: string | null, deletions: number}>} patches
 * @param {(file: string) => string | null} headText   Dateiinhalt im Head-Commit
 * @param {string} workspace  Präfix, das von Read-Pfaden abgestreift wird
 */
export function openedFiles(execution, patches, headText, workspace = '') {
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

  const opened = [];
  for (const { file, patch, deletions } of patches) {
    if (patch == null) {
      if (readPaths.has(file)) opened.push(file);
      continue;
    }
    if (deletions === 0) {
      const added = patch
        .split('\n')
        .filter((l) => l.startsWith('+'))
        .map((l) => l.slice(1));
      if (shown(added, lines)) {
        opened.push(file);
        continue;
      }
    }
    const text = headText(file);
    if (text == null) continue;
    const fileLines = text.split('\n');
    const all = windows(patch, fileLines.length).every(([a, b]) =>
      shown(fileLines.slice(a - 1, b), lines)
    );
    if (all) opened.push(file);
  }
  return opened.sort();
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
  for (const file of openedFiles(execution, patches, headText, workspace)) console.log(file);
}
