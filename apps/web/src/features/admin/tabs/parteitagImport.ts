/**
 * Parteitag-Import im Browser: derselbe Ablauf wie `apps/api/scripts/import-parteitag.ts`,
 * aber mit der Sitzung der eingeloggten Admin-Person statt eines kopierten Tokens.
 *
 * (1) `…/by-key/:key/files` sagt, welche sha256 der Server schon hat, (2) nur die übrigen
 * Dateien gehen per TUS nach `/api/admin/parteitage/upload`, (3) `…/import` mit
 * `{ manifest, uploads, password }`. Den sha256 prüft der Server beim Import selbst
 * (`ImportFileMismatchError`); der Browser vergleicht vorab nur die Größe, denn ein Reel
 * hat ~500 MB und ein Export zusammen viele GB.
 */
import { conventionManifestSchema, type ConventionManifest } from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import {
  isStillRunning,
  manifestFiles,
  waitForHashes,
  type ManifestFile,
} from '@gruenerator/shared/utils';
import * as tus from 'tus-js-client';

import apiClient from '@/components/utils/apiClient';
import { getTusAuthOptions } from '@/utils/tusAuth';

const TUS_ENDPOINT = `${apiClient.defaults.baseURL}/admin/parteitage/upload`;
const CHUNK_SIZE = 5 * 1024 * 1024;

export interface SelectedFile {
  /** Path inside the picked folder, e.g. `grünerator-export/reels/x.mp4`. */
  path: string;
  file: File;
}

export interface ImportPlan {
  manifest: ConventionManifest;
  /** Files the server does not have yet, with the picked file to send. */
  todo: { entry: ManifestFile; file: File }[];
  skipped: number;
}

export type ImportProgress =
  | { phase: 'checking' }
  | { phase: 'uploading'; done: number; total: number; fileName: string; percent: number }
  | { phase: 'importing' }
  | { phase: 'waiting' };

const nfc = (s: string) => s.normalize('NFC');

/** The picked folder's `manifest.json` (the shallowest one, so a nested copy cannot win). */
export function findManifest(selected: SelectedFile[]): SelectedFile | null {
  const candidates = selected
    .filter((s) => nfc(s.path).split('/').pop() === 'manifest.json')
    .sort((a, b) => a.path.split('/').length - b.path.split('/').length);
  return candidates[0] ?? null;
}

/**
 * Matches the manifest's file names (relative to the manifest's folder) against the picked
 * files. Throws with every missing or wrongly sized file named, before anything is uploaded.
 */
export function planUploads(
  manifest: ConventionManifest,
  manifestPath: string,
  selected: SelectedFile[],
  stored: Record<string, string>
): ImportPlan {
  const prefix = nfc(manifestPath).split('/').slice(0, -1).join('/');
  const byName = new Map<string, File>();
  for (const s of selected) {
    const path = nfc(s.path);
    if (prefix && !path.startsWith(`${prefix}/`)) continue;
    byName.set(prefix ? path.slice(prefix.length + 1) : path, s.file);
  }

  const files = manifestFiles(manifest);
  const todo: ImportPlan['todo'] = [];
  const problems: string[] = [];
  for (const entry of files) {
    if (entry.sha256 in stored) continue;
    const file = byName.get(nfc(entry.name));
    if (!file) problems.push(`${entry.name} fehlt`);
    else if (file.size !== entry.sizeBytes) problems.push(`${entry.name} hat eine andere Größe`);
    else todo.push({ entry, file });
  }
  if (problems.length > 0) {
    const shown = problems.slice(0, 5).join(', ');
    const more = problems.length > 5 ? ` und ${problems.length - 5} weitere` : '';
    throw new Error(`Der Ordner passt nicht zum Manifest: ${shown}${more}.`);
  }
  return { manifest, todo, skipped: files.length - todo.length };
}

function filetypeOf(name: string): string {
  if (name.endsWith('.mp4')) return 'video/mp4';
  if (name.endsWith('.jpg')) return 'image/jpeg';
  if (name.endsWith('.pdf')) return 'application/pdf';
  return 'application/octet-stream';
}

async function tusUpload(
  name: string,
  file: File,
  onProgress: (percent: number) => void,
  signal: AbortSignal
): Promise<string> {
  const auth = await getTusAuthOptions();
  return new Promise((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: TUS_ENDPOINT,
      retryDelays: [0, 1000, 3000, 5000, 10000, 20000],
      chunkSize: CHUNK_SIZE,
      metadata: { filename: name, filetype: filetypeOf(name) },
      // The fingerprint stays after success on purpose: a finished upload whose import never
      // ran is found again (HEAD offset = size, no bytes resent). One the import consumed or the
      // server reaped answers HEAD with 404, and tus-js-client then creates a fresh upload.
      ...auth,
      onError: () => reject(new Error(`„${name}“ konnte nicht hochgeladen werden.`)),
      onProgress: (sent, total) => onProgress(Math.round((sent / total) * 100)),
      onSuccess: () => resolve(decodeURIComponent(upload.url?.split('/').pop() ?? '')),
    });
    signal.addEventListener('abort', () => {
      void upload.abort();
      reject(new DOMException('Abgebrochen', 'AbortError'));
    });
    // An interrupted upload of the same file (also before a reload) continues where it stopped.
    void upload.findPreviousUploads().then((previous) => {
      const resumable = previous[0];
      if (resumable) upload.resumeFromPreviousUpload(resumable);
      upload.start();
    });
  });
}

