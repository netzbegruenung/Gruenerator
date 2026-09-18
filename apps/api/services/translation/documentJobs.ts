/**
 * Document translation jobs: upload to DeepL, poll, and buffer the result to
 * disk before the browser ever sees it.
 *
 * DeepL deletes a translated document the moment `/result` is fetched and
 * keeps it for only ~30 minutes after completion. Streaming that one-shot
 * download straight to the client would lose a file the user paid at least
 * 50 000 characters for on any tab close, network hiccup or interceptor
 * retry. So the status poll that first sees `done` fetches the result
 * server-side (guarded by SET NX against a concurrent poll — a second fetch
 * would 404 and mark the job as failed), writes it under
 * `uploads/translations/`, and the download route serves that file as often
 * as the job lives. Jobs live two hours in Redis; files older than that are
 * swept on the next upload.
 */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { type TranslationDocumentStatusResponse } from '@gruenerator/contracts';
import { z } from 'zod';

import { createLogger } from '../../utils/logger.js';
import redisClient from '../../utils/redis/client.js';
import { deleteCachedKey, getCachedJson, setCachedJson } from '../../utils/redis/jsonCache.js';
import { getTreeBudget } from '../trees/index.js';
import { type TreeBudget } from '../trees/treeBudget.js';
import { DOCUMENT_MIN_CHARS, treeCostForChars, TREE_COST_DOCUMENT } from '../trees/treeCosts.js';

import {
  getDeepLService,
  rootLang,
  type DeepLDocumentHandle,
  type DeepLFormality,
  type DeepLService,
} from './DeepLService.js';
import { glossaryIdFor, resolveGlossary, type GlossaryInfo } from './glossaryRegistry.js';
import { explicitSource, TranslationUnavailableError } from './translate.js';

const log = createLogger('DeepLDocuments');

export const TRANSLATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../uploads/translations'
);

const JOB_TTL_SECONDS = 2 * 60 * 60;
const FETCH_LOCK_TTL_SECONDS = 120;
const FILE_MAX_AGE_MS = JOB_TTL_SECONDS * 1000;

const jobSchema = z.object({
  jobId: z.string(),
  userId: z.string(),
  documentId: z.string(),
  documentKey: z.string(),
  /** Name the translated file downloads as (sanitized, with the output extension). */
  filename: z.string(),
  phase: z.enum(['translating', 'ready', 'error']),
  outputPath: z.string().nullable(),
  contentType: z.string().nullable(),
  billedCharacters: z.number().nullable(),
  /** What was booked at upload. `null` on a job written before the budget existed. */
  reservedUnits: z.number().nullable().default(null),
  /** The UTC day the reservation sits on — a job lives 2 h and crosses midnight. */
  reservedDay: z.string().nullable().default(null),
  message: z.string().nullable(),
});

export type DocumentJob = z.infer<typeof jobSchema>;

const jobKey = (jobId: string): string => `deepl:job:${jobId}`;
const lockKey = (jobId: string): string => `deepl:job:${jobId}:fetching`;

/** Jobs written before the day was persisted settle against today, as they did. */
const currentUtcDay = (): string => new Date().toISOString().slice(0, 10);

/**
 * SET NX on the job's lock: true only for the poll that may SETTLE the
 * reservation. Both routes out of `translating` need it — the `done` fetch
 * (a second `/result` call would 404) and the `error` give-back (two
 * concurrent polls would otherwise release the same reservation twice).
 */
async function claimSettlement(jobId: string): Promise<boolean> {
  try {
    const locked = await redisClient.set(lockKey(jobId), '1', {
      NX: true,
      EX: FETCH_LOCK_TTL_SECONDS,
    });
    return locked === 'OK';
  } catch (error) {
    log.warn(`[DeepLDocuments] lock failed, settling anyway: ${(error as Error).message}`);
    return true;
  }
}

async function saveJob(job: DocumentJob): Promise<void> {
  await setCachedJson(jobKey(job.jobId), job, JOB_TTL_SECONDS);
}

async function loadJob(jobId: string, userId: string): Promise<DocumentJob | null> {
  if (!/^[0-9a-f-]{36}$/.test(jobId)) return null;
  const job = await getCachedJson(jobKey(jobId), jobSchema);
  // Ownership check: the job id is a random UUID but not a capability token —
  // a leaked link must not hand someone else's translation out.
  return job && job.userId === userId ? job : null;
}

