/**
 * Importiert einen Parteitag-Export (manifest.json + reels/ + posters/ [+ report/]) in einen
 * Grünerator. Erzeugt von `parteitag-reden/scripts/export_manifest.py`.
 *
 *   pnpm --filter @gruenerator/api exec tsx scripts/import-parteitag.ts \
 *     --dir ~/Downloads/ldk-nrw/grünerator-export --base https://gruenerator.eu \
 *     [--password-file <datei>]
 *
 * Ablauf: (1) `GET /api/admin/parteitage/by-key/:key/files` (sha256 -> storage_key der schon
 * gespeicherten Dateien), (2) nur Dateien, deren sha256 dort fehlt, per TUS nach
 * `/api/admin/parteitage/upload`, (3) `POST /api/admin/parteitage/import` mit
 * `{ manifest, uploads, password }`, (4) Zusammenfassung. Erneute Läufe laden nichts doppelt hoch.
 * Ohne `--password-file` bekommt die Anlage `password: null` (offen für alle Eingeloggten).
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
import { join, resolve } from 'path';
import { parseArgs } from 'util';

import { conventionManifestSchema, type ConventionManifest } from '@gruenerator/contracts';
import { Upload } from 'tus-js-client';

const CHUNK_BYTES = 5 * 1024 * 1024;

const { values } = parseArgs({
  options: {
    dir: { type: 'string' },
    base: { type: 'string' },
    'password-file': { type: 'string' },
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
  if (!response.ok) fail(`${method} ${path} -> HTTP ${response.status}: ${text.slice(0, 500)}`);
  return JSON.parse(text) as T;
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

function uploadFile(name: string, path: string): Promise<string> {
  const size = statSync(path).size;
  return new Promise((resolveUpload, reject) => {
    const upload = new Upload(createReadStream(path), {
      endpoint: `${base}/api/admin/parteitage/upload`,
      uploadSize: size,
      chunkSize: CHUNK_BYTES,
      retryDelays: [0, 1000, 3000, 5000],
      headers: authHeaders(),
      metadata: { filename: name, filetype: filetypeOf(name) },
      onError: reject,
      onSuccess: () => {
        const id = upload.url?.split('/').pop();
        if (!id) return reject(new Error(`Keine Upload-ID für ${name}`));
        resolveUpload(decodeURIComponent(id));
      },
    });
    upload.start();
  });
}

function manifestFiles(manifest: ConventionManifest) {
  const files = manifest.speeches.flatMap((s) => [s.files.reel, s.files.poster]);
  return manifest.report ? [...files, manifest.report] : files;
}

async function main(): Promise<void> {
  const manifest = conventionManifestSchema.parse(
    JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'))
  );
  const password = values['password-file']
    ? readFileSync(values['password-file'], 'utf8').trim() || null
    : null;
  const files = manifestFiles(manifest);

  const stored = await api<Record<string, string>>(
    'GET',
    `/api/admin/parteitage/by-key/${encodeURIComponent(manifest.key)}/files`
  );
  const todo = files.filter((f) => !(f.sha256 in stored));
  console.log(`${files.length} Dateien im Manifest, ${todo.length} fehlen auf dem Server.`);

  const uploads: Record<string, string> = {};
  let done = 0;
  for (const file of todo) {
    const path = join(dir, file.name);
    const actual = await sha256Of(path);
    if (actual !== file.sha256)
      fail(`${file.name}: sha256 weicht vom Manifest ab (Export neu erzeugen).`);
    uploads[file.name] = await uploadFile(file.name, path);
    done += 1;
    console.log(`  [${done}/${todo.length}] ${file.name} (${Math.round(file.sizeBytes / 1e6)} MB)`);
  }

  const result = await api<{ id: string; slug: string; speechCount: number }>(
    'POST',
    '/api/admin/parteitage/import',
    { manifest, uploads, password }
  );
  console.log(
    `Import ok: ${manifest.key} -> ${result.slug} (${result.speechCount} Reden, ` +
      `${todo.length} hochgeladen, ${files.length - todo.length} übersprungen, ` +
      `Passwort ${password ? 'gesetzt' : 'keins'}).`
  );
}

main().catch((error: unknown) =>
  fail(error instanceof Error ? (error.stack ?? error.message) : String(error))
);
