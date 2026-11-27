/**
 * Importiert einen Parteitag-Export (manifest.json + reels/ + posters/ [+ report/]) in einen
 * Grünerator. Erzeugt von `parteitag-reden/scripts/export_manifest.py`.
 *
 *   pnpm --filter @gruenerator/api exec tsx scripts/import-parteitag.ts \
 *     --dir ~/Downloads/ldk-nrw/grünerator-export --base https://gruenerator.eu \
 *     (--password-file <datei> | --no-password)
 *
 * Ablauf: (1) `GET /api/admin/parteitage/by-key/:key/files` (sha256 -> storage_key der schon
 * gespeicherten Dateien), (2) nur Dateien, deren sha256 dort fehlt, per TUS nach
 * `/api/admin/parteitage/upload`, (3) `POST /api/admin/parteitage/import` mit
 * `{ manifest, uploads, password }`, (4) Zusammenfassung. Erneute Läufe laden nichts doppelt hoch.
 * Eines von `--password-file` oder `--no-password` ist Pflicht (`--no-password` = offen für alle
 * Eingeloggten). Der Upload spricht TUS per fetch (kein tus-js-client). Meldet der Import
 * `MISSING_UPLOADS` (Upload auf dem Server nach 4 h abgeräumt), lädt das Skript genau diese
 * Dateien erneut hoch und wiederholt den Import einmal.
 *
 * Fortsetzen: Upload-IDs stehen in `<dir>/import-uploads.json` (Dateiname -> TUS-URL, sha256,
 * Größe). Ein neuer Lauf prüft sie per HEAD und macht beim Server-Offset weiter, statt von vorn
 * zu beginnen. Antwortet der Import mit 502/503/504 oder gar nicht (Proxy-Limit 300 s, der
 * Server arbeitet weiter), fragt das Skript `…/files` ab, bis alle neuen sha256 gespeichert sind,
 * und sendet den Import dann noch einmal (idempotent, geht schnell).
 *
 * Erneuter Lauf mit Passwort: ein unverändertes Passwort lässt Hash und Freigaben stehen, ein
 * neues entzieht alle Freigaben. `--no-password` bei einem Re-Import ENTFERNT ein bestehendes
 * Passwort NICHT, es lässt es unverändert (die Zusammenfassung sagt dann trotzdem „keins“).
 *
 * ANMELDUNG (Stand der Prüfung von authMiddleware.ts und mobileTokenExchange.ts):
 *  - Prod/Beta: Es gibt keinen Login-Endpunkt für Skripte. Anmeldung läuft nur über Keycloak-OIDC
 *    im Browser; der Token-Tausch (`mobileTokenExchange`) gilt für die App und verlangt ein
 *    Keycloak-ID-Token bzw. einen Login-Code aus dem App-Schema. Gangbar ist das Bearer-Plugin
 *    von Better Auth (`bearer()` in config/betterAuth.ts): `Authorization: Bearer <Wert>` wird wie
 *    das Session-Cookie behandelt. Als Wert dient das Session-Cookie einer Instanz-Admin-Person
 *    (Browser, DevTools, Cookie `…session_token` von der Zielinstanz, Wert unverändert, auch
 *    URL-kodiert). Das gilt, solange die Sitzung lebt; es ist ein Handgriff, kein eigener Weg.
 *    -> `GRUENERATOR_ADMIN_TOKEN=<cookie-wert>`
 *  - Lokal: `DEV_AUTH_BYPASS_TOKEN=<token aus apps/api/.env>` sendet `x-dev-auth-bypass`. Das wirkt
 *    nur, wenn der Server mit NODE_ENV=development und ALLOW_DEV_AUTH_BYPASS=true läuft, und der
 *    Bypass-Nutzer muss Instanz-Admin sein (ADMIN_EMAILS bzw. profiles.is_admin).
 */
import { createHash } from 'crypto';
import { createReadStream, readFileSync, statSync } from 'fs';
import { open } from 'fs/promises';
import { join, resolve } from 'path';
import { parseArgs } from 'util';

import { conventionManifestSchema } from '@gruenerator/contracts';
import { isStillRunning, manifestFiles, waitForHashes } from '@gruenerator/shared/utils';

import {
  loadUploadMap,
  reusableEntry,
  saveUploadMap,
  type UploadMap,
} from './importParteitagHelpers.js';

const CHUNK_BYTES = 5 * 1024 * 1024;

const { values } = parseArgs({
  options: {
    dir: { type: 'string' },
    base: { type: 'string' },
    'password-file': { type: 'string' },
    'no-password': { type: 'boolean' },
  },
});

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const dir = values.dir
  ? resolve(values.dir.replace(/^~/, process.env.HOME ?? '~'))
  : fail('--dir fehlt');
