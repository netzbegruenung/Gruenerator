/**
 * All valid subtypes for collaborative_documents.
 * Used by docs, boards, canvas, and any future collaborative content types.
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
  'canvas',
  'sheets',
];

/** @deprecated Use COLLAB_SUBTYPES instead */
export const DOCS_SUBTYPES = COLLAB_SUBTYPES;

/**
 * Document-only subtypes (excludes boards and canvas, which have their own
 * listing endpoints). Sheets stay in on purpose: they share the /docs list.
 */
export const DOCS_ONLY_SUBTYPES = COLLAB_SUBTYPES.filter((s) => s !== 'boards' && s !== 'canvas');

/** Marker for permissions auto-granted when a user visits an 'authenticated' share link */
export const GRANTED_BY_SHARE_LINK = 'auto:share_link';
