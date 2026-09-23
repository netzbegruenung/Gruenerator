/**
 * Document Processor
 * Orchestrates document processing and storage pipeline
 * Handles: validation, age filter, deduplication, chunking, embedding, storage
 */

import {
  CONTENT_TYPE_LABELS,
  DEFAULT_MAX_AGE_YEARS,
  getCuratedListsForUrl,
  getCuratedContentTypeForUrl,
} from '../../../../../config/landesverbaendeConfig.js';
import {
  scrollDocuments,
  batchDelete,
  batchUpsert,
  setPayload,
} from '../../../../../database/services/QdrantService/operations/batchOperations.js';
import { chunkQualityService } from '../../../../ChunkQualityService/index.js';
import {
  buildEmbeddingTextsForChunks,
  embeddingPayload,
  offsetPayload,
  smartChunkDocument,
  structurePayload,
} from '../../../../document-services/index.js';
import { mistralEmbeddingService } from '../../../../mistral/index.js';
import { recordSyncEvent, toExcerpt } from '../../../syncEventRecorder.js';
import { ContentExtractor } from '../extractors/ContentExtractor.js';
import { DateExtractor } from '../extractors/DateExtractor.js';

import type { LandesverbandSource } from '../../../../../config/landesverbaendeConfig.js';
import type { ProcessResult, ExtractedContent } from '../types.js';
import type { QdrantClient } from '@qdrant/js-client-rest';

/**
 * DateExtractor's year-only fallback — never a better date than one already
 * stored. Only for callers without `date_precision` (HTML pages); PDFs say it.
 */
const YEAR_ONLY_GUESS = /-06-15$/;
const CHECKED_AT_REFRESH_MS = 24 * 60 * 60 * 1000;

/** Stored title matching one of the LV sites' generic link-label texts, not a real title. */
const GENERIC_TITLE_PATTERN = /^(dokument|herunterladen|download|pdf|hier)[.:!…]*$/i;

/** Input `qualityFlagsFor` needs to decide which defect classes apply. */
export interface QualityFlagDoc {
  /**
   * `ContentExtractor.normalizeTitle(content.title)` — the normalized title
   * BEFORE the `<source.name> - <label>` fallback. Must be normalized, not
   * `content.title` raw: a whitespace/`&nbsp;`-only title normalizes to `''`
   * and falls back too, so checking the raw string would miss it.
   */
  originalTitle: string;
  /** The title actually stored (after the fallback, if any). */
  storedTitle: string;
  /**
   * Whether this document came from the PDF-archive or Wolke-share path
   * (downloaded and read as a file) rather than the HTML-article path
   * (scraped as a page). Passed in by the caller — the scraper already knows
   * which path it is running, so this is never guessed from the URL's shape
   * (a URL guess previously misclassified extension-less `/download/` links
   * and `.pdf#page=2` fragments).
   */
  isFile: boolean;
  publishedAt: string | null;
  bodyFallback: boolean;
}

/**
 * Data-quality defect classes for one stored/updated document (#3573–#3580).
 * Pure and side-effect-free so it can be tested as a truth table; the caller
 * turns the result into per-run counts (see `resultSamples.mergeQualityFlags`).
 */
export function qualityFlagsFor(doc: QualityFlagDoc): string[] {
  const flags: string[] = [];

  if (!doc.originalTitle) flags.push('title_fallback');
  if (GENERIC_TITLE_PATTERN.test(doc.storedTitle.trim())) flags.push('title_generic');

  if (!doc.isFile && doc.publishedAt === null) flags.push('date_missing_html');
  // DateExtractor.extractDateFromPdfInfo's year-only fallback guesses June
  // 15th when only a year is found. A precision field would say this
  // outright; until one exists (P4, not on this branch) the date's shape is
  // the only signal available here.
  if (doc.isFile && doc.publishedAt && YEAR_ONLY_GUESS.test(doc.publishedAt)) {
    flags.push('date_year_only');
  }

  if (doc.bodyFallback) flags.push('body_fallback');

  return flags;
}

/**
 * Document processing orchestration
 * Dependencies injected via constructor for testability
 */
export class DocumentProcessor {
  constructor(
    private qdrantClient: QdrantClient,
    private collectionName: string,
    private generateHash: (text: string) => string,
    private generatePointId: (url: string, chunkIndex: number) => number,
    private config: { batchSize: number }
  ) {}

