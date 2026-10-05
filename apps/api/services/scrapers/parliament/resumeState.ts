/**
 * Fortsetzungsstand einer Erstbefüllung als JSON-Datei. Die Versionsnummer
 * schützt davor, einen Stand mit anderer Bauform weiterzulesen.
 */

import fs from 'node:fs';

export function loadResumeState<T extends { version: number }>(statePath: string, empty: T): T {
  if (!fs.existsSync(statePath)) return empty;
  const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8')) as T;
  if (parsed.version !== empty.version) {
    throw new Error(
      `State file ${statePath} has version ${parsed.version}, expected ${empty.version}`
    );
  }
  return parsed;
}

/** Erst in eine Nachbardatei, dann umbenennen — ein Abbruch mitten im Schreiben lässt den alten Stand stehen. */
export function saveResumeState(statePath: string, state: unknown): void {
  const tmp = `${statePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, statePath);
}
