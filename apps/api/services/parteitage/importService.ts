/**
 * Parteitage import: a validated manifest plus uploaded files become DB rows
 * and stored system media. Re-imports are idempotent: files are content-addressed
 * (`<convention.key>/<sha256>.<ext>`), unchanged files are not uploaded again, and
 * media no longer referenced after the commit is removed (row and file).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

import { type ConventionManifest, conventionManifestSchema } from '@gruenerator/contracts';
import { generateSlugSuffix } from '@gruenerator/shared/utils';
import { eq, inArray, like, or } from 'drizzle-orm';

import {
  conventionAccess,
  conventionDeletedSpeeches,
  conventions,
  conventionSpeeches,
  systemMedia,
} from '../../database/schema/parteitage.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';
import { createLogger } from '../../utils/logger.js';
import { hashPassword } from '../../utils/passwordHash.js';
import { getFilePathFromUploadId, markUploadAsPromoted } from '../subtitler/tusService.js';
import { probeVideoMetadata } from '../subtitler/videoMetadata.js';
import { getSystemMediaStorage } from '../systemMedia/storage.js';

const log = createLogger('parteitageImport');

export class ImportBlockedSpeechError extends Error {
  constructor(public readonly keys: string[]) {
    super(`Speeches were deleted by an admin and are blocked: ${keys.join(', ')}`);
    this.name = 'ImportBlockedSpeechError';
  }
}

export class ImportMissingUploadError extends Error {
  constructor(public readonly names: string[]) {
    super(`Missing uploads for: ${names.join(', ')}`);
    this.name = 'ImportMissingUploadError';
  }
}

export class ImportFileMismatchError extends Error {
  constructor(
    public readonly fileName: string,
    public readonly expectedSha: string,
    public readonly actualSha: string
  ) {
    super(`sha256 mismatch for ${fileName}: expected ${expectedSha}, got ${actualSha}`);
    this.name = 'ImportFileMismatchError';
  }
}

const MIME_BY_EXT: Record<string, string> = {
  mp4: 'video/mp4',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
};

interface PlannedFile {
  name: string;
  sha256: string;
  storageKey: string;
  ext: string;
}

export interface ImportInput {
  manifest: ConventionManifest;
  /** manifest file name → TUS upload id */
  uploads: Record<string, string>;
  /** null leaves an existing hash unchanged (new convention: open). */
  password: string | null;
  adminUserId: string;
}

export interface ImportResult {
  conventionId: string;
  created: boolean;
  speeches: { added: number; updated: number; unchanged: number };
  filesStored: number;
  filesRemoved: number;
}

function planFile(conventionKey: string, file: { name: string; sha256: string }): PlannedFile {
  const ext = path.extname(file.name).slice(1).toLowerCase();
  if (!MIME_BY_EXT[ext]) throw new Error(`Unsupported file type: ${file.name}`);
  return {
    name: file.name,
    sha256: file.sha256,
    ext,
    storageKey: `${conventionKey}/${file.sha256}.${ext}`,
  };
}

async function sha256OfFile(filePath: string): Promise<string> {
  const hash = crypto.createHash('sha256');
  await pipeline(fs.createReadStream(filePath), hash);
  return hash.digest('hex');
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : 1
    );
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

const num = (v: string | number | null): number | null => (v === null ? null : Number(v));

/** sha256 → storage key of the media already stored for a convention key. */
export async function fileHashesForKey(key: string): Promise<Record<string, string>> {
  const rows = await getDrizzleInstance()
    .select({ sha256: systemMedia.sha256, storage_key: systemMedia.storage_key })
    .from(systemMedia)
    .where(like(systemMedia.storage_key, `${key.replace(/[\\%_]/g, '\\$&')}/%`));
  return Object.fromEntries(rows.map((r) => [r.sha256, r.storage_key]));
}

