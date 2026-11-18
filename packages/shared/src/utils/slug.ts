/**
 * Notebook slug helpers — Notion-style URLs.
 *
 *   "Wahlkampf 2026" + "Ab3xK9"  →  "wahlkampf-2026-Ab3xK9"
 *                                    └── name part ──┘└─id─┘
 *
 * The 6-char suffix is the stable identifier the backend resolves against;
 * the name prefix is cosmetic and updates whenever the notebook is renamed.
 */
import { customAlphabet } from 'nanoid';

const SUFFIX_LENGTH = 6;

// URL-safe alphabet without visually ambiguous chars (no 0/O, 1/l/I).
const SUFFIX_ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const nanoidSuffix = customAlphabet(SUFFIX_ALPHABET, SUFFIX_LENGTH);
const COMBINING_DIACRITICS = /[̀-ͯ]/g;
const SUFFIX_RE = new RegExp(`-([${SUFFIX_ALPHABET}]{${SUFFIX_LENGTH}})$`);

/**
 * Turn an arbitrary user-supplied name into a URL-safe slug fragment.
 * German umlauts and ß are transliterated (ä→ae, ö→oe, ü→ue, ß→ss) so
 * "Bürger*innen" stays readable as "buerger-innen" instead of collapsing
 * to "brger-innen". Remaining diacritics (e.g. French accents) are still
 * stripped via NFD because there's no single-locale transliteration that
 * makes sense for everything. Non-alphanumerics become `-`, repeats
 * collapsed, length capped at 40 chars. Empty results (e.g. all-emoji
 * titles) fall back to `fallback` (default "notebook"; pass "gruppe" etc.
 * for other resource types).
 */
const GERMAN_TRANSLITERATIONS: Array<[RegExp, string]> = [
  [/ä/g, 'ae'],
  [/ö/g, 'oe'],
  [/ü/g, 'ue'],
  [/Ä/g, 'Ae'],
  [/Ö/g, 'Oe'],
  [/Ü/g, 'Ue'],
  [/ß/g, 'ss'],
];

export function slugifyName(name: string, fallback = 'notebook'): string {
  let transliterated = name;
  for (const [pattern, replacement] of GERMAN_TRANSLITERATIONS) {
    transliterated = transliterated.replace(pattern, replacement);
  }
  const normalized = transliterated
    .normalize('NFD')
    .replace(COMBINING_DIACRITICS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    // The line above collapses every run into a single '-', so one dash per
    // end is all there is to strip — and an unquantified pattern cannot
    // backtrack (CodeQL js/polynomial-redos).
    .replace(/^-|-$/g, '')
    .slice(0, 40)
    .replace(/-$/, '');
  return normalized || fallback;
}

/**
 * Generate a fresh 6-character slug suffix. nanoid's customAlphabet uses
 * rejection sampling on top of Web Crypto, so the output is uniformly
 * distributed across the alphabet (no modulo bias).
 */
export function generateSlugSuffix(): string {
  return nanoidSuffix();
}

/**
 * Same suffix from a caller-supplied random source — for React Native, where
 * Hermes has no `globalThis.crypto` and nanoid throws ("Property 'crypto'
 * doesn't exist"); the app passes `expo-crypto`'s `getRandomValues`. Bytes at
 * or above the largest multiple of the alphabet size are rejected, so the
 * result stays uniform like nanoid's.
 */
export function slugSuffixFrom(randomBytes: (count: number) => Uint8Array): string {
  const limit = 256 - (256 % SUFFIX_ALPHABET.length);
  let suffix = '';
  while (suffix.length < SUFFIX_LENGTH) {
    for (const byte of randomBytes(SUFFIX_LENGTH * 2)) {
      if (byte < limit) suffix += SUFFIX_ALPHABET[byte % SUFFIX_ALPHABET.length];
      if (suffix.length === SUFFIX_LENGTH) break;
    }
  }
  return suffix;
}

/**
 * Compose the final slug shown in the URL: `<slugified-name>-<suffix>`.
 */
export function buildNotebookSlug(name: string, suffix: string): string {
  return `${slugifyName(name)}-${suffix}`;
}

/**
 * Group variant of {@link buildNotebookSlug}: `<slugified-name>-<suffix>`
 * with a "gruppe" fallback for empty names. Resolution reuses the shared
 * {@link extractSlugSuffix} (the suffix shape is identical across resources).
 */
export function buildGroupSlug(name: string, suffix: string): string {
  return `${slugifyName(name, 'gruppe')}-${suffix}`;
}

/**
 * Chat-thread variant of {@link buildNotebookSlug}: `<slugified-title>-<suffix>`
 * with a "chat" fallback for untitled threads. Resolution reuses the shared
 * {@link extractSlugSuffix}.
 */
export function buildChatThreadSlug(title: string | null, suffix: string): string {
  return `${slugifyName(title ?? '', 'chat')}-${suffix}`;
}

/**
 * Pull the stable 6-char suffix back out of a slug. Returns null if the
 * input does not end in `-<6 alphabet chars>`. Callers should fall back
 * to UUID-style lookup when this returns null.
 */
export function extractSlugSuffix(slug: string): string | null {
  const match = SUFFIX_RE.exec(slug);
  return match?.[1] ?? null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * What a share link carries as its key: the suffix of `<name>-<suffix>`, or the
 * uuid of a link from before the suffix. `null` means an identifier or a
 * mention — those resolve only against the caller's own lists, never on the
 * server, because they are unique only per owner (agents, recipes).
 */
export function shareLinkKey(slug: string): { slugSuffix: string } | { id: string } | null {
  if (UUID_RE.test(slug)) return { id: slug };
  const suffix = extractSlugSuffix(slug);
  return suffix ? { slugSuffix: suffix } : null;
}
