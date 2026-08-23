/**
 * Remembers rendered sharepics so scrolling a thread does not re-render it.
 *
 * Two layers, because two different things go wrong without them. In memory:
 * scrolling a card out of the list and back would otherwise queue a fresh
 * render every time. On disk: `sharepicData` is persisted with the thread, so
 * after an app restart every sharepic the user ever made is a render request
 * waiting to happen the moment they scroll up.
 *
 * Keyed by variant and version, mirroring the web thumbnail cache
 * (`useSharepicThumbnail`): an edited sharepic is a new version and must not
 * read the old picture back.
 */

import { stripDataUrlPrefix } from '@gruenerator/shared/utils';
import { Directory, File, Paths } from 'expo-file-system';

const CACHE_SUBDIR = 'sharepic-previews';

/**
 * How many pictures stay in memory.
 *
 * Each is a base64 data URL of one to three megabytes, so this is a real
 * budget, not a formality. Thirty covers scrolling around a long chat; beyond
 * that the disk layer answers in a few milliseconds anyway.
 */
const MEMORY_LIMIT = 30;

/** Insertion-ordered, which is what makes the eviction below least-recently-used. */
const memory = new Map<string, string>();

export function sharepicCacheKey(variantId: string, version: number): string {
  return `${variantId}:v${version}`;
}

/** Filenames must survive a key containing characters a path cannot hold. */
function fileFor(key: string): File {
  const dir = new Directory(Paths.cache, CACHE_SUBDIR);
  dir.create({ idempotent: true });
  return new File(dir, `${key.replace(/[^a-zA-Z0-9._-]/g, '_')}.png`);
}

function touch(key: string, image: string): void {
  // Delete-then-set moves the entry to the end of the insertion order, which is
  // what makes the first key the least recently used one.
  memory.delete(key);
  memory.set(key, image);
  while (memory.size > MEMORY_LIMIT) {
    const oldest = memory.keys().next();
    if (oldest.done === true) break;
    memory.delete(oldest.value);
  }
}

/**
 * The cached picture as a data URL, or null.
 *
 * Best-effort throughout: a cache that throws would take the card down with
 * it, and a miss only costs a re-render.
 */
export function readCachedSharepic(key: string): string | null {
  const remembered = memory.get(key);
  if (remembered !== undefined) {
    touch(key, remembered);
    return remembered;
  }
  try {
    const file = fileFor(key);
    if (!file.exists) return null;
    const image = `data:image/png;base64,${file.base64()}`;
    touch(key, image);
    return image;
  } catch (error: unknown) {
    console.warn('[sharepicRenderCache] read failed:', error);
    return null;
  }
}

/** Stores a rendered picture in both layers. */
export function writeCachedSharepic(key: string, image: string): void {
  touch(key, image);
  try {
    const base64 = stripDataUrlPrefix(image);
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    fileFor(key).write(bytes);
  } catch (error: unknown) {
    // The memory layer already holds it; the next app start just re-renders.
    console.warn('[sharepicRenderCache] write failed:', error);
  }
}

/** Test seam. */
export function __clearSharepicMemoryCache(): void {
  memory.clear();
}
