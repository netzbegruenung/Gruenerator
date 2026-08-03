/**
 * The type registry itself moved to `@gruenerator/shared/docs` — the chat's
 * "Dokument erstellt" card renders the same kinds and may not carry a second
 * colour/label table. Re-exported here so the docs feature keeps its familiar
 * import; what stays below is the composer's own prompt heuristics, which are
 * web-only.
 */
export {
  ARTIFACT_TYPE_META,
  DOC_TYPE_META,
  subtypeToArtifactKind,
  subtypeToKind,
  type ArtifactKind,
  type DocKind,
  type DocTypeMeta,
} from '@gruenerator/shared/docs';

import { type DocKind } from '@gruenerator/shared/docs';

// Keyword buckets ported verbatim from the design's `detect()` — the regex/keyword
// classifier that turns a free-text create prompt into a target content kind.
const KIND_KEYWORDS: Record<Exclude<DocKind, 'doc'>, string[]> = {
  sharepic: [
    'sharepic',
    'share-pic',
    'zitat',
    'kachel',
    'instagram',
    'insta',
    'bildpost',
    'post-bild',
    'störer',
    'stoerer',
  ],
  board: [
    'board',
    'kanban',
    'aufgabe',
    'task',
    'spalte',
    'planen',
    'planung',
    'organisier',
    'to-do',
    'todo',
    'ablauf',
    'phasen',
    'backlog',
    'sprint',
  ],
  pres: [
    'präsentation',
    'praesentation',
    'präsi',
    'praesi',
    'slide',
    'folie',
    'vortrag',
    'pitch',
    'deck',
    'keynote',
    'vorstellen',
    'präsentier',
    'praesentier',
  ],
  sheet: [
    'tabelle',
    'liste',
    'budget',
    'haushalt',
    'mitglieder',
    'kalkul',
    'excel',
    'zahlen',
    'summe',
    'daten',
    'kassen',
    'einnahmen',
    'ausgaben',
    'statistik',
    'tracker',
  ],
};

/** Detect the content kind a create prompt is asking for. Defaults to `doc`.
 * Sharepic detection is opt-in — the canvas creation flow is feature-gated
 * (SHOW_SHAREPIC_STUDIO, not for de-AT). */
export function detectDocType(text: string, allowSharepic = false): DocKind {
  const t = text.toLowerCase();
  if (!t.trim()) return 'doc';
  if (allowSharepic && KIND_KEYWORDS.sharepic.some((k) => t.includes(k))) return 'sharepic';
  if (KIND_KEYWORDS.board.some((k) => t.includes(k))) return 'board';
  if (KIND_KEYWORDS.pres.some((k) => t.includes(k))) return 'pres';
  if (KIND_KEYWORDS.sheet.some((k) => t.includes(k))) return 'sheet';
  return 'doc';
}

// Imperative openers that mark an input as a *create prompt* rather than a search term.
const CREATE_INTENT_RE =
  /^\s*(schreib|erstell|entwirf|entwerfe|verfass|formulier|generier|mach|plan|bau|leg\s|entwickel|gestalt|konzipier|drafte?)/i;

/**
 * Does this input read as a create instruction (→ prompt mode) vs a lookup
 * (→ search mode)? True when it opens with an imperative verb or is a full
 * phrase (≥ 5 words). The caller additionally forces prompt mode when the live
 * search yields nothing.
 */
export function detectPromptIntent(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (CREATE_INTENT_RE.test(trimmed)) return true;
  return trimmed.split(/\s+/).length >= 5;
}

// Only the four kinds this composer actually creates. Naming concrete Textsorten
// ("Pressemitteilung", "Antrag") misleads — those belong to the text generators.
export const PROMPT_EXAMPLES: string[] = [
  'Erstelle ein Dokument zum Hitzeschutz …',
  'Erstelle ein Board für die Kampagnenplanung …',
  'Erstelle eine Tabelle für den Haushalt …',
  'Erstelle eine Präsentation für den Kreisverband …',
  '… oder tippe, um zu suchen',
];

/** Same rotation, trimmed to fit the composer pill on phone widths. */
export const PROMPT_EXAMPLES_SHORT: string[] = [
  'Dokument erstellen …',
  'Board erstellen …',
  'Tabelle erstellen …',
  'Präsentation erstellen …',
  '… oder tippen zum Suchen',
];
