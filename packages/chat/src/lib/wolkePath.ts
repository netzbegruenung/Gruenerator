/**
 * Path arithmetic for the Nextcloud (Wolke) file picker.
 *
 * Two functions, because both platforms' pickers navigate the same tree and a
 * disagreement about what "the parent of `/`" is means one of them can trap the
 * user in a folder they cannot leave.
 */

/** The path of `name` inside `parent`. */
export function joinWolkePath(parent: string, name: string): string {
  if (!parent || parent === '/') return `/${name}`;
  return `${parent.replace(/\/$/, '')}/${name}`;
}

/**
 * The folder containing `path`, or `''` for the root — which is what the browse
 * endpoint expects for "list the top level".
 */
export function wolkeParentPath(path: string): string {
  if (!path || path === '/') return '';
  const trimmed = path.replace(/\/$/, '');
  const index = trimmed.lastIndexOf('/');
  return index <= 0 ? '' : trimmed.slice(0, index);
}

/** Whether the picker is at the top of a share link — i.e. no "up" step left. */
export function isWolkeRoot(path: string): boolean {
  return !path || path === '/';
}
