/**
 * Grünerator Docs Scraper
 * Indexes the Docusaurus documentation (documentation/docs) into Qdrant so the
 * Grünerator (chat + MCP) can answer questions about its own features.
 *
 * Reads local markdown from the repo — runs in CI (content-sync.yml) where the
 * full workspace is checked out, not from the prod API container (which does not
 * bundle the documentation package).
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getQdrantInstance } from '../../../database/services/QdrantService/index.js';
import {
  scrollDocuments,
  batchUpsert,
  batchDelete,
  getCollectionStats,
} from '../../../database/services/QdrantService/operations/batchOperations.js';
import { generatePointId } from '../../../utils/validation/index.js';
import { chunkQualityService } from '../../ChunkQualityService/index.js';
import { smartChunkDocument } from '../../document-services/index.js';
import { mistralEmbeddingService } from '../../mistral/index.js';
import { BaseScraper } from '../base/BaseScraper.js';

import type { QdrantService } from '../../../database/services/QdrantService/index.js';
import type { ScraperResult } from '../types.js';

/** Public base URL of the deployed Docusaurus site (env-overridable). */
const DOCS_SITE_URL = (process.env.GRUENERATOR_DOCS_URL || 'https://docs.gruenerator.eu').replace(
  /\/$/,
  ''
);

/** Folders excluded from the Docusaurus build (mirror docusaurus.config.ts `exclude`). */
const EXCLUDED_TOP_FOLDERS = new Set(['intern', 'monitor', 'briefings']);

/** Human-readable labels per top-level docs folder (drives `primary_category`). */
const CATEGORY_LABELS: Record<string, string> = {
  'ueber-den-gruenerator': 'Über den Grünerator',
  Grundlagen: 'Grundlagen',
  'llm-basics': 'LLM-Grundlagen',
  gruenerieren: 'Grünerieren',
  notebooks: 'Notebooks',
  Profil: 'Profil',
  integrationen: 'Integrationen',
  agents: 'Agenten',
  landesverbaende: 'Landesverbände',
  'signal-nachrichten': 'Signal-Nachrichten',
  newsletter: 'Newsletter',
};

interface DocFile {
  absPath: string;
  relPath: string;
}

interface ParsedDoc {
  url: string;
  title: string;
  description: string;
  category: string;
  text: string;
}

interface ProcessResult {
  stored: boolean;
  reason?: string;
  chunks?: number;
  vectors?: number;
  updated?: boolean;
}

interface ExistingDoc {
  content_hash: string;
}

interface SkipReason {
  count: number;
  examples: string[];
}

export interface GrueneratorDocsCrawlResult {
  totalFiles: number;
  stored: number;
  updated: number;
  skipped: number;
  errors: number;
  totalVectors: number;
  duration: number;
  skipReasons: {
    too_short: SkipReason;
    no_chunks: SkipReason;
    unchanged: SkipReason;
  };
}

export interface GrueneratorDocsCrawlOptions {
  forceUpdate?: boolean;
}

export class GrueneratorDocsScraper extends BaseScraper {
  private docsDir: string;
  private qdrantService: QdrantService | null;

  constructor() {
    super({ collectionName: 'gruenerator_docs', verbose: true });
    const here = path.dirname(fileURLToPath(import.meta.url));
    // apps/api/services/scrapers/implementations → repo root → documentation/docs
    this.docsDir = path.resolve(here, '../../../../../documentation/docs');
    this.qdrantService = null;
  }

  private get qdrant(): QdrantService {
    if (!this.qdrantService) {
      throw new Error('GrueneratorDocsScraper not initialized. Call init() first.');
    }
    return this.qdrantService;
  }

  async init(): Promise<void> {
    this.qdrantService = getQdrantInstance();
    await this.qdrantService.init();
    await mistralEmbeddingService.init();
    this.log('Service initialized');
  }

  async scrape(): Promise<ScraperResult> {
    const result = await this.fullCrawl();
    return {
      documentsProcessed: result.stored + result.updated,
      chunksCreated: result.totalVectors,
      vectorsStored: result.totalVectors,
      errors: [],
      duration: result.duration * 1000,
    };
  }

