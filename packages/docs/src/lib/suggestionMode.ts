import type { Node as PMNode } from 'prosemirror-model';
import type { EditorState, Transaction } from 'prosemirror-state';
import type * as Y from 'yjs';

/**
 * Word-like track-changes ("Änderungsmodus") core logic — no React.
 *
 * Two Yjs structures back the feature, both synced like the document itself:
 * - `meta` map, key `suggestChanges`: the doc-wide on/off flag (Word semantics —
 *   once on, every editor's edits are tracked).
 * - `suggestions` map: `String(suggestionId) → SuggestionMeta`. The ProseMirror
 *   suggestion marks (`insertion`/`deletion`/`modification`, registered natively
 *   by BlockNote core) carry only a numeric `id`; author + timestamp live here,
 *   mirroring how comments store thread metadata in the `threads` map.
 */

const META_MAP = 'meta';
const META_KEY = 'suggestChanges';
const SUGGESTIONS_MAP = 'suggestions';

const SUGGESTION_MARK_NAMES = ['insertion', 'deletion', 'modification'] as const;
export type SuggestionKind = (typeof SUGGESTION_MARK_NAMES)[number];

function isSuggestionMarkName(name: string): name is SuggestionKind {
  return (SUGGESTION_MARK_NAMES as readonly string[]).includes(name);
}

export interface SuggestionUser {
  id: string;
  name: string;
  color: string;
}

export interface SuggestionMeta {
  userId: string;
  name: string;
  color: string;
  createdAt: number;
}

export interface DocSuggestion {
  id: number;
  kinds: SuggestionKind[];
  excerpt: string;
  from: number;
  meta: SuggestionMeta | null;
}

export function isSuggestionModeEnabled(ydoc: Y.Doc): boolean {
  return ydoc.getMap(META_MAP).get(META_KEY) === true;
}

export function setSuggestionMode(ydoc: Y.Doc, enabled: boolean): void {
  ydoc.getMap(META_MAP).set(META_KEY, enabled);
}

/** Subscribe to doc-wide mode flips (useSyncExternalStore-compatible). */
export function observeSuggestionMode(ydoc: Y.Doc, cb: () => void): () => void {
  const map = ydoc.getMap(META_MAP);
  map.observe(cb);
  return () => map.unobserve(cb);
}

/**
 * Collision-safe id. The library's default generator is `max-id-in-doc + 1`,
 * which two clients suggesting concurrently would both land on; a random 31-bit
 * int avoids that. BlockNote validates the mark `id` attr as a number.
 */
export function generateSuggestionId(): number {
  return Math.floor(Math.random() * 0x7fffffff) || 1;
}

/**
 * Record author/timestamp for any suggestion id introduced by `trackedTr` that
 * isn't attributed yet (first-writer-wins). Scans only the transaction's changed
 * range in the resulting doc — O(edit), not O(doc).
 */
export function recordSuggestionAttribution(
  ydoc: Y.Doc,
  trackedTr: Transaction,
  user: SuggestionUser
): void {
  const maps = trackedTr.mapping.maps;
  if (maps.length === 0) return;

  // Conservative bounding range of all changes, mapped forward to final coords.
  let from = Infinity;
  let to = 0;
  maps.forEach((stepMap, i) => {
    stepMap.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
      let s = newStart;
      let e = newEnd;
      for (let j = i + 1; j < maps.length; j++) {
        s = maps[j].map(s, -1);
        e = maps[j].map(e, 1);
      }
      from = Math.min(from, s);
      to = Math.max(to, e);
    });
  });
  if (!Number.isFinite(from) || to <= from) return;

  const doc = trackedTr.doc;
  const clampedFrom = Math.max(0, from);
  const clampedTo = Math.min(doc.content.size, to);
  const suggestionsMap = ydoc.getMap<SuggestionMeta>(SUGGESTIONS_MAP);
  const newIds = new Set<number>();

  doc.nodesBetween(clampedFrom, clampedTo, (node) => {
    for (const mark of node.marks) {
      if (!isSuggestionMarkName(mark.type.name)) continue;
      const id = mark.attrs.id as number | null;
      if (id == null) continue;
      if (!suggestionsMap.has(String(id))) newIds.add(id);
    }
    return true;
  });

  if (newIds.size === 0) return;
  const createdAt = Date.now();
  ydoc.transact(() => {
    for (const id of newIds) {
      // Re-check inside the transaction: a concurrent local edit may have
      // recorded it between the scan and here.
      if (suggestionsMap.has(String(id))) continue;
      suggestionsMap.set(String(id), {
        userId: user.id,
        name: user.name,
        color: user.color,
        createdAt,
      });
    }
  });
}

