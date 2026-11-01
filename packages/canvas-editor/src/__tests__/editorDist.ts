import { createRequire } from 'node:module';
import path from 'node:path';

/**
 * Source guards in this package read the editor's files from disk. The editor is
 * the installed `@ggraphic/editor` package (#5212), which ships `dist/` only:
 * compiled JS plus `styles/*.css`. This is the one place that locates it.
 */
const require = createRequire(import.meta.url);

/** `<install dir>/dist` of @ggraphic/editor. */
export const EDITOR_DIST = path.dirname(
  path.dirname(require.resolve('@ggraphic/editor/styles/editor'))
);

/** Absolute path of a file below the editor's `dist/`, e.g. `styles/editor.css`. */
export const editorDist = (relative: string): string => path.join(EDITOR_DIST, relative);