/** Strip path segments and control characters; keep umlauts (Content-Disposition handles them). */
export function safeFilename(original: string): string {
  const base = path.basename(original.replace(/\\/g, '/'));
  // eslint-disable-next-line no-control-regex -- control chars have no place in a filename
  const cleaned = base.replace(/[\x00-\x1F\x7F]/g, '').trim();
  return cleaned || 'dokument';
}

export function outputFilename(original: string, outputFormat: string | null): string {
  const safe = safeFilename(original);
  const ext = path.extname(safe);
  const stem = ext ? safe.slice(0, -ext.length) : safe;
  const outExt = outputFormat ? `.${outputFormat}` : ext;
  return `${stem}${outExt}`;
}

export interface StartDocumentJobParams {
  userId: string;
  buffer: Buffer;
  filename: string;
  targetLang: string;
  sourceLang?: string | null;
  formality?: DeepLFormality | null;
  outputFormat?: 'docx' | null;
}

export interface DocumentJobDeps {
  service?: DeepLService | null;
  glossary?: (service: DeepLService) => Promise<GlossaryInfo | null>;
  now?: () => number;
  budget?: Pick<TreeBudget, 'reserveOrThrow' | 'adjust' | 'release'>;
}

function resolveService(deps: DocumentJobDeps): DeepLService {
  const service = deps.service === undefined ? getDeepLService() : deps.service;
  if (!service) throw new TranslationUnavailableError();
  return service;
}

export async function startDocumentJob(
  params: StartDocumentJobParams,
  deps: DocumentJobDeps = {}
): Promise<{ jobId: string; filename: string }> {
  const service = resolveService(deps);
  const budget = deps.budget ?? getTreeBudget();
  // DeepL's per-file minimum is what a document costs at least, so the whole
  // amount is booked before the upload and corrected once DeepL reports.
  const { day: reservedDay } = await budget.reserveOrThrow(params.userId, TREE_COST_DOCUMENT);
  void sweepTranslationFiles().catch(() => undefined);

  // A glossary needs an explicit source — with "auto" the document goes
  // without one (the page asks for a source whenever a dictionary targets the
  // chosen language, so this branch is the no-dictionary case in practice).
  const source = explicitSource(params.sourceLang);
  let glossaryId: string | null = null;
  if (source) {
    try {
      const info = await (deps.glossary ?? resolveGlossary)(service);
      glossaryId = glossaryIdFor(info, source, params.targetLang);
    } catch (error) {
      log.warn(`[DeepLDocuments] glossary lookup failed: ${(error as Error).message}`);
    }
  }

  const filename = safeFilename(params.filename);
  let handle: DeepLDocumentHandle;
  try {
    handle = await service.uploadDocument({
      buffer: params.buffer,
      filename,
      targetLang: params.targetLang,
      sourceLang: source,
      formality: params.formality ?? null,
      glossaryId,
      outputFormat: params.outputFormat ?? null,
    });
  } catch (error) {
    await budget.release(params.userId, TREE_COST_DOCUMENT, reservedDay);
    throw error;
  }

  const job: DocumentJob = {
    jobId: randomUUID(),
    userId: params.userId,
    documentId: handle.documentId,
    documentKey: handle.documentKey,
    filename: outputFilename(filename, params.outputFormat ?? null),
    phase: 'translating',
    outputPath: null,
    contentType: null,
    billedCharacters: null,
    reservedUnits: TREE_COST_DOCUMENT,
    reservedDay,
    message: null,
  };
  await saveJob(job);
  log.info(
    `[DeepLDocuments] job ${job.jobId} started for user ${params.userId} (${filename} → ${rootLang(params.targetLang)}${glossaryId ? ', glossary' : ''})`
  );
  return { jobId: job.jobId, filename: job.filename };
}

function toStatus(job: DocumentJob, extra: Partial<TranslationDocumentStatusResponse> = {}) {
  return {
    jobId: job.jobId,
    status:
      job.phase === 'ready'
        ? ('done' as const)
        : job.phase === 'error'
          ? ('error' as const)
          : ('translating' as const),
    secondsRemaining: null,
    billedCharacters: job.billedCharacters,
    message: job.message,
    filename: job.filename,
    ...extra,
  } satisfies TranslationDocumentStatusResponse;
}

