import { type FC, type SVGProps } from 'react';

/**
 * The Office content kinds and their brand accents, shared by the docs
 * homepage composer badge and the Vorlagen modal cards. Colors are fixed to the
 * Claude "Grünerator Office" design and read on their tinted chip background in
 * both themes, so they are intentionally not theme-swapped.
 * `sharepic` routes into the image-studio canvas flow instead of a document.
 */
export type DocKind = 'doc' | 'board' | 'sheet' | 'pres' | 'sharepic';

type IconComp = FC<SVGProps<SVGSVGElement>>;

const DocIcon: IconComp = (props) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.9}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
  </svg>
);

const BoardIcon: IconComp = (props) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.9}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <rect x="3" y="3" width="6" height="18" rx="1" />
    <rect x="10" y="3" width="6" height="12" rx="1" />
    <rect x="17" y="3" width="4" height="7" rx="1" />
  </svg>
);

const SheetIcon: IconComp = (props) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.9}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M3 9h18M3 15h18M9 3v18" />
  </svg>
);

const PresIcon: IconComp = (props) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.9}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M2 3h20" />
    <path d="M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3" />
    <path d="m7 21 5-5 5 5" />
  </svg>
);

export interface DocTypeMeta {
  kind: DocKind;
  label: string;
  color: string;
  bg: string;
  Icon: IconComp;
}

const SharepicIcon: IconComp = (props) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.9}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21" />
  </svg>
);

export const DOC_TYPE_META: Record<DocKind, DocTypeMeta> = {
  doc: { kind: 'doc', label: 'Dokument', color: '#4C8A6E', bg: '#E7F1EA', Icon: DocIcon },
  board: { kind: 'board', label: 'Board', color: '#C0863B', bg: '#F8F0E1', Icon: BoardIcon },
  sheet: { kind: 'sheet', label: 'Tabelle', color: '#3F82A6', bg: '#E6F0F5', Icon: SheetIcon },
  pres: { kind: 'pres', label: 'Präsentation', color: '#7E5AA8', bg: '#EFE8F6', Icon: PresIcon },
  sharepic: {
    kind: 'sharepic',
    label: 'Sharepic',
    color: '#C25C7B',
    bg: '#F8E9EF',
    Icon: SharepicIcon,
  },
};

/** collaborative_documents subtype → homepage kind. */
export function subtypeToKind(subtype: string | null | undefined): DocKind {
  switch (subtype) {
    case 'sheets':
      return 'sheet';
    case 'presentations':
      return 'pres';
    case 'boards':
      return 'board';
    default:
      return 'doc';
  }
}

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
