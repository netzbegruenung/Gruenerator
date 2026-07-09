import type { Fragment, Mark, Node as PMNode } from 'prosemirror-model';
import type { EditorState, Transaction } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
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

/** A suggestion mark's numeric id, or null if the mark isn't one / has no valid id. */
function readSuggestionMarkId(mark: Mark): number | null {
  if (!isSuggestionMarkName(mark.type.name)) return null;
  const id: unknown = mark.attrs.id;
  return typeof id === 'number' && Number.isFinite(id) ? id : null;
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
 * The suggestion ids introduced by `trackedTr` that aren't attributed yet.
 *
 * Reads ids straight off the tracked steps rather than from changed-position
 * ranges: the library tracks a deletion purely as an `addMark` (an AddMarkStep,
 * whose position map is empty), so a range-based scan would miss every deletion
 * and leave it unattributed ("Unbekannt"). Insertions carry the mark on the
 * inserted slice instead. Cheap — steps and their slices are small.
 */
export function collectNewSuggestionIds(ydoc: Y.Doc, trackedTr: Transaction): number[] {
  const suggestionsMap = ydoc.getMap<SuggestionMeta>(SUGGESTIONS_MAP);
  const newIds = new Set<number>();

  const consider = (mark: Mark) => {
    const id = readSuggestionMarkId(mark);
    if (id != null && !suggestionsMap.has(String(id))) newIds.add(id);
  };

  // Discriminate steps by `toJSON().stepType` (a stable string) rather than
  // `instanceof`: a bundler can end up with two copies of prosemirror-transform,
  // and a cross-copy instanceof would silently return false — dropping all
  // attribution and reintroducing the "Unbekannt" bug in production only.
  for (const step of trackedTr.steps) {
    const view = step as unknown as {
      toJSON: () => { stepType?: string };
      mark?: Mark;
      slice?: { content: Fragment };
    };
    const stepType = view.toJSON().stepType;
    if (stepType === 'addMark' || stepType === 'addNodeMark') {
      if (view.mark) consider(view.mark);
    } else if (stepType === 'replace' || stepType === 'replaceAround') {
      view.slice?.content.descendants((node) => {
        node.marks.forEach(consider);
        return true;
      });
    }
  }

  return [...newIds];
}

/**
 * Write author/timestamp for the given suggestion ids (first-writer-wins). Skips
 * ids already attributed — safe to call repeatedly, e.g. when flushing a queue
 * of ids whose author only resolved after the edit.
 */
export function writeSuggestionAttribution(
  ydoc: Y.Doc,
  ids: readonly number[],
  user: SuggestionUser
): void {
  if (ids.length === 0) return;
  const suggestionsMap = ydoc.getMap<SuggestionMeta>(SUGGESTIONS_MAP);
  const createdAt = Date.now();
  ydoc.transact(() => {
    for (const id of ids) {
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
      const id = readSuggestionMarkId(mark);
      if (id == null) continue;
      const kind = mark.type.name as SuggestionKind;

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
      if (!entry.kinds.includes(kind)) entry.kinds.push(kind);
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
  const candidates: Mark[] = [...$from.marks()];
  if ($from.nodeBefore) candidates.push(...$from.nodeBefore.marks);
  if ($from.nodeAfter) candidates.push(...$from.nodeAfter.marks);
  for (const mark of candidates) {
    const id = readSuggestionMarkId(mark);
    if (id != null) return id;
  }
  return null;
}

/** The rendered DOM element for a suggestion mark id, or null if not in view. */
export function findSuggestionMarkEl(view: EditorView, id: number): HTMLElement | null {
  return view.dom.querySelector<HTMLElement>(
    `ins[data-id="${id}"], del[data-id="${id}"], [data-type="modification"][data-id="${id}"]`
  );
}

/** Cheap count of attributed suggestions — the Y.Map size, no doc scan. */
export function suggestionMetaCount(ydoc: Y.Doc): number {
  return ydoc.getMap<SuggestionMeta>(SUGGESTIONS_MAP).size;
}

// Only accept palette-style hex before injecting into an inline style string —
// the color originates from another peer's awareness state (untrusted).
const HEX_COLOR = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/**
 * Per-author tint + block-level markers for suggestion marks, reusing the same
 * scan/id logic as everything else. Each author's insertions and deletions are
 * tinted with their color (Word semantics: kind is conveyed by underline vs.
 * strikethrough, not color); unattributed marks fall back to the CSS default.
 * A whole textblock that is entirely one kind gets a `data-node-*` marker.
 */
export function buildSuggestionDecorations(doc: PMNode, ydoc: Y.Doc): DecorationSet {
  const map = ydoc.getMap<SuggestionMeta>(SUGGESTIONS_MAP);
  const decorations: Decoration[] = [];

  doc.descendants((node, pos) => {
    if (node.isTextblock && node.childCount > 0) {
      const kinds = new Set<SuggestionKind>();
      let allMarked = true;
      node.forEach((child) => {
        let childHasKind = false;
        for (const mark of child.marks) {
          if (isSuggestionMarkName(mark.type.name)) {
            kinds.add(mark.type.name);
            childHasKind = true;
          }
        }
        if (!childHasKind) allMarked = false;
      });
      if (allMarked && kinds.size === 1) {
        const kind = [...kinds][0];
        if (kind === 'insertion' || kind === 'deletion') {
          decorations.push(
            Decoration.node(pos, pos + node.nodeSize, { [`data-node-${kind}`]: 'true' })
          );
        }
      }
    }

    if (node.isText) {
      for (const mark of node.marks) {
        const id = readSuggestionMarkId(mark);
        if (id == null) continue;
        const color = map.get(String(id))?.color;
        if (color && HEX_COLOR.test(color)) {
          decorations.push(
            Decoration.inline(pos, pos + node.nodeSize, { style: `--suggest-color:${color}` })
          );
        }
        break;
      }
    }
    return true;
  });

  return DecorationSet.create(doc, decorations);
}