/**
 * One poll. Returns null when the job is unknown or not the caller's. On the
 * first `done` the result is fetched to disk and the reservation corrected —
 * exactly once, the SET NX lock keeps a concurrent poll from a second
 * `/result` call. DeepL bills only completed documents, so every route to
 * `error` gives the reservation back — under the same lock, so two polls of
 * an errored job release it once.
 */
export async function pollDocumentJob(
  jobId: string,
  userId: string,
  deps: DocumentJobDeps = {}
): Promise<TranslationDocumentStatusResponse | null> {
  const job = await loadJob(jobId, userId);
  if (!job) return null;
  if (job.phase !== 'translating') return toStatus(job);

  const service = resolveService(deps);
  const budget = deps.budget ?? getTreeBudget();
  const reservedUnits = job.reservedUnits ?? TREE_COST_DOCUMENT;
  const reservedDay = job.reservedDay ?? currentUtcDay();
  const state = await service.getDocumentStatus({
    documentId: job.documentId,
    documentKey: job.documentKey,
  });

  if (state.status === 'error') {
    job.phase = 'error';
    job.message = state.message ?? 'DeepL konnte das Dokument nicht übersetzen.';
    await saveJob(job);
    if (await claimSettlement(jobId)) await budget.release(userId, reservedUnits, reservedDay);
    return toStatus(job);
  }
  if (state.status !== 'done') {
    return toStatus(job, { status: state.status, secondsRemaining: state.secondsRemaining });
  }

  if (!(await claimSettlement(jobId))) {
    // Another poll is fetching; report progress and let the client ask again.
    return toStatus(job, { status: 'translating', secondsRemaining: 1 });
  }

  try {
    const result = await service.downloadDocument({
      documentId: job.documentId,
      documentKey: job.documentKey,
    });
    await fs.promises.mkdir(TRANSLATIONS_DIR, { recursive: true });
    const outputPath = path.join(TRANSLATIONS_DIR, `${job.jobId}${path.extname(job.filename)}`);
    await fs.promises.writeFile(outputPath, result.buffer);
    job.phase = 'ready';
    job.outputPath = outputPath;
    job.contentType = result.contentType;
    job.billedCharacters = state.billedCharacters;
    await saveJob(job);
    await budget.adjust(
      userId,
      treeCostForChars(Math.max(DOCUMENT_MIN_CHARS, state.billedCharacters ?? 0)) - reservedUnits,
      reservedDay
    );
    log.info(
      `[DeepLDocuments] job ${job.jobId} ready (${job.billedCharacters ?? '?'} chars billed)`
    );
  } catch (error) {
    job.phase = 'error';
    job.message = 'Das übersetzte Dokument konnte nicht abgeholt werden. Bitte erneut hochladen.';
    await saveJob(job);
    await budget.release(userId, reservedUnits, reservedDay);
    log.error(`[DeepLDocuments] result fetch failed for ${job.jobId}: ${(error as Error).message}`);
  } finally {
    await deleteCachedKey(lockKey(jobId));
  }
  return toStatus(job);
}

/** The buffered file for a ready job, or null. Idempotent while the job lives. */
export async function documentJobFile(
  jobId: string,
  userId: string
): Promise<{ path: string; filename: string; contentType: string | null } | null> {
  const job = await loadJob(jobId, userId);
  if (!job || job.phase !== 'ready' || !job.outputPath) return null;
  const resolved = path.resolve(job.outputPath);
  if (!resolved.startsWith(TRANSLATIONS_DIR + path.sep)) return null;
  try {
    await fs.promises.access(resolved, fs.constants.R_OK);
  } catch {
    return null;
  }
  return { path: resolved, filename: job.filename, contentType: job.contentType };
}

/** Removes buffered files older than the job TTL (crashed API, never-downloaded jobs). */
export async function sweepTranslationFiles(now: number = Date.now()): Promise<number> {
  let entries: string[];
  try {
    entries = await fs.promises.readdir(TRANSLATIONS_DIR);
  } catch {
    return 0;
  }
  let removed = 0;
  for (const entry of entries) {
    const file = path.join(TRANSLATIONS_DIR, entry);
    try {
      const stat = await fs.promises.stat(file);
      if (now - stat.mtimeMs > FILE_MAX_AGE_MS) {
        await fs.promises.unlink(file);
        removed++;
      }
    } catch {
      // raced with another sweep or a download — nothing to do
    }
  }
  if (removed > 0) log.info(`[DeepLDocuments] swept ${removed} expired file(s)`);
  return removed;
}