  /**
   * Process and store document in Qdrant
   * Full pipeline: validate → deduplicate → chunk → embed → store
   * @param isFile - Whether the caller is the PDF-archive or Wolke-share path
   *   (downloaded file) rather than the HTML-article path (scraped page). Only
   *   used for `qualityFlagsFor` — the caller already knows which path it runs.
   * @param collectionOverride - Optional collection name override (uses default if not provided)
   * @param maxAgeYears - Optional max age in years (default: 10)
   * @param ignoreMaxAge - Skip the age filter even though publishedAt is set. Wolke shares are
   *   curated on purpose and must never age out just because their file name now carries a real
   *   date (#3564) — before dating them, `publishedAt: null` had the same effect by construction.
   */
  async processAndStoreDocument(
    source: LandesverbandSource,
    contentType: string,
    url: string,
    content: ExtractedContent,
    isFile: boolean,
    collectionOverride?: string,
    maxAgeYears?: number,
    extraPayload?: Record<string, unknown>,
    ignoreMaxAge?: boolean
  ): Promise<ProcessResult> {
    const { title, text, publishedAt, categories } = content;
    const targetCollection = collectionOverride || this.collectionName;
    const ageLimit = maxAgeYears ?? DEFAULT_MAX_AGE_YEARS;

    // A curated list (e.g. wahlprogramm-be) may override the scraping path's
    // content type so a canonical subset surfaces under its own "Typ" filter
    // value (Wahlprogramm) rather than the generic path type (Beschluss).
    const effectiveContentType = getCuratedContentTypeForUrl(url) ?? contentType;

    // STEP 1: Validation - minimum length check
    if (!text || text.length < 100) {
      return { stored: false, reason: 'too_short' };
    }

    // STEP 2: Age filter - skip content older than configured years
    if (publishedAt && !ignoreMaxAge) {
      const pubDate = new Date(publishedAt);
      if (DateExtractor.isDateTooOld(pubDate, ageLimit)) {
        return { stored: false, reason: 'too_old' };
      }
    }

    // STEP 3: Deduplication check
    const contentHash = this.generateHash(text);
    const existingPoints = await scrollDocuments(
      this.qdrantClient,
      targetCollection,
      {
        must: [{ key: 'source_url', match: { value: url } }],
      },
      {
        limit: 1,
        withPayload: true,
        withVector: false,
      }
    );

    const existingPayload = existingPoints.length > 0 ? existingPoints[0].payload : null;
    const existing = existingPayload !== null;

    if (existingPayload && existingPayload.content_hash === contentHash) {
      // Der Text ist gleich — die Buchhaltung des Aufrufers (Datei-Fingerprint,
      // ETag) kann es trotzdem nicht sein: beim ersten Lauf nach dem Deploy hat
      // der Punkt noch gar keinen Fingerprint, und ein neu vergebener ETag
      // ändert sich auch bei unverändertem Text. Würden wir hier nur
      // zurückkehren, bliebe der Punkt für immer ohne Fingerprint und die Datei
      // würde in jedem Lauf neu heruntergeladen und ausgelesen — genau der
      // Aufwand, den der Fingerprint einspart.
      // Dasselbe gilt für Titel und Datum: ein reparierter Extraktor erreicht
      // sonst nur Seiten, deren Text sich geändert hat (#3578).
      await this.#refreshStoredPayload(
        targetCollection,
        url,
        { title, publishedAt },
        extraPayload,
        existingPayload
      );
      return { stored: false, reason: 'unchanged' };
    }

    // STEP 4: Delete old version if exists (update scenario)
    if (existing) {
      await batchDelete(this.qdrantClient, targetCollection, {
        must: [{ key: 'source_url', match: { value: url } }],
      });
    }

    // STEP 5: Build document title — hier treffen HTML-, PDF- und Wolke-Pfad
    // zusammen; Dateinamen-Titel sähen den HTML-Extraktor sonst nie (#3560).
    const normalizedTitle = ContentExtractor.normalizeTitle(title);
    const documentTitle =
      normalizedTitle ||
      `${source.name} - ${(CONTENT_TYPE_LABELS as Record<string, string>)[effectiveContentType] || effectiveContentType}`;

    // STEP 6: Chunk document
    const chunks = await smartChunkDocument(text, {
      baseMetadata: {
        title: documentTitle,
        source: 'landesverbaende_gruene',
        source_url: url,
      },
    });

    if (chunks.length === 0) {
      return { stored: false, reason: 'no_chunks' };
    }

    // STEP 7: Generate embeddings
    const chunkTexts = chunks.map(
      (c: { text?: string; chunk_text?: string }) => c.text || c.chunk_text || ''
    );
    const embeddings = await mistralEmbeddingService.generateBatchEmbeddings(
      buildEmbeddingTextsForChunks(chunks, documentTitle)
    );

