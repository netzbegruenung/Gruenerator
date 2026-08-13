/**
 * Breadth-first walk over a Nextcloud share.
 *
 * `NextcloudApiClient.listFolder` issues a PROPFIND with `Depth: 1` — it sees
 * exactly one level. Everything below the attached folder was therefore
 * invisible to the Wolke import, and not even reported as skipped: a folder
 * entry has no file extension, so the "supported file type" filter dropped it
 * without a word.
 *
 * The walk is deliberately bounded. Every file it returns costs a download, an
 * OCR call and an embedding run, so an unbounded descent into someone's backup
 * directory is a cost incident, not a feature.
 *
 * Takes the listing function as an argument so the traversal is testable
 * without a WebDAV server.
 */
// The client's shape, not `./types.js`'s: only the WebDAV listing knows whether
// an entry is a collection, and its `size`/`lastModified` are nullable.
import type { NextcloudFile } from '../api-clients/nextcloudApiClient.js';

/** How many levels below the attached folder the walk may descend. */
export const WOLKE_MAX_WALK_DEPTH = 3;

/** Hard ceiling on entries returned, independent of depth. */
export const WOLKE_MAX_WALK_FILES = 500;

export interface FolderWalkOptions {
  maxDepth?: number;
  maxFiles?: number;
}

export interface FolderWalkResult {
  /** Files only — directories are counted, never returned as importable. */
  files: NextcloudFile[];
  /** Subfolders visited below the root (the root itself is not counted). */
  folderCount: number;
  /** Subfolders left unvisited because maxDepth was reached. */
  depthLimited: boolean;
  /** True when maxFiles cut the listing short. */
  truncated: boolean;
}

const WEBDAV_PREFIX = '/public.php/webdav';

/**
 * Turn the href from a PROPFIND response back into a share-relative path, the
 * form `listFolder` expects. Hrefs are percent-encoded; the path is not.
 */
export function folderPathFromHref(href: string): string {
  const withoutPrefix = href.startsWith(WEBDAV_PREFIX) ? href.slice(WEBDAV_PREFIX.length) : href;
  // Splitting and dropping empty segments trims both ends and collapses double
  // slashes — an anchored `/+$/` would do the same at the cost of a ReDoS.
  return withoutPrefix
    .split('/')
    .filter(Boolean)
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        // A malformed escape sequence is not worth aborting the whole walk over.
        return segment;
      }
    })
    .join('/');
}

export async function walkWolkeFolder(
  listFolder: (folderPath: string) => Promise<NextcloudFile[]>,
  rootPath: string,
  options: FolderWalkOptions = {}
): Promise<FolderWalkResult> {
  const maxDepth = options.maxDepth ?? WOLKE_MAX_WALK_DEPTH;
  const maxFiles = options.maxFiles ?? WOLKE_MAX_WALK_FILES;

  const files: NextcloudFile[] = [];
  const seenFileHrefs = new Set<string>();
  // A PROPFIND on a folder returns the folder itself as the first entry. Without
  // this the walk would list "Stadtrat" from inside "Stadtrat" forever.
  const visitedFolders = new Set<string>([folderPathFromHref(rootPath)]);

  let folderCount = 0;
  let depthLimited = false;
  let truncated = false;

  let frontier: string[] = [rootPath];

  // Once the file cap is reached nothing further can change the result, and
  // every additional folder is another PROPFIND over the network. The cap
  // bounds cost, so it has to stop the traversal, not just the pushing.
  walk: for (let depth = 0; depth <= maxDepth && frontier.length > 0; depth++) {
    const nextFrontier: string[] = [];

    for (const folderPath of frontier) {
      const entries = await listFolder(folderPath);

      for (const entry of entries) {
        if (entry.isDirectory) {
          const childPath = folderPathFromHref(entry.href);
          if (!childPath || visitedFolders.has(childPath)) continue;
          visitedFolders.add(childPath);
          folderCount++;
          if (depth < maxDepth) {
            nextFrontier.push(childPath);
          } else {
            depthLimited = true;
          }
          continue;
        }

        if (seenFileHrefs.has(entry.href)) continue;
        if (files.length >= maxFiles) {
          truncated = true;
          break walk;
        }
        seenFileHrefs.add(entry.href);
        files.push(entry);
      }
    }

    frontier = nextFrontier;
  }

  return { files, folderCount, depthLimited, truncated };
}
