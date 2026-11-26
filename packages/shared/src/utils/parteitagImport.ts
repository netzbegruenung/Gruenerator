import { type ConventionManifest } from '@gruenerator/contracts';

/**
 * Parteitag-Import, geteilt von `apps/api/scripts/import-parteitag.ts` und dem
 * Import im Admin-Reiter „Parteitage“: welche Dateien ein Manifest nennt und
 * wie man auf einen Import wartet, dessen Antwort am Proxy verloren ging.
 */

export type ManifestFile = ConventionManifest['speeches'][number]['files']['reel'];

/** Every file the manifest names: reel and poster per speech, plus the report. */
export function manifestFiles(manifest: ConventionManifest): ManifestFile[] {
  const files = manifest.speeches.flatMap((s) => [s.files.reel, s.files.poster]);
  return manifest.report ? [...files, manifest.report] : files;
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
