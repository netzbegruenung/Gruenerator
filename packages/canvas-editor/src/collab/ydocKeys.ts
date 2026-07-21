/**
 * Centralized Y.Doc key strings. A typo in any of these is a silent
 * data-loss bug — keep all references through this module so a rename
 * stays synchronized.
 *
 * The Hocuspocus service (services/hocuspocus/src/internalApi.ts) has zero
 * cross-package deps and re-declares these literals inline — keep both in
 * sync when changing anything here.
 */
export const YDOC_KEYS = {
  /** Current multi-page container: Y.Map<pageId, page Y.Map>. */
  pagesById: 'pagesById',
  /** Doc-level markers: seed watermark, one-shot migration flags. */
  meta: 'meta',
  /** Fractional order key on each page Y.Map (lexicographic sort). */
  pos: 'pos',
  /** Set in `meta` once pages were seeded (server-authoritative or client). */
  pagesSeeded: 'pagesSeeded',
  /** Set in `meta` after the legacy pages-array/root migration ran. */
  legacyMigrated: 'legacyMigrated',
  /** Set in `meta` after root formState was folded into the single page. */
  formStateFolded: 'formStateFolded',

  /** Legacy multi-page container (Y.Array) — migrated into pagesById on open. */
  pages: 'pages',
  /** Legacy root form-state bucket — folded into pages[0].state on open. */
  formState: 'formState',
  legacyRoot: 'legacy_root',
  layers: 'layers',
  config: 'config',
  state: 'state',
  id: 'id',
  configId: 'configId',
  /**
   * Legacy watermark set inside `formState` by an authoritative server-side
   * seed (mint-on-open) so the client never seeds template defaults over it.
   */
  seeded: '_seeded',
} as const;

export type YDocKey = (typeof YDOC_KEYS)[keyof typeof YDOC_KEYS];
