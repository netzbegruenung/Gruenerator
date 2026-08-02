/**
 * Stable, stateless identity for a search hit — the `ref` an MCP client cites
 * against.
 *
 * The chat solves the same problem with a per-turn registry (`sourceRegistry`),
 * which numbers sources `[1]`, `[2]`, … as they arrive. MCP has no equivalent:
 * the transport is stateless, every POST builds a fresh server, and the client —
 * not us — writes the prose. So the server cannot hand out numbers that mean
 * anything on the next call. What it CAN hand out is a key derived from the hit
 * itself, which the client dedupes and numbers on its own.
 *
 * Derived from the URL, not from `document_id`, for two measured reasons
 * (02.08.2026, production Qdrant, `points/count` with `is_empty`):
 *
 *  - `document_id` is absent in 4 of 7 populated collections (bundestag_content,
 *    kommunalwiki, gruenblog, boell — 12.847 of 54.467 points). `source_url` is
 *    absent in none.
 *  - Where it exists it is CONTENT-derived (`lv_${md5(text)}`,
 *    `gruene_at_${md5(text)}`), so editing a page mints a new id. Landesverbände
 *    re-sync hourly. The URL survives exactly the event the id does not.
 *
 * No collection prefix on purpose: the same document reachable through two
 * collections is one source, and the multi-collection search path already
 * dedupes on precisely that assumption.
 */

const FNV_OFFSET_BASIS = 14695981039346656037n;
const FNV_PRIME = 1099511628211n;
const MASK_64 = (1n << 64n) - 1n;

/** Length of the emitted ref. 10 base36 chars ≈ 51 bits — far past the birthday
 *  bound for a corpus of this size, and still short enough to sit inside a
 *  citation marker without dominating the line. */
const REF_LENGTH = 10;

/**
 * FNV-1a over UTF-16 code units. Not byte-identical to canonical FNV-1a for
 * non-ASCII input — irrelevant here, because the only requirement is that every
 * producer of a ref runs this same function. Chosen over a crypto hash so the
 * helper stays usable in a browser bundle (`@gruenerator/shared` re-exports it).
 */
function fnv1a64(input: string): bigint {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < input.length; i++) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = (hash * FNV_PRIME) & MASK_64;
  }
  return hash;
}

/**
 * Normalise a source URL so trivial variants of one page collapse onto one ref:
 * fragment dropped, trailing slashes trimmed, host lowercased. The query string
 * is KEPT — for the wiki-style sources in the corpus it is part of the page
 * identity, not decoration.
 *
 * Anything `new URL()` cannot parse is passed through trimmed rather than
 * discarded: an unparsable but consistent string still yields a consistent ref.
 */
export function canonicalizeSourceUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  try {
    const url = new URL(trimmed);
    const path = url.pathname.replace(/\/+$/, '');
    return `${url.protocol}//${url.host.toLowerCase()}${path}${url.search}`;
  } catch {
    return trimmed;
  }
}

export interface SourceRefInput {
  url?: string | null | undefined;
  /** Only used when the hit carries no URL at all. */
  documentId?: string | null | undefined;
  /** Last resort: the vector store's point id. Stable only until re-indexing. */
  pointId?: string | number | null | undefined;
}

/**
 * The citation key for one hit, or `null` when nothing identifies it — in which
 * case the field belongs omitted rather than filled with a placeholder a client
 * would dedupe against.
 */
export function buildSourceRef(source: SourceRefInput): string | null {
  const url = typeof source.url === 'string' ? canonicalizeSourceUrl(source.url) : '';
  const basis =
    url ||
    (typeof source.documentId === 'string' && source.documentId.trim()) ||
    (source.pointId != null ? String(source.pointId) : '');
  if (!basis) return null;
  return fnv1a64(basis).toString(36).slice(0, REF_LENGTH);
}
