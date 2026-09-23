/**
 * Eine System-Sammlung als Qdrant-Fake für `SystemNotebookSourcesDeps`.
 *
 * Die Fakes filtern so, wie die echten Primitiven es tun — genau darauf kommt
 * es an: `getSystemDocumentFullTextByUrl` wendet den Standardfilter der
 * Sammlung an, `getDocumentChunks` (Identität über `source_url`) NICHT. Eine
 * URL aus einem anderen Landesverband liefert dort also Chunks.
 */
import { vi } from 'vitest';

import type { DocumentResult } from '../../BaseSearchService/types.js';
import type { SystemNotebookSourcesDeps } from '../systemNotebookSources.js';

export interface FakePoint {
  qdrantCollection: string;
  payload: Record<string, unknown>;
}

type Clause = { key: string; match?: { value?: unknown; any?: unknown[] } };

function matches(payload: Record<string, unknown>, filter: unknown): boolean {
  const must = ((filter as { must?: Clause[] } | undefined)?.must ?? []) as Clause[];
  return must.every((c) => {
    const v = payload[c.key];
    if (c.match?.any) return c.match.any.includes(v);
    return v === c.match?.value;
  });
}

/** Ein Dokument als Punkte: Chunk 0 trägt Titel, Datum, optional `full_text`. */
export function fakeDoc(
  qdrantCollection: string,
  url: string,
  chunks: string[],
  extra: Record<string, unknown> = {},
  opts: { fullText?: string; pages?: Array<number | null> } = {}
): FakePoint[] {
  return chunks.map((text, i) => ({
    qdrantCollection,
    payload: {
      source_url: url,
      chunk_index: i,
      chunk_text: text,
      page_number: opts.pages?.[i] ?? null,
      title: extra.title ?? url,
      ...extra,
      ...(i === 0 && opts.fullText ? { full_text: opts.fullText } : {}),
    },
  }));
}

export function makeSystemDeps(
  points: FakePoint[],
  opts: {
    searchResults?: DocumentResult[];
    searchError?: string;
    /** Jede Scroll-Seite ist voll und hat eine Folgeseite — für den Deckel. */
    endless?: boolean;
  } = {}
) {
  const scrollPage = vi.fn(
    async (
      qdrantCollection: string,
      filter: unknown,
      o: { limit: number; offset: string | number | null; payload: readonly string[] }
    ) => {
      if (opts.endless) {
        const base = typeof o.offset === 'number' ? o.offset : 0;
        return {
          points: Array.from({ length: o.limit }, (_, i) => ({
            payload: {
              source_url: `https://x.de/${base + i}`,
              title: `Dok ${base + i}`,
              chunk_index: 0,
            },
          })),
          nextOffset: base + o.limit,
        };
      }
      const hits = points.filter(
        (p) => p.qdrantCollection === qdrantCollection && matches(p.payload, filter)
      );
      const start = typeof o.offset === 'number' ? o.offset : 0;
      const page = hits.slice(start, start + o.limit).map((p) => ({
        payload: Object.fromEntries(
          Object.entries(p.payload).filter(([k]) => o.payload.includes(k))
        ),
      }));
      const next = start + o.limit;
      return { points: page, nextOffset: next < hits.length ? next : null };
    }
  );

  const getSystemDocumentFullTextByUrl = vi.fn(
    async (qdrantCollection: string, sourceUrl: string, defaultFilter?: unknown) => {
      const docPoints = points
        .filter(
          (p) =>
            p.qdrantCollection === qdrantCollection &&
            p.payload.source_url === sourceUrl &&
            matches(p.payload, defaultFilter)
        )
        .sort((a, b) => Number(a.payload.chunk_index) - Number(b.payload.chunk_index));
      if (docPoints.length === 0) {
        return { success: false, fullText: '', chunkCount: 0, error: 'Document not found' };
      }
      const head = docPoints[0]!.payload;
      const title = typeof head.title === 'string' ? head.title : undefined;
      if (typeof head.full_text === 'string' && head.full_text) {
        return { success: true, fullText: head.full_text, chunkCount: 1, ...(title && { title }) };
      }
      const texts = docPoints.map((p) => String(p.payload.chunk_text));
      return {
        success: true,
        fullText: texts.join('\n\n'),
        chunkCount: texts.length,
        ...(title && { title }),
      };
    }
  );

  const getDocumentChunks = vi.fn(
    async (_userId: string, documentId: string, o?: { qdrantCollection?: string }) => {
      const chunks = points
        .filter(
          (p) => p.qdrantCollection === o?.qdrantCollection && p.payload.source_url === documentId
        )
        .map((p) => ({
          index: Number(p.payload.chunk_index),
          text: String(p.payload.chunk_text),
          tokens: 1,
          pageNumber: typeof p.payload.page_number === 'number' ? p.payload.page_number : null,
          charStart: null,
          charEnd: null,
          headingPath: Array.isArray(p.payload.heading_path)
            ? (p.payload.heading_path as string[])
            : null,
          heading: null,
          sectionIndex:
            typeof p.payload.section_index === 'number' ? p.payload.section_index : null,
          chunkType: null,
        }))
        .sort((a, b) => a.index - b.index);
      return chunks.length
        ? { success: true, chunks, chunkCount: chunks.length }
        : { success: false, chunks: [], chunkCount: 0, error: 'No chunks found' };
    }
  );

  const search = vi.fn(async () => ({
    success: !opts.searchError,
    ...(opts.searchError ? { error: opts.searchError } : {}),
    results: opts.searchResults ?? [],
    query: '',
    searchType: 'hybrid',
    message: '',
  }));

  const rerank = vi.fn();

  const deps = {
    scrollPage,
    documentService: { getSystemDocumentFullTextByUrl, getDocumentChunks, search },
    rerank,
  } as unknown as SystemNotebookSourcesDeps;
  return { deps, scrollPage, getSystemDocumentFullTextByUrl, getDocumentChunks, search, rerank };
}

/** Ein Suchtreffer der Dokumentsuche, wie sie für System-Sammlungen antwortet. */
export function fakeSearchDoc(
  url: string,
  title: string,
  score: number,
  chunks: Array<{
    chunk_index: number;
    text: string;
    page_number?: number | null;
    char_start?: number | null;
    char_end?: number | null;
  }>
): DocumentResult {
  return {
    document_id: url,
    source_url: url,
    title,
    relevant_content: chunks[0]?.text ?? '',
    similarity_score: score,
    max_similarity: score,
    avg_similarity: score,
    chunk_count: chunks.length,
    top_chunks: chunks.map((c) => ({ ...c, preview: c.text.slice(0, 50) })),
  } as DocumentResult;
}
