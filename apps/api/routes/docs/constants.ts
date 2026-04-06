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

/** Marker for permissions auto-granted when a user visits an 'authenticated' share link */
export const GRANTED_BY_SHARE_LINK = 'auto:share_link';
