/**
 * Die Originaldatei einer hochgeladenen Quelle, aufbewahrt für „Herunterladen".
 *
 * Der Ingest liest die Datei aus `uploads/pending` (dort räumt der
 * Uploads-Sweeper nach 7 Tagen ab) und verschiebt sie danach hierher.
 * `documents.file_path` hält den Pfad RELATIV zu diesem Verzeichnis
 * (`<userId>/<documentId><ext>`): ein absoluter Pfad hinge am Ort des Builds.
 *
 * Wer eine `documents`-Zeile hart löscht, räumt die Datei mit ab —
 * Papierkorb-Purge, `deleteDocument`, Kontolöschung und Offboarding.
 */
import fs from 'fs';
import path from 'path';

const ORIGINALS_DIR = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  '../../uploads/documents'
);

/** Absoluter Pfad, nur wenn er innerhalb des Verzeichnisses bleibt. */
function resolveInside(relative: string): string | null {
  const resolved = path.resolve(ORIGINALS_DIR, relative);
  return resolved.startsWith(ORIGINALS_DIR + path.sep) ? resolved : null;
}

/**
 * Verschiebt die gelesene Upload-Datei zu den Originalen und gibt den Pfad für
 * `documents.file_path` zurück. `rename` scheitert über Dateisystemgrenzen,
 * dann wird kopiert und die Quelle gelöscht.
 */
export function keepOriginal(sourcePath: string, userId: string, documentId: string): string {
  const relative = path.join(userId, `${documentId}${path.extname(sourcePath).slice(0, 16)}`);
  const target = resolveInside(relative);
  if (!target) throw new Error('Ungültiger Speicherpfad für das Original.');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  try {
    fs.renameSync(sourcePath, target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error;
    fs.copyFileSync(sourcePath, target);
    fs.unlinkSync(sourcePath);
  }
  return relative;
}

/** Absoluter Pfad eines aufbewahrten Originals, `null` wenn es fehlt. */
export function originalFile(relative: string | null | undefined): string | null {
  if (!relative) return null;
  const resolved = resolveInside(relative);
  return resolved && fs.existsSync(resolved) ? resolved : null;
}

export function removeOriginal(relative: string | null | undefined): void {
  const resolved = relative ? resolveInside(relative) : null;
  if (resolved) fs.rmSync(resolved, { force: true });
}

export function removeUserOriginals(userId: string): void {
  const resolved = resolveInside(userId);
  if (resolved) fs.rmSync(resolved, { recursive: true, force: true });
}
