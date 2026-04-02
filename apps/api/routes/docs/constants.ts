/**
 * All valid subtypes for collaborative_documents.
 * Used by docs, boards, and any future collaborative content types.
 */
export const COLLAB_SUBTYPES = [
  'blank',
  'docs',
  'antrag',
  'pressemitteilung',
  'protokoll',
  'notizen',
  'redaktionsplan',
  'checkliste',
  'einladung',
  'tabelle',
  'boards',
];

/** @deprecated Use COLLAB_SUBTYPES instead */
export const DOCS_SUBTYPES = COLLAB_SUBTYPES;