  /** Recursively collect .md/.mdx files, skipping build-excluded top folders. */
  #discoverFiles(): DocFile[] {
    const files: DocFile[] = [];
    const walk = (dir: string): void => {
      let entries: string[];
      try {
        entries = readdirSync(dir);
      } catch {
        return;
      }
      for (const entry of entries) {
        const abs = path.join(dir, entry);
        const rel = path.relative(this.docsDir, abs);
        const topFolder = rel.split(path.sep)[0];
        if (EXCLUDED_TOP_FOLDERS.has(topFolder)) continue;
        if (statSync(abs).isDirectory()) {
          walk(abs);
        } else if (/\.mdx?$/.test(entry)) {
          files.push({ absPath: abs, relPath: rel });
        }
      }
    };
    walk(this.docsDir);
    return files;
  }

  #parseDoc(file: DocFile): ParsedDoc | null {
    const raw = readFileSync(file.absPath, 'utf-8');
    const { data, body } = parseFrontmatter(raw);

    const segments = file.relPath.replace(/\\/g, '/').split('/');
    const topFolder = segments.length > 1 ? segments[0] : '';
    const category = CATEGORY_LABELS[topFolder] || (topFolder ? humanize(topFolder) : 'Allgemein');

    const h1 = /^#\s+(.+)$/m.exec(body);
    const baseName = path.basename(file.relPath).replace(/\.mdx?$/, '');
    const title = (data.title || (h1 ? h1[1].trim() : humanize(baseName))).trim();

    const text = markdownToText(body);
    const description = (data.description || text.slice(0, 220)).trim();

    return {
      url: buildDocUrl(file.relPath, data.slug),
      title,
      description,
      category,
      text,
    };
  }

  async #docExists(url: string): Promise<ExistingDoc | null> {
    try {
      const points = await scrollDocuments(
        this.qdrant.client!,
        this.config.collectionName,
        { must: [{ key: 'source_url', match: { value: url } }] },
        { limit: 1, withPayload: true, withVector: false }
      );
      if (points.length > 0) {
        return { content_hash: points[0].payload.content_hash as string };
      }
      return null;
    } catch {
      return null;
    }
  }

  async #deleteDoc(url: string): Promise<void> {
    await batchDelete(this.qdrant.client!, this.config.collectionName, {
      must: [{ key: 'source_url', match: { value: url } }],
    });
  }

  async #processAndStore(doc: ParsedDoc, forceUpdate: boolean): Promise<ProcessResult> {
    if (!doc.text || doc.text.length < 80) {
      return { stored: false, reason: 'too_short' };
    }

    const contentHash = this.generateHash(doc.text);
    const existing = await this.#docExists(doc.url);
    if (existing && !forceUpdate && existing.content_hash === contentHash) {
      return { stored: false, reason: 'unchanged' };
    }
    if (existing) {
      await this.#deleteDoc(doc.url);
    }

    const chunks = await smartChunkDocument(doc.text, {
      baseMetadata: { title: doc.title, source: 'gruenerator-docs', source_url: doc.url },
    });
    if (chunks.length === 0) {
      return { stored: false, reason: 'no_chunks' };
    }

    const chunkTexts = chunks.map((c) => c.text);
    const embeddings = await mistralEmbeddingService.generateBatchEmbeddings(chunkTexts);

    const points = chunks.map((_chunk, index) => ({
      id: generatePointId('gruenerator-docs', doc.url, index),
      vector: embeddings[index],
      payload: {
        article_id: `gruenerator_docs_${contentHash}`,
        source_url: doc.url,
        content_hash: contentHash,
        chunk_index: index,
        chunk_text: chunkTexts[index],
        quality_score: chunkQualityService.calculateQualityScore(chunkTexts[index]),
        content_type: 'dokumentation',
        primary_category: doc.category,
        title: doc.title,
        description: doc.description,
        source: 'gruenerator-docs',
        indexed_at: new Date().toISOString(),
        ...(index === 0 ? { full_text: doc.text } : {}),
      },
    }));

    for (let i = 0; i < points.length; i += 10) {
      await batchUpsert(this.qdrant.client!, this.config.collectionName, points.slice(i, i + 10));
    }

    return { stored: true, chunks: chunks.length, vectors: points.length, updated: !!existing };
  }

  async fullCrawl(options: GrueneratorDocsCrawlOptions = {}): Promise<GrueneratorDocsCrawlResult> {
    const { forceUpdate = false } = options;
    const startTime = Date.now();

    const result: GrueneratorDocsCrawlResult = {
      totalFiles: 0,
      stored: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      totalVectors: 0,
      duration: 0,
      skipReasons: {
        too_short: { count: 0, examples: [] },
        no_chunks: { count: 0, examples: [] },
        unchanged: { count: 0, examples: [] },
      },
    };

    if (!isDirectory(this.docsDir)) {
      this.logError(
        `Docs directory not found at ${this.docsDir}. This scraper reads the repo — run it from a full workspace checkout (CI), not the prod API container.`
      );
      result.duration = Math.round((Date.now() - startTime) / 1000);
      return result;
    }

    const files = this.#discoverFiles();
    result.totalFiles = files.length;
    this.log(`Discovered ${files.length} documentation files`);

    for (const file of files) {
      try {
        const doc = this.#parseDoc(file);
        if (!doc) continue;

        const processResult = await this.#processAndStore(doc, forceUpdate);
        if (processResult.stored) {
          if (processResult.updated) result.updated++;
          else result.stored++;
          result.totalVectors += processResult.vectors || 0;
          this.log(`"${doc.title.substring(0, 50)}" (${processResult.chunks} chunks)`);
        } else {
          result.skipped++;
          const reason = processResult.reason;
          if (reason && result.skipReasons[reason as keyof typeof result.skipReasons]) {
            const skipReason = result.skipReasons[reason as keyof typeof result.skipReasons];
            skipReason.count++;
            if (skipReason.examples.length < 5) skipReason.examples.push(file.relPath);
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[GrueneratorDocs] Error processing ${file.relPath}: ${errorMessage}`);
        result.errors++;
      }
    }

    result.duration = Math.round((Date.now() - startTime) / 1000);
    this.log(
      `COMPLETED: ${result.stored} new, ${result.updated} updated (${result.totalVectors} vectors), ${result.skipped} skipped, ${result.errors} errors`
    );
    return result;
  }

  async getStats(): Promise<{
    collection: string;
    vectors_count?: number;
    points_count?: number;
    status?: string;
    error?: string;
  }> {
    try {
      const stats = await getCollectionStats(this.qdrant.client!, this.config.collectionName);
      return {
        collection: this.config.collectionName,
        ...(stats.vectors_count !== undefined && { vectors_count: stats.vectors_count }),
        ...(stats.points_count !== undefined && { points_count: stats.points_count }),
        ...(stats.status !== undefined && { status: stats.status }),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { collection: this.config.collectionName, error: errorMessage };
    }
  }
}

// =============================================================================
// Helpers
// =============================================================================

function isDirectory(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function parseFrontmatter(raw: string): { data: Record<string, string>; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  if (!match) return { data: {}, body: raw };

  const data: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line
      .slice(idx + 1)
      .trim()
      .replace(/^['"]|['"]$/g, '');
    if (key) data[key] = value;
  }
  return { data, body: raw.slice(match[0].length) };
}

/** Build the public Docusaurus URL for a docs file (respects a frontmatter slug). */
function buildDocUrl(relPath: string, slug?: string): string {
  const normalized = relPath.replace(/\\/g, '/');
  let route: string;
  if (slug && slug.startsWith('/')) {
    route = slug;
  } else {
    const cleaned = normalized
      .replace(/\.mdx?$/, '')
      .replace(/\/index$/, '')
      .split('/')
      .map((seg) => seg.replace(/^\d+-/, '')) // drop Docusaurus numeric prefixes
      .join('/');
    route = `/${cleaned}`;
  }
  return `${DOCS_SITE_URL}/docs${route}`;
}

function markdownToText(md: string): string {
  return md
    .replace(/^import\s.+$/gm, '')
    .replace(/^export\s.+$/gm, '')
    .replace(/```(\w+)?/g, ' ') // keep code content, drop fences
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links → text
    .replace(/<[^>]+>/g, ' ') // html/jsx tags
    .replace(/^#{1,6}\s+/gm, '') // heading markers
    .replace(/^\s*>\s?/gm, '') // blockquotes
    .replace(/[*_`]/g, '') // emphasis / inline code
    .replace(/\|/g, ' ') // table pipes
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function humanize(slug: string): string {
  return slug
    .replace(/\.mdx?$/, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export const grueneratorDocsScraperService = new GrueneratorDocsScraper();
export default grueneratorDocsScraperService;
