/**
 * Centralized Y.Doc key strings. A typo in any of these is a silent
 * data-loss bug — keep all references through this module so a rename
 * stays synchronized.
 */
export const YDOC_KEYS = {
  pages: 'pages',
  formState: 'formState',
  legacyRoot: 'legacy_root',
  layers: 'layers',
  config: 'config',
  state: 'state',
  id: 'id',
  configId: 'configId',
} as const;

export type YDocKey = (typeof YDOC_KEYS)[keyof typeof YDOC_KEYS];