const base = (values.base ?? fail('--base fehlt')).replace(/\/+$/, '');

function authHeaders(): Record<string, string> {
  const bypass = process.env.DEV_AUTH_BYPASS_TOKEN;
  if (bypass) return { 'x-dev-auth-bypass': bypass };
  const token = process.env.GRUENERATOR_ADMIN_TOKEN;
  if (token) return { Authorization: `Bearer ${token}` };
  return fail(
    'Weder DEV_AUTH_BYPASS_TOKEN noch GRUENERATOR_ADMIN_TOKEN gesetzt (siehe Kopfkommentar).'
  );
}

async function api<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...authHeaders(),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${method} ${path} -> HTTP ${response.status}: ${text.slice(0, 500)}`);
  }
  return JSON.parse(text) as T;
}

/** Status 0 = no answer at all (timeout, connection reset): the server may still be working. */
async function post(body: unknown) {
  let response: Response;
  let text: string;
  try {
    response = await fetch(`${base}/api/admin/parteitage/import`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    text = await response.text();
  } catch (error) {
    return { status: 0, text: String(error), body: {} as { code?: string; files?: string[] } };
  }
  let parsed: { code?: string; files?: string[] } = {};
  try {
    parsed = JSON.parse(text) as typeof parsed;
  } catch {
    // non-JSON error page
  }
  return { status: response.status, text, body: parsed };
}

function sha256Of(path: string): Promise<string> {
  return new Promise((resolveHash, reject) => {
    const hash = createHash('sha256');
    createReadStream(path)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolveHash(hash.digest('hex')))
      .on('error', reject);
  });
}

function filetypeOf(name: string): string {
  if (name.endsWith('.mp4')) return 'video/mp4';
  if (name.endsWith('.jpg')) return 'image/jpeg';
  if (name.endsWith('.pdf')) return 'application/pdf';
  return 'application/octet-stream';
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const RETRY_DELAYS_MS = [0, 1000, 3000, 5000];

const b64 = (value: string) => Buffer.from(value).toString('base64');

/** Server-side offset of an upload, or null when it is gone (reaped, consumed by an import). */
async function headOffset(uploadUrl: string, tusHeaders: Record<string, string>) {
  const head = await fetch(uploadUrl, { method: 'HEAD', headers: tusHeaders }).catch(() => null);
  if (!head?.ok) return null;
  const offset = Number(head.headers.get('upload-offset'));
  return Number.isFinite(offset) ? offset : null;
}

/**
 * TUS 1.0.0 creation + 5 MB PATCH chunks. Reuses an upload from `map` (HEAD decides where to
 * continue); a failed chunk, including a 409 offset mismatch, asks the server for its offset.
 */
async function uploadFile(
  name: string,
  path: string,
  file: { sha256: string },
  map: UploadMap,
  mapPath: string
): Promise<string> {
  const size = statSync(path).size;
  const tusHeaders = { ...authHeaders(), 'Tus-Resumable': '1.0.0' };

  let uploadUrl = '';
  let uploadId = '';
  let offset = 0;

  const known = reusableEntry(map, name, { sha256: file.sha256, size });
  const knownOffset = known ? await headOffset(known.uploadUrl, tusHeaders) : null;
  if (known && knownOffset !== null) {
    ({ uploadUrl, uploadId } = known);
    offset = knownOffset;
  } else {
    const created = await fetch(`${base}/api/admin/parteitage/upload`, {
      method: 'POST',
      headers: {
        ...tusHeaders,
        'Upload-Length': String(size),
        'Upload-Metadata': `filename ${b64(name)},filetype ${b64(filetypeOf(name))}`,
      },
    });
    if (created.status !== 201) {
      fail(
        `TUS-Anlage für ${name} -> HTTP ${created.status}: ${(await created.text()).slice(0, 300)}`
      );
    }
    const location = created.headers.get('location');
    if (!location) fail(`TUS-Anlage für ${name}: keine Location.`);
    // Follow the returned Location as is (it may point at the shared subtitler mount).
    uploadUrl = new URL(location, base).toString();
    uploadId = decodeURIComponent(new URL(uploadUrl).pathname.split('/').pop() ?? '');
    if (!uploadId) fail(`Keine Upload-ID für ${name}.`);
    map[name] = { sha256: file.sha256, size, uploadId, uploadUrl };
    saveUploadMap(mapPath, map);
  }

  const handle = await open(path, 'r');
  try {
    let failures = 0;
    while (offset < size) {
      const length = Math.min(CHUNK_BYTES, size - offset);
      const chunk = Buffer.alloc(length);
      const { bytesRead } = await handle.read(chunk, 0, length, offset);
      if (bytesRead !== length) {
        fail(
          `${name}: Datei beim Lesen verändert (${bytesRead} von ${length} Bytes bei ${offset}).`
        );
      }
      try {
        const response = await fetch(uploadUrl, {
          method: 'PATCH',
          headers: {
            ...tusHeaders,
            'Content-Type': 'application/offset+octet-stream',
            'Upload-Offset': String(offset),
          },
          body: chunk,
        });
        if (response.status >= 500 || response.status === 429 || response.status === 409) {
          throw new Error(`HTTP ${response.status}`);
        }
        if (response.status !== 204) {
          fail(
            `PATCH ${name} -> HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`
          );
        }
        offset = Number(response.headers.get('upload-offset') ?? offset + length);
        failures = 0;
      } catch (error) {
        if (failures >= RETRY_DELAYS_MS.length) throw error;
        await sleep(RETRY_DELAYS_MS[failures]!);
        failures += 1;
        // Ask the server where it is before sending the chunk again.
        const serverOffset = await headOffset(uploadUrl, tusHeaders);
        if (serverOffset !== null) offset = serverOffset;
      }
    }
  } finally {
    await handle.close();
  }
  return uploadId;
}

async function main(): Promise<void> {
  const manifest = conventionManifestSchema.parse(
    JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'))
  );
  if (!values['password-file'] === !values['no-password']) {
    fail('Genau eines von --password-file oder --no-password angeben.');
  }
  const password = values['password-file']
    ? readFileSync(values['password-file'], 'utf8').trim() ||
      fail('--password-file ist leer (für „offen“ --no-password nutzen).')
    : null;
  const files = manifestFiles(manifest);

  const stored = await api<Record<string, string>>(
    'GET',
    `/api/admin/parteitage/by-key/${encodeURIComponent(manifest.key)}/files`
  );
  const todo = files.filter((f) => !(f.sha256 in stored));
  const skipped = files.length - todo.length;
  console.log(`${files.length} Dateien im Manifest, ${todo.length} fehlen auf dem Server.`);

  const mapPath = join(dir, 'import-uploads.json');
  const uploadMap = loadUploadMap(mapPath);
  const uploads: Record<string, string> = {};
  let done = 0;
  const upload = async (file: (typeof files)[number]) => {
    const path = join(dir, file.name);
    const actual = await sha256Of(path);
    if (actual !== file.sha256)
      fail(`${file.name}: sha256 weicht vom Manifest ab (Export neu erzeugen).`);
    uploads[file.name] = await uploadFile(file.name, path, file, uploadMap, mapPath);
    done += 1;
    console.log(`  [${done}/${todo.length}] ${file.name} (${Math.round(file.sizeBytes / 1e6)} MB)`);
  };
  for (const file of todo) await upload(file);

  const importBody = () => ({ manifest, uploads, password });
  let result = await post(importBody());
  if (result.status === 400 && result.body.code === 'MISSING_UPLOADS') {
    // Uploads the server reaped meanwhile: send exactly those again, then retry once.
    const names = new Set(result.body.files ?? []);
    const again = files.filter((f) => names.has(f.name));
    console.log(`${again.length} Uploads fehlen auf dem Server, lade sie erneut hoch.`);
    done = 0;
    todo.splice(0, todo.length, ...again);
    for (const file of again) await upload(file);
    result = await post(importBody());
  }
  if (isStillRunning(result.status)) {
    // Proxy or client gave up while the server keeps working: wait until the new files are
    // committed (their sha256 shows up in `…/files`), then post again. The re-post is idempotent.
    console.log(
      `Import ohne Antwort (HTTP ${result.status}), warte bis der Server alle Dateien gespeichert hat.`
    );
    const committed = await waitForHashes({
      wanted: todo.map((f) => f.sha256),
      fetchHashes: () =>
        api<Record<string, string>>(
          'GET',
          `/api/admin/parteitage/by-key/${encodeURIComponent(manifest.key)}/files`
        ),
      sleep,
      intervalMs: 15_000,
      maxAttempts: 240,
    });
    if (!committed) fail('Der Server hat den Import nicht innerhalb von 60 Minuten abgeschlossen.');
    result = await post(importBody());
  }
  if (result.status !== 200) {
    fail(
      `POST /api/admin/parteitage/import -> HTTP ${result.status}: ${result.text.slice(0, 500)}`
    );
  }
  const imported = result.body as unknown as { id: string; slug: string; speechCount: number };
  console.log(
    `Import ok: ${manifest.key} -> ${imported.slug} (${imported.speechCount} Reden, ` +
      `${files.length - skipped} hochgeladen, ${skipped} übersprungen, ` +
      `Passwort ${password ? 'gesetzt' : 'keins'}).`
  );
}

main().catch((error: unknown) =>
  fail(error instanceof Error ? (error.stack ?? error.message) : String(error))
);
