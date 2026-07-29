import { type FC, type SVGProps } from 'react';

/**
 * The Office content kinds and their brand accents, shared by the docs
 * homepage composer badge, the Vorlagen modal cards and the chat's
 * "Dokument erstellt" card. Colors are fixed to the Claude "Grünerator Office"
 * design and read on their tinted chip background in both themes, so they are
 * intentionally not theme-swapped.
 * `sharepic` routes into the image-studio canvas flow instead of a document.
 *
 * Lives in `shared` rather than in `apps/web` because the chat package renders
 * the same kinds: a second colour/label table is exactly the drift the naming
 * rules in CLAUDE.md forbid.
 */
export type DocKind = 'doc' | 'board' | 'sheet' | 'pres' | 'sharepic';

/**
 * A PDF is NOT a collaborative-document kind — it is a generated asset whose
 * ref is a file name, not a document UUID, and the backend keeps it as its own
 * artifact kind for exactly that reason. So it extends `DocKind` here instead
 * of joining it: the docs surfaces (composer, template gallery) enumerate
 * `DocKind` exhaustively and must not grow a PDF tab.
 */
export type ArtifactKind = DocKind | 'pdf';

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

const PdfIcon: IconComp = (props) => (
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
    <path d="M9 13h1.5a1.5 1.5 0 0 1 0 3H9v-3zm0 3v2" />
    <path d="M14 13h2m-2 2.5h1.5M14 13v5" />
  </svg>
);

export interface DocTypeMeta {
  kind: ArtifactKind;
  label: string;
  color: string;
  bg: string;
  Icon: IconComp;
}

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

/** `DOC_TYPE_META` plus the PDF asset kind — spread, not copied, so the two
 *  cannot drift. Red is the one accent users already read as "PDF". */
export const ARTIFACT_TYPE_META: Record<ArtifactKind, DocTypeMeta> = {
  ...DOC_TYPE_META,
  pdf: { kind: 'pdf', label: 'PDF', color: '#C4453C', bg: '#FBE9E6', Icon: PdfIcon },
};

/** collaborative_documents subtype → homepage kind. */
export function subtypeToKind(subtype: string | null | undefined): DocKind {
  switch (subtype) {
    // Legacy HTML tables ('tabelle') read as spreadsheets — group with Sheets.
    case 'sheets':
    case 'tabelle':
      return 'sheet';
    case 'presentations':
      return 'pres';
    case 'boards':
      return 'board';
    default:
      return 'doc';
  }
}

/** Same, but resolves the `pdf` subtype the chat's artifact cards can carry. */
export function subtypeToArtifactKind(subtype: string | null | undefined): ArtifactKind {
  return subtype === 'pdf' ? 'pdf' : subtypeToKind(subtype);
}