/** All open suggestions in the doc, grouped by id, ordered by position. */
export function collectSuggestions(doc: PMNode, ydoc: Y.Doc): DocSuggestion[] {
  const suggestionsMap = ydoc.getMap<SuggestionMeta>(SUGGESTIONS_MAP);
  const byId = new Map<number, DocSuggestion>();

  doc.descendants((node, pos) => {
    for (const mark of node.marks) {
      if (!isSuggestionMarkName(mark.type.name)) continue;
      const id = mark.attrs.id as number | null;
      if (id == null) continue;

      let entry = byId.get(id);
      if (!entry) {
        entry = {
          id,
          kinds: [],
          excerpt: '',
          from: pos,
          meta: suggestionsMap.get(String(id)) ?? null,
        };
        byId.set(id, entry);
      }
      if (!entry.kinds.includes(mark.type.name)) entry.kinds.push(mark.type.name);
      entry.from = Math.min(entry.from, pos);
      if (node.isText && node.text) {
        entry.excerpt = (entry.excerpt + node.text).slice(0, 120);
      }
    }
    return true;
  });

  return [...byId.values()].sort((a, b) => a.from - b.from);
}

export function hasPendingSuggestions(doc: PMNode): boolean {
  let found = false;
  doc.descendants((node) => {
    if (found) return false;
    if (node.marks.some((m) => isSuggestionMarkName(m.type.name))) {
      found = true;
      return false;
    }
    return true;
  });
  return found;
}

export function deleteSuggestionMeta(ydoc: Y.Doc, ids: number[]): void {
  const map = ydoc.getMap<SuggestionMeta>(SUGGESTIONS_MAP);
  ydoc.transact(() => {
    for (const id of ids) map.delete(String(id));
  });
}

export function clearSuggestionMeta(ydoc: Y.Doc): void {
  const map = ydoc.getMap<SuggestionMeta>(SUGGESTIONS_MAP);
  ydoc.transact(() => {
    for (const key of [...map.keys()]) map.delete(key);
  });
}

/** Subscribe to suggestion-metadata changes (useSyncExternalStore-compatible). */
export function observeSuggestionMeta(ydoc: Y.Doc, cb: () => void): () => void {
  const map = ydoc.getMap<SuggestionMeta>(SUGGESTIONS_MAP);
  map.observe(cb);
  return () => map.unobserve(cb);
}

/**
 * The suggestion id under the current selection/cursor, or null. Insertion and
 * deletion marks are `inclusive: false`, so we check the surrounding text nodes
 * rather than the cursor's active mark set.
 */
export function getSuggestionIdAtSelection(state: EditorState): number | null {
  const { $from } = state.selection;
  const candidates = [...$from.marks()];
  if ($from.nodeBefore) candidates.push(...$from.nodeBefore.marks);
  if ($from.nodeAfter) candidates.push(...$from.nodeAfter.marks);
  for (const mark of candidates) {
    if (isSuggestionMarkName(mark.type.name)) {
      const id = mark.attrs.id as number | null;
      if (id != null) return id;
    }
  }
  return null;
}