async function fetchStored(key: string): Promise<Record<string, string>> {
  const result = await getContractsClient().parteitageAdmin.fileHashes({ params: { key } });
  if (result.status === 200) return result.body;
  throw new Error('Die vorhandenen Dateien konnten nicht geladen werden.');
}

type PostResult = { status: number; code?: string; message?: string; files?: string[] };

async function postImport(body: {
  manifest: ConventionManifest;
  uploads: Record<string, string>;
  password: string | null;
}): Promise<PostResult & { slug?: string; speechCount?: number }> {
  try {
    const result = await getContractsClient().parteitageAdmin.import({ body });
    if (result.status === 200) {
      return { status: 200, slug: result.body.slug, speechCount: result.body.speechCount };
    }
    const error = result.body as Partial<PostResult> | null;
    return {
      status: result.status,
      code: error?.code,
      message: error?.message,
      files: error?.files,
    };
  } catch {
    // No answer at all (timeout, connection reset): the server may still be working.
    return { status: 0 };
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Rejects as soon as `signal` aborts. Only the page stops waiting: an import the server
 * already started keeps running there, and the next start finds its files stored.
 */
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new DOMException('Abgebrochen', 'AbortError'));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

export async function readManifest(file: File): Promise<ConventionManifest> {
  let json: unknown;
  try {
    json = JSON.parse(await file.text());
  } catch {
    throw new Error('manifest.json ist kein gültiges JSON.');
  }
  const parsed = conventionManifestSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(
      `manifest.json passt nicht zum Format: ${issue?.path.join('.') ?? ''} ${issue?.message ?? ''}`.trim()
    );
  }
  return parsed.data;
}

export async function runParteitagImport(opts: {
  selected: SelectedFile[];
  password: string | null;
  onProgress: (p: ImportProgress) => void;
  signal: AbortSignal;
}): Promise<{ slug: string; speechCount: number; uploaded: number; skipped: number }> {
  opts.onProgress({ phase: 'checking' });
  const manifestFile = findManifest(opts.selected);
  if (!manifestFile) throw new Error('Im gewählten Ordner liegt keine manifest.json.');
  const manifest = await readManifest(manifestFile.file);
  const plan = planUploads(
    manifest,
    manifestFile.path,
    opts.selected,
    await fetchStored(manifest.key)
  );

  const uploads: Record<string, string> = {};
  const uploadAll = async (items: ImportPlan['todo']) => {
    for (const [index, item] of items.entries()) {
      opts.signal.throwIfAborted();
      const report = (percent: number) =>
        opts.onProgress({
          phase: 'uploading',
          done: index,
          total: items.length,
          fileName: item.entry.name,
          percent,
        });
      report(0);
      uploads[item.entry.name] = await tusUpload(item.entry.name, item.file, report, opts.signal);
    }
  };
  await uploadAll(plan.todo);

  const body = () => ({ manifest, uploads, password: opts.password });
  opts.onProgress({ phase: 'importing' });
  let result = await abortable(postImport(body()), opts.signal);
  if (result.status === 400 && result.code === 'MISSING_UPLOADS') {
    // Uploads the server reaped meanwhile (after 4 h): send exactly those again, retry once.
    const names = new Set(result.files ?? []);
    await uploadAll(plan.todo.filter((t) => names.has(t.entry.name)));
    opts.onProgress({ phase: 'importing' });
    result = await abortable(postImport(body()), opts.signal);
  }
  if (isStillRunning(result.status)) {
    // The proxy gave up (300 s) while the server keeps working: wait until every new file is
    // stored, then post again — the import is idempotent and the second run is quick.
    opts.onProgress({ phase: 'waiting' });
    const committed = await waitForHashes({
      wanted: plan.todo.map((t) => t.entry.sha256),
      fetchHashes: () => fetchStored(manifest.key),
      sleep: (ms) => abortable(sleep(ms), opts.signal),
      intervalMs: 15_000,
      maxAttempts: 240,
    });
    if (!committed)
      throw new Error('Der Server hat den Import nicht innerhalb von 60 Minuten abgeschlossen.');
    result = await abortable(postImport(body()), opts.signal);
  }
  if (result.status !== 200 || !result.slug) {
    throw new Error(result.message ?? `Der Import ist fehlgeschlagen (HTTP ${result.status}).`);
  }
  return {
    slug: result.slug,
    speechCount: result.speechCount ?? 0,
    uploaded: plan.todo.length,
    skipped: plan.skipped,
  };
}
