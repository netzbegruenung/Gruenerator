import { type ContentItem, type ContentKind, contentKindSchema } from '@gruenerator/contracts';

import { createLogger } from '../../utils/logger.js';

import {
  type ContentCursor,
  compareByKey,
  decodeCursor,
  encodeCursor,
  sameKindFilter,
} from './contentCursor.js';
import { FETCHERS } from './contentQueries.js';

const log = createLogger('content');

const ALL_KINDS = contentKindSchema.options;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export interface ListContentResult {
  items: ContentItem[];
  nextCursor: string | null;
  degraded: ContentKind[];
}

/**
 * A malformed request, not a server fault. `reason` is written for the caller —
 * it is our own text about their query string, never a raw error from
 * downstream, which is what the handler is allowed to send back.
 */
export class BadContentRequest extends Error {
  constructor(public readonly reason: string) {
    super(reason);
    this.name = 'BadContentRequest';
  }
}

export function parseKinds(raw: string | undefined): ContentKind[] {
  if (!raw) return [...ALL_KINDS];
  const parts = raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return [...ALL_KINDS];

  const kinds: ContentKind[] = [];
  for (const part of parts) {
    const parsed = contentKindSchema.safeParse(part);
    if (!parsed.success) throw new BadContentRequest(`Unbekannte Art: ${part}`);
    if (!kinds.includes(parsed.data)) kinds.push(parsed.data);
  }
  return kinds;
}

export function parseLimit(raw: string | undefined): number {
  if (raw == null) return DEFAULT_LIMIT;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 1) return DEFAULT_LIMIT;
  return Math.min(Math.trunc(value), MAX_LIMIT);
}

function parseCursor(raw: string | undefined, kinds: ContentKind[]): ContentCursor | null {
  if (!raw) return null;
  const cursor = decodeCursor(raw);
  if (!cursor) throw new BadContentRequest('Ungültiger Cursor.');
  // Paging on with a different filter would skip rows the new filter should
  // include and repeat rows it should not — better a 400 than a wrong page.
  if (!sameKindFilter(cursor.kinds, kinds)) {
    throw new BadContentRequest('Der Cursor gehört zu einem anderen kind-Filter.');
  }
  return cursor;
}

export async function listContent(
  userId: string,
  query: { kind?: string | undefined; limit?: string | undefined; cursor?: string | undefined }
): Promise<ListContentResult> {
  const kinds = parseKinds(query.kind);
  const limit = parseLimit(query.limit);
  const cursor = parseCursor(query.cursor, kinds);

  // One row past the page, per kind: if the merged list overshoots, there is a
  // next page; if it does not, every kind was exhausted.
  const perKind = limit + 1;
  const degraded: ContentKind[] = [];

  const results = await Promise.all(
    kinds.map(async (kind) => {
      try {
        return await FETCHERS[kind](userId, perKind, cursor);
      } catch (error) {
        // Not an empty array. `/recent-activity` swallows source errors into
        // `[]`, which a surface cannot tell apart from "you have none" — a
        // broken JOIN then looks exactly like an empty account. Naming the
        // failure lets the UI say so.
        log.error(`Failed to fetch ${kind}:`, error);
        degraded.push(kind);
        return [] as ContentItem[];
      }
    })
  );

  const merged = results.flat().sort(compareByKey);
  const items = merged.slice(0, limit);
  const last = items[items.length - 1];
  const nextCursor =
    merged.length > limit && last
      ? encodeCursor({ date: last.date, kind: last.kind, id: last.id, kinds })
      : null;

  return { items, nextCursor, degraded };
}
