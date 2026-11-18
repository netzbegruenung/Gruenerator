/**
 * The page-state keys the Grünerator's own element kinds store their instance lists under: the
 * `stateKey` of every `registerElementKind` call of the editor host
 * (`packages/canvas-editor/src/brand/`). F0: stored in canvases and templates, never renamed;
 * a new kind is added here first.
 *
 * Why the list is data and React-free: a canvas Y.Doc stores a collection key as one Y.Map per
 * element only if the writer's codec knows the key (`stateKeyClasses(hostCollectionKeys)` of
 * `@ggraphic/core/ydoc`). The editor hands the codec its registered kinds; the Hocuspocus
 * service, which writes the same documents without the editor, reads this list instead. Without
 * it the service would write such a key as one plain JSON value, and that is merged per key,
 * not per element. A guard test in `packages/canvas-editor` keeps the list equal to what the
 * editor registers.
 *
 * Imported by the Hocuspocus service as `@gruenerator/contracts/canvas-host-keys`, so it must
 * stay free of imports.
 */
export const CANVAS_HOST_STATE_KEYS = {
  /** The Balken (`brand/balkenKind.ts`): one or three skewed bars with a text each. */
  balken: 'balkenInstances',
} as const;

export type CanvasHostKindName = keyof typeof CANVAS_HOST_STATE_KEYS;

export type CanvasHostCollectionKey = (typeof CANVAS_HOST_STATE_KEYS)[CanvasHostKindName];

/** Every host collection key, for `stateKeyClasses(hostCollectionKeys)`. */
export const CANVAS_HOST_COLLECTION_KEYS: readonly CanvasHostCollectionKey[] =
  Object.values(CANVAS_HOST_STATE_KEYS);
