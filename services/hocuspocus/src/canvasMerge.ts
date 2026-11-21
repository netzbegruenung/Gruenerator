/**
 * Three-way merge of a stale patch into the current state of a canvas page.
 *
 * The API reads a canvas, lets a model work for seconds, and sends back whole collections. The
 * codec diffs such a value against the document as it is at write time and deletes every element
 * id the value lacks, so an edit a client made in between (a changed element, a new one) is
 * reverted or deleted. With the base the patch was computed from, the server applies only what
 * the patch changed: `merged = current + diff(base -> patch)`.
 *
 * Per key, by the key's class (`stateKeyClasses`, never guessed from the value):
 * - `elements` (`[{ id, ...props }]`): an id in base and patch whose element differs takes the
 *   patch's changed properties over the current element; an id in base but not in patch is
 *   deleted; an id in current but not in base is kept; an id new in the patch is added; an id the
 *   patch edits but the document no longer has (a client deleted it) stays deleted.
 * - `order` (`string[]`): the same by id; the patch's order wins only when it reordered the ids
 *   the base had.
 * - `record` (`{ key: value }`): the same by entry.
 * - anything else: the patch when it differs from the base, else the current value.
 *
 * Without a base for a key, or when the shapes do not fit a class (duplicate ids, an element
 * without a string id, a key absent from the document), the patch is taken whole: the behaviour
 * before the base existed.
 */
import { isDeepStrictEqual } from 'node:util';

import type { StateKeyClasses } from '@ggraphic/core/ydoc';

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);

const elementsById = (v: unknown): Map<string, Json> | null => {
  if (!Array.isArray(v)) return null;
  const map = new Map<string, Json>();
  for (const el of v) {
    if (!isObject(el) || typeof el.id !== 'string' || map.has(el.id)) return null;
    map.set(el.id, el);
  }
  return map;
};

const idList = (v: unknown): string[] | null => {
  if (!Array.isArray(v)) return null;
  const seen = new Set<string>();
  for (const id of v) {
    if (typeof id !== 'string' || seen.has(id)) return null;
    seen.add(id);
  }
  return v as string[];
};

/** Properties (or record entries): the patch's changes against the base, over the current. */
function mergeProps(current: Json, base: Json, patch: Json): Json {
  const out: Json = { ...current };
  for (const [k, v] of Object.entries(patch)) {
    if (!(k in base) || !isDeepStrictEqual(base[k], v)) out[k] = v;
  }
  for (const k of Object.keys(base)) if (!(k in patch)) delete out[k];
  return out;
}

/** Insert `id` after the entry that precedes it in `source`, or append when that is not in `out`. */
function insertAfterPredecessor<T>(
  out: T[],
  source: T[],
  index: number,
  item: T,
  keyOf: (t: T) => string
) {
  for (let i = index - 1; i >= 0; i--) {
    const at = out.findIndex((o) => keyOf(o) === keyOf(source[i]!));
    if (at >= 0) {
      out.splice(at + 1, 0, item);
      return;
    }
  }
  if (index === 0) out.unshift(item);
  else out.push(item);
}

function mergeElements(current: Json[], base: Json[], patch: Json[]): Json[] | null {
  const cur = elementsById(current);
  const bas = elementsById(base);
  const pat = elementsById(patch);
  if (!cur || !bas || !pat) return null;

  const out: Json[] = [];
  for (const el of current) {
    const id = el.id as string;
    const b = bas.get(id);
    if (!b) {
      const p = pat.get(id);
      // Added concurrently by a client; if the patch added the same id too, the patch's props win.
      out.push(p ? { ...el, ...p } : el);
      continue;
    }
    const p = pat.get(id);
    if (!p) continue; // deleted by the patch
    out.push(isDeepStrictEqual(b, p) ? el : mergeProps(el, b, p));
  }
  patch.forEach((el, index) => {
    const id = el.id as string;
    if (cur.has(id) || bas.has(id)) return; // known: merged above, or deleted by a client
    insertAfterPredecessor(out, patch, index, el, (e) => e.id as string);
  });
  return out;
}

function mergeOrder(current: string[], base: string[], patch: string[]): string[] | null {
  const cur = idList(current);
  const bas = idList(base);
  const pat = idList(patch);
  if (!cur || !bas || !pat) return null;

  const baseSet = new Set(bas);
  const patchSet = new Set(pat);
  const curSet = new Set(cur);
  const baseKept = bas.filter((id) => patchSet.has(id));
  const patchKnown = pat.filter((id) => baseSet.has(id));
  const reordered = !isDeepStrictEqual(baseKept, patchKnown);

  // Start from the current order, or from the patch's when the patch reordered what it knew.
  const out = reordered
    ? pat.filter((id) => curSet.has(id) || !baseSet.has(id))
    : cur.filter((id) => !baseSet.has(id) || patchSet.has(id));
  const placed = new Set(out);
  if (reordered) {
    // Ids a client added (current only) keep their place after their current predecessor.
    cur.forEach((id, index) => {
      if (!baseSet.has(id) && !placed.has(id))
        insertAfterPredecessor(out, cur, index, id, (s) => s);
    });
  } else {
    // Ids new in the patch.
    pat.forEach((id, index) => {
      if (!baseSet.has(id) && !curSet.has(id))
        insertAfterPredecessor(out, pat, index, id, (s) => s);
    });
  }
  return out;
}

function mergeKey(
  cls: string | undefined,
  current: unknown,
  base: unknown,
  patch: unknown
): unknown {
  if (current === undefined) return patch;
  if (cls === 'elements') {
    const merged = mergeElements(current as Json[], base as Json[], patch as Json[]);
    if (merged) return merged;
  } else if (cls === 'order') {
    const merged = mergeOrder(current as string[], base as string[], patch as string[]);
    if (merged) return merged;
  } else if (cls === 'record') {
    if (isObject(current) && isObject(base) && isObject(patch)) {
      return mergeProps(current, base, patch);
    }
  } else if (isDeepStrictEqual(base, patch)) {
    return current;
  } else {
    return patch;
  }
  return patch;
}

/**
 * The value to write for each key of `patch`, given the document's `current` values and the
 * `base` the patch was computed from. A key `base` does not have is written as the patch has it.
 */
export function mergeStalePatch(
  current: Json,
  patch: Json,
  base: Json | null | undefined,
  classes: StateKeyClasses
): Json {
  if (!base) return patch;
  const out: Json = {};
  for (const [key, value] of Object.entries(patch)) {
    out[key] = key in base ? mergeKey(classes.get(key), current[key], base[key], value) : value;
  }
  return out;
}
