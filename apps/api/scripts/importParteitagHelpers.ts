/**
 * Pure helpers of `import-parteitag.ts` (the script itself runs on import, so what
 * needs a test lives here): the resumable upload map and the wait for a slow import.
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

/** 502/503/504 and network failures (status 0) mean "the server may still be working". */
export const isStillRunning = (status: number): boolean =>
  status === 0 || status === 502 || status === 503 || status === 504;

/**
 * Polls until every wanted sha256 is among the stored hashes. Returns false when
 * the deadline passes first. `fetchHashes` failing counts as "not yet".
 */
export async function waitForHashes(opts: {
  wanted: string[];
  fetchHashes: () => Promise<Record<string, string>>;
  sleep: (ms: number) => Promise<void>;
  intervalMs: number;
  maxAttempts: number;
}): Promise<boolean> {
  for (let attempt = 0; attempt < opts.maxAttempts; attempt++) {
    const stored = await opts.fetchHashes().catch(() => ({}) as Record<string, string>);
    if (opts.wanted.every((sha) => sha in stored)) return true;
    await opts.sleep(opts.intervalMs);
  }
  return false;
}