export async function importConvention(input: ImportInput): Promise<ImportResult> {
  const manifest = conventionManifestSchema.parse(input.manifest);
  const db = getDrizzleInstance();
  const storage = getSystemMediaStorage();

  const [existing] = await db
    .select()
    .from(conventions)
    .where(eq(conventions.key, manifest.key))
    .limit(1);

  if (existing) {
    const blocked = await db
      .select({ key: conventionDeletedSpeeches.speech_key })
      .from(conventionDeletedSpeeches)
      .where(eq(conventionDeletedSpeeches.convention_id, existing.id));
    const blockedKeys = new Set(blocked.map((b) => b.key));
    const hits = manifest.speeches.map((s) => s.key).filter((k) => blockedKeys.has(k));
    if (hits.length > 0) throw new ImportBlockedSpeechError(hits);
  }

  // Plan files (deduplicated by storage key) and find what is already stored.
  const planned = new Map<string, PlannedFile>();
  const plan = (file: { name: string; sha256: string }): PlannedFile => {
    const p = planFile(manifest.key, file);
    if (!planned.has(p.storageKey)) planned.set(p.storageKey, p);
    return p;
  };
  const report = manifest.report ? plan(manifest.report) : null;
  const speechFiles = manifest.speeches.map((s) => ({
    reel: plan(s.files.reel),
    poster: plan(s.files.poster),
  }));

  const knownRows = planned.size
    ? await db
        .select({ storage_key: systemMedia.storage_key })
        .from(systemMedia)
        .where(inArray(systemMedia.storage_key, [...planned.keys()]))
    : [];
  const known = new Set(knownRows.map((r) => r.storage_key));
  const toStore = [...planned.values()].filter((p) => !known.has(p.storageKey));

  // Every missing file needs an upload (any name carrying the same sha will do).
  const sources = new Map<string, { name: string; uploadId: string }>();
  const missing: string[] = [];
  for (const file of toStore) {
    const uploadId = input.uploads[file.name];
    if (uploadId) sources.set(file.storageKey, { name: file.name, uploadId });
    else missing.push(file.name);
  }
  if (missing.length > 0) throw new ImportMissingUploadError(missing);

  // An upload id without a file (reaped after the TUS retention, never finished) counts as missing.
  const vanished: string[] = [];
  for (const file of toStore) {
    const { uploadId } = sources.get(file.storageKey)!;
    const exists = await fs.promises
      .stat(getFilePathFromUploadId(uploadId))
      .then(() => true)
      .catch(() => false);
    if (!exists) vanished.push(file.name);
  }
  if (vanished.length > 0) throw new ImportMissingUploadError(vanished);

  // Verify before anything is moved.
  const verified: { file: PlannedFile; uploadId: string; filePath: string }[] = [];
  for (const file of toStore) {
    const { uploadId } = sources.get(file.storageKey)!;
    const filePath = getFilePathFromUploadId(uploadId);
    const actual = await sha256OfFile(filePath);
    if (actual !== file.sha256) throw new ImportFileMismatchError(file.name, file.sha256, actual);
    verified.push({ file, uploadId, filePath });
  }

  // Probe videos and collect metadata while the files are still at their upload path.
  const metadata = new Map<
    string,
    { size: number; duration: number | null; width: number | null; height: number | null }
  >();
  for (const { file, filePath } of verified) {
    const size = (await fs.promises.stat(filePath)).size;
    if (file.ext === 'mp4') {
      const probe = await probeVideoMetadata(filePath);
      metadata.set(file.storageKey, {
        size,
        duration: Number(probe.duration) || null,
        width: probe.width,
        height: probe.height,
      });
    } else {
      metadata.set(file.storageKey, { size, duration: null, width: null, height: null });
    }
  }

  const stored: string[] = [];
  let created = false;
  const counts = { added: 0, updated: 0, unchanged: 0 };
  const candidates = new Set<string>();
  let conventionId = '';

  try {
    for (const { file, filePath } of verified) {
      await storage.putFromFile(file.storageKey, filePath);
      stored.push(file.storageKey);
    }

    await db.transaction(async (tx) => {
      const mediaIds = new Map<string, string>();
      for (const p of planned.values()) {
        const meta = metadata.get(p.storageKey);
        if (meta) {
          await tx
            .insert(systemMedia)
            .values({
              storage_key: p.storageKey,
              mime_type: MIME_BY_EXT[p.ext]!,
              size_bytes: meta.size,
              duration_s: meta.duration === null ? null : String(meta.duration),
              width: meta.width,
              height: meta.height,
              sha256: p.sha256,
            })
            .onConflictDoNothing();
        }
        const [row] = await tx
          .select({ id: systemMedia.id })
          .from(systemMedia)
          .where(eq(systemMedia.storage_key, p.storageKey))
          .limit(1);
        if (!row) throw new Error(`system_media row missing for ${p.storageKey}`);
        mediaIds.set(p.storageKey, row.id);
      }

      const fields = {
        slug_name: manifest.slugName,
        title: manifest.title,
        short_title: manifest.shortTitle,
        organizer: manifest.organizer,
        audience: manifest.audience,
        starts_on: manifest.startsOn,
        ends_on: manifest.endsOn,
        location: manifest.location,
        stats: manifest.stats,
        stats_version: manifest.statsVersion,
        source_links: manifest.sourceLinks,
        report_media_id: report ? mediaIds.get(report.storageKey)! : null,
        ...(input.password !== null && { access_password_hash: hashPassword(input.password) }),
      };

      const existingSpeeches = new Map<string, typeof conventionSpeeches.$inferSelect>();
      if (existing) {
        conventionId = existing.id;
        if (existing.report_media_id) candidates.add(existing.report_media_id);
        await tx.update(conventions).set(fields).where(eq(conventions.id, existing.id));
        // A password given on re-import replaces the old one: earlier unlocks no longer count.
        if (input.password !== null) {
          await tx.delete(conventionAccess).where(eq(conventionAccess.convention_id, existing.id));
        }
        const rows = await tx
          .select()
          .from(conventionSpeeches)
          .where(eq(conventionSpeeches.convention_id, existing.id));
        for (const r of rows) existingSpeeches.set(r.speech_key, r);
      } else {
        created = true;
        const [row] = await tx
          .insert(conventions)
          .values({
            ...fields,
            key: manifest.key,
            slug_suffix: generateSlugSuffix(),
            status: 'draft',
          })
          .returning({ id: conventions.id });
        conventionId = row!.id;
      }

      const manifestKeys = new Set(manifest.speeches.map((s) => s.key));
      const gone = [...existingSpeeches.values()].filter((r) => !manifestKeys.has(r.speech_key));
      if (gone.length > 0) {
        await tx.delete(conventionSpeeches).where(
          inArray(
            conventionSpeeches.id,
            gone.map((g) => g.id)
          )
        );
        for (const g of gone) {
          candidates.add(g.reel_media_id);
          candidates.add(g.poster_media_id);
        }
      }

      for (const [i, s] of manifest.speeches.entries()) {
        const reelId = mediaIds.get(speechFiles[i]!.reel.storageKey)!;
        const posterId = mediaIds.get(speechFiles[i]!.poster.storageKey)!;
        const values = {
          day: s.day,
          day_label: s.dayLabel,
          list_place: s.listPlace,
          seat_type: s.seatType,
          first_name: s.firstName,
          last_name: s.lastName,
          kv: s.kv,
          area: s.area,
          contested: s.contested,
          elected: s.elected,
          result_percent: s.resultPercent === null ? null : String(s.resultPercent),
          delivered_by: s.deliveredBy,
          topic: s.topic,
          duration_s: String(s.durationS),
          word_count: s.wordCount,
          transcript: s.transcript,
          words: s.words,
          analysis: s.analysis,
          reel_media_id: reelId,
          poster_media_id: posterId,
        };
        const old = existingSpeeches.get(s.key);
        if (!old) {
          await tx.insert(conventionSpeeches).values({
            ...values,
            convention_id: conventionId,
            speech_key: s.key,
            slug_suffix: generateSlugSuffix(),
          });
          counts.added++;
          continue;
        }
        const same =
          stable({
            ...values,
            duration_s: num(values.duration_s),
            result_percent: num(values.result_percent),
          }) ===
          stable({
            day: old.day,
            day_label: old.day_label,
            list_place: old.list_place,
            seat_type: old.seat_type,
            first_name: old.first_name,
            last_name: old.last_name,
            kv: old.kv,
            area: old.area,
            contested: old.contested,
            elected: old.elected,
            result_percent: num(old.result_percent),
            delivered_by: old.delivered_by,
            topic: old.topic,
            duration_s: num(old.duration_s),
            word_count: old.word_count,
            transcript: old.transcript,
            words: old.words,
            analysis: old.analysis,
            reel_media_id: old.reel_media_id,
            poster_media_id: old.poster_media_id,
          });
        if (same) {
          counts.unchanged++;
          continue;
        }
        await tx.update(conventionSpeeches).set(values).where(eq(conventionSpeeches.id, old.id));
        counts.updated++;
        candidates.add(old.reel_media_id);
        candidates.add(old.poster_media_id);
      }
    });
  } catch (error) {
    // Content-addressed keys: a failed run leaves only unreferenced new files.
    await Promise.all(stored.map((key) => storage.remove(key).catch(() => undefined)));
    throw error;
  }

  for (const { uploadId } of verified) markUploadAsPromoted(uploadId);

  // Remove media that is no longer referenced by anything. The import is already
  // committed, so a failure here must not turn it into an error.
  let filesRemoved = 0;
  if (candidates.size > 0) {
    try {
      const ids = [...candidates];
      const used = new Set<string>();
      const usedRows = await db
        .select({ r: conventionSpeeches.reel_media_id, p: conventionSpeeches.poster_media_id })
        .from(conventionSpeeches)
        .where(
          or(
            inArray(conventionSpeeches.reel_media_id, ids),
            inArray(conventionSpeeches.poster_media_id, ids)
          )
        );
      for (const r of usedRows) {
        used.add(r.r);
        used.add(r.p);
      }
      const usedReports = await db
        .select({ id: conventions.report_media_id })
        .from(conventions)
        .where(inArray(conventions.report_media_id, ids));
      for (const r of usedReports) if (r.id) used.add(r.id);

      const orphanIds = ids.filter((id) => !used.has(id));
      if (orphanIds.length > 0) {
        const rows = await db
          .select({ id: systemMedia.id, storage_key: systemMedia.storage_key })
          .from(systemMedia)
          .where(inArray(systemMedia.id, orphanIds));
        await db.delete(systemMedia).where(inArray(systemMedia.id, orphanIds));
        for (const row of rows) {
          await storage.remove(row.storage_key);
          filesRemoved++;
        }
      }
    } catch (error) {
      log.error('[parteitageImport] post-commit cleanup failed:', error);
    }
  }

  return { conventionId, created, speeches: counts, filesStored: stored.length, filesRemoved };
}