    // STEP 8: Build Qdrant points (with quality scoring)
    const curatedLists = getCuratedListsForUrl(url);
    const now = new Date().toISOString();
    const points = chunks.map((chunk, index) => ({
      id: this.generatePointId(url, index),
      vector: embeddings[index],
      payload: {
        document_id: `lv_${contentHash}`,
        source_url: url,
        source_id: source.id,
        source_name: source.name,
        landesverband: source.shortName,
        source_type: source.type,
        content_type: effectiveContentType,
        content_type_label:
          (CONTENT_TYPE_LABELS as Record<string, string>)[effectiveContentType] ||
          effectiveContentType,
        content_hash: contentHash,
        chunk_index: index,
        chunk_text: chunkTexts[index],
        ...structurePayload(chunk),
        ...embeddingPayload(),
        ...offsetPayload(chunk),
        quality_score: chunkQualityService.calculateQualityScore(chunkTexts[index]),
        title: documentTitle,
        primary_category: categories?.[0] || null,
        subcategories: categories || [],
        published_at: publishedAt || null,
        indexed_at: now,
        checked_at: now,
        source: 'landesverbaende_gruene',
        ...(curatedLists.length > 0 ? { curated_lists: curatedLists } : {}),
        ...(extraPayload ?? {}),
        ...(index === 0 ? { full_text: text } : {}),
      },
    }));

    // STEP 9: Store in batches
    const batchSize = this.config.batchSize;
    for (let i = 0; i < points.length; i += batchSize) {
      const batch = points.slice(i, i + batchSize);
      await batchUpsert(this.qdrantClient, targetCollection, batch);
    }

    recordSyncEvent({
      title: documentTitle,
      sourceUrl: url,
      sourceGroupId: 'landesverbaende',
      sourceName: source.name,
      excerpt: toExcerpt(text),
      landesverband: source.shortName,
      collection: targetCollection,
      eventType: existing ? 'updated' : 'stored',
      publishedAt: publishedAt || null,
    });

    const flags = qualityFlagsFor({
      originalTitle: normalizedTitle,
      storedTitle: documentTitle,
      isFile,
      publishedAt: publishedAt || null,
      bodyFallback: content.bodyFallback,
    });

    return {
      stored: true,
      chunks: chunks.length,
      vectors: points.length,
      updated: existing,
      qualityFlags: Object.fromEntries(flags.map((flag) => [flag, 1])),
    };
  }

  /**
   * One `setPayload` per unchanged document: the `extraPayload` keys and the
   * extracted title/date whose stored value differs, plus `checked_at`, on
   * which the staggered re-check keys (`indexed_at` stays the embedding time).
   * An empty title or a null date is never written over a stored value — SL
   * PDFs with processUndatedPdfs and every Wolke file pass `publishedAt: null`;
   * neither is a year-only guess over a stored date (`date_precision: 'year'`,
   * or the `-06-15` regex for callers that pass no precision). A refused date
   * takes its `date_precision` with it, so the pair stays consistent. Young pages
   * are re-fetched on every run past RECHECK_AFTER_MS (this branch never bumps
   * `indexed_at`), so a bare `checked_at` is only rewritten once it is a day old.
   */
  async #refreshStoredPayload(
    targetCollection: string,
    url: string,
    extracted: { title: string; publishedAt: string | null },
    extraPayload: Record<string, unknown> | undefined,
    existingPayload: Record<string, unknown>
  ): Promise<void> {
    const candidates: Record<string, unknown> = { ...(extraPayload ?? {}) };
    // Normalisiert wie beim Speichern (STEP 5), sonst kippte der Titel hin und her.
    const title = ContentExtractor.normalizeTitle(extracted.title);
    if (title) candidates.title = title;
    const yearOnly =
      extraPayload && 'date_precision' in extraPayload
        ? extraPayload.date_precision === 'year'
        : YEAR_ONLY_GUESS.test(extracted.publishedAt ?? '');
    if (extracted.publishedAt && !(existingPayload.published_at && yearOnly)) {
      candidates.published_at = extracted.publishedAt;
    } else {
      delete candidates.date_precision;
    }
    const patch = Object.fromEntries(
      Object.entries(candidates).filter(([key, value]) => existingPayload[key] !== value)
    );

    const checkedAt = new Date(String(existingPayload.checked_at ?? '')).getTime();
    if (Object.keys(patch).length === 0 && Date.now() - checkedAt < CHECKED_AT_REFRESH_MS) return;

    await setPayload(
      this.qdrantClient,
      targetCollection,
      { ...patch, checked_at: new Date().toISOString() },
      { must: [{ key: 'source_url', match: { value: url } }] }
    );
  }
}
