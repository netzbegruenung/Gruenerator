/**
 * Pure helpers of `import-parteitag.ts` (the script itself runs on import, so what
 * needs a test lives here): the resumable upload map. Manifest file list and the wait for a
 * slow import are shared with the browser import (`@gruenerator/shared/utils`).
 */
import { readFileSync, writeFileSync } from 'fs';

export interface UploadEntry {
  sha256: string;
  size: number;
  uploadId: string;
  uploadUrl: string;
}

/** manifest file name → upload; valid only while the file's sha256 is unchanged. */
export type UploadMap = Record<string, UploadEntry>;

export function loadUploadMap(path: string): UploadMap {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as UploadMap) : {};
  } catch {
    return {};
  }
}

export function saveUploadMap(path: string, map: UploadMap): void {
  writeFileSync(path, `${JSON.stringify(map, null, 2)}\n`);
}

/** An entry is only reusable for the very same file content. */
export function reusableEntry(
  map: UploadMap,
  name: string,
  file: { sha256: string; size: number }
): UploadEntry | null {
  const entry = map[name];
  return entry && entry.sha256 === file.sha256 && entry.size === file.size ? entry : null;
}
