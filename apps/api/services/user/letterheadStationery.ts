/**
 * Ablage für eigenes Briefpapier.
 *
 * Der Bogen wird beim Rendern UNTER den Brieftext gelegt, ist also weder
 * Medienbibliothek noch temporäres Rechenergebnis: er muss so lange leben wie
 * der Briefkopf, der ihn referenziert. Deshalb ein eigenes Verzeichnis neben
 * den Gruppenbildern statt `storeBinaryAsset` (90 Tage Aufbewahrung).
 *
 * Je Nutzer*in ein Unterordner, und jeder Pfad läuft über `resolveFile`: der
 * Dateiname kommt aus der Datenbank, aber ein von Hand gesetzter Wert wie
 * "../../secrets.pdf" darf nicht aus dem Verzeichnis herausführen.
 */

import fs from 'fs/promises';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

import { createLogger } from '../../utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const STATIONERY_DIR = path.resolve(path.join(__dirname, '../../uploads/letterhead-stationery'));
const log = createLogger('letterheadStationery');

export type StationeryType = 'pdf' | 'png' | 'jpg';

/** Was der Renderer einbetten kann; alles andere lehnt der Upload ab. */
export const STATIONERY_MIME_TYPES: Record<string, StationeryType> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
};

export const STATIONERY_MAX_BYTES = 10 * 1024 * 1024;

function userDir(userId: string): string {
  return path.join(STATIONERY_DIR, path.basename(userId));
}

/**
 * Absoluter Pfad einer Bogendatei — oder null, wenn der Name aus dem
 * Nutzerverzeichnis herausführt.
 */
function resolveFile(userId: string, fileName: string): string | null {
  const dir = userDir(userId);
  const resolved = path.resolve(path.join(dir, path.basename(fileName)));
  return resolved.startsWith(path.resolve(dir) + path.sep) ? resolved : null;
}

export function stationeryTypeOf(fileName: string): StationeryType | null {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === '.pdf') return 'pdf';
  if (ext === '.png') return 'png';
  if (ext === '.jpg' || ext === '.jpeg') return 'jpg';
  return null;
}

/** Speichert den Bogen und gibt den Dateinamen für die DB-Spalte zurück. */
export async function saveStationery(
  userId: string,
  bytes: Buffer,
  type: StationeryType
): Promise<string> {
  const dir = userDir(userId);
  await fs.mkdir(dir, { recursive: true });
  // Zeitstempel im Namen, damit ein Ersetzen nicht auf einer im Browser
  // gecachten URL hängen bleibt.
  const fileName = `${Date.now()}.${type}`;
  await fs.writeFile(path.join(dir, fileName), bytes);
  return fileName;
}

export async function readStationery(
  userId: string,
  fileName: string
): Promise<{ bytes: Buffer; type: StationeryType } | null> {
  const type = stationeryTypeOf(fileName);
  const file = resolveFile(userId, fileName);
  if (!type || !file) return null;
  try {
    return { bytes: await fs.readFile(file), type };
  } catch (err) {
    // Eine fehlende Datei darf den Brief nicht verhindern — der Renderer fällt
    // dann auf das CI-Layout zurück.
    log.warn(
      `Briefbogen ${fileName} für ${userId} nicht lesbar: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return null;
  }
}

export async function deleteStationery(userId: string, fileName: string): Promise<void> {
  const file = resolveFile(userId, fileName);
  if (!file) return;
  await fs.unlink(file).catch(() => {});
}
