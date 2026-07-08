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
  /**
   * Watermark set inside `formState` by an authoritative server-side seed
   * (mint-on-open) so the client never seeds template defaults over it.
   * MUST match the literal in services/hocuspocus/src/internalApi.ts (that
   * service has zero cross-package deps and re-declares Y.Doc keys inline).
   */
  seeded: '_seeded',
} as const;

export type YDocKey = (typeof YDOC_KEYS)[keyof typeof YDOC_KEYS];
