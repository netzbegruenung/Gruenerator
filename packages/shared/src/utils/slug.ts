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
 * titles) fall back to "notebook".
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

export function slugifyName(name: string): string {
  let transliterated = name;
  for (const [pattern, replacement] of GERMAN_TRANSLITERATIONS) {
    transliterated = transliterated.replace(pattern, replacement);
  }
  const normalized = transliterated
    .normalize('NFD')
    .replace(COMBINING_DIACRITICS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return normalized || 'notebook';
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
 * Compose the final slug shown in the URL: `<slugified-name>-<suffix>`.
 */
export function buildNotebookSlug(name: string, suffix: string): string {
  return `${slugifyName(name)}-${suffix}`;
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
