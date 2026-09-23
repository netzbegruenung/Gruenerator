/**
 * Turns `[N]` / `[N, M]` / `[cite:N]` citation markers into `citation` elements — as a
 * remark plugin on the syntax tree, NOT as a string rewrite in `preprocess`.
 *
 * The distinction is the whole point. `StreamdownTextPrimitive` runs
 * `preprocess` BEFORE `useSmooth` and remark AFTER it. A string rewrite there
 * turns `[1]` (3 chars) into `<citation n="1"></citation>` (27 chars) under the
 * reveal cursor: `useSmooth` then walks the markup character by character
 * (remend deletes the unterminated `<cit…` and the badge pops in whole), and
 * whenever a delta boundary splits a marker the rewritten target is no longer
 * an extension of what is displayed — `useSmooth` resets to "" and re-types
 * the entire part. Measured against a real SSE endpoint: two resets of ~110
 * characters per cited answer at production cadence, the whole part on a
 * split marker. That was the "text jumps at citations" report after #3483.
 *
 * On the tree the reveal only ever sees raw text, which a stream extends by
 * construction, so the prefix invariant cannot break. A half-streamed `[1`
 * stays literal until `]` arrives and is then replaced by a badge of nearly
 * the same width. Same measurement: no resets, no badge ever disappears.
 *
 * Semantics mirror the string rewriter this replaces (and the react-markdown
 * path before it): a group renders the ids it can and drops the rest; a group
 * whose ids are ALL out of range stays literal text. Code needs no special
 * handling any more — `inlineCode` and `code` are their own node types, never
 * `text`, so the walk cannot reach them.
 *
 * Dependency-free on purpose: the node shapes below are the structural subset
 * of unist/mdast this walk touches. Importing the real types would add
 * `@types/mdast` + `unified` to this package for three interfaces.
 */

interface ParentNode {
  type: string;
  children: TreeNode[];
}
interface TextNode {
  type: 'text';
  value: string;
}
/** mdast-util-to-hast builds the element from `data.hName` / `hProperties`. */
interface CitationNode {
  type: 'citation';
  data: { hName: 'citation'; hProperties: { n: string } };
}
type TreeNode = ParentNode | TextNode | CitationNode | { type: string };

/**
 * Both wire forms: `[N]` / `[N, M]` (chat) and `[cite:N]` (notebook — the
 * SearchGraph prompt has the model write it literally, and the adapter no
 * longer rewrites it mid-stream, for the same prefix-invariant reason as above).
 */
const CITATION_MARKER_RE = /\[(?:cite:)?(\d+(?:\s*,\s*\d+)*)\]/g;
const MAX_CITATION_ID = 999;

function isParent(node: TreeNode): node is ParentNode {
  return 'children' in node && Array.isArray(node.children);
}

function isText(node: TreeNode): node is TextNode {
  return node.type === 'text' && 'value' in node && typeof node.value === 'string';
}

/** Splits one text node around its markers; `null` when it holds none. */
export function splitCitationText(value: string): TreeNode[] | null {
  const out: TreeNode[] = [];
  let last = 0;
  let touched = false;
  CITATION_MARKER_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CITATION_MARKER_RE.exec(value)) !== null) {
    const ids = match[1]
      .split(',')
      .map((n) => parseInt(n, 10))
      .filter((id) => id >= 1 && id <= MAX_CITATION_ID);
    if (ids.length === 0) continue;
    if (match.index > last) out.push({ type: 'text', value: value.slice(last, match.index) });
    for (const id of ids) {
      out.push({ type: 'citation', data: { hName: 'citation', hProperties: { n: String(id) } } });
    }
    last = match.index + match[0].length;
    touched = true;
  }
  if (!touched) return null;
  if (last < value.length) out.push({ type: 'text', value: value.slice(last) });
  return out;
}

function walk(parent: ParentNode): void {
  for (let i = 0; i < parent.children.length; i++) {
    const child = parent.children[i];
    if (isText(child)) {
      const replacement = splitCitationText(child.value);
      if (replacement) {
        parent.children.splice(i, 1, ...replacement);
        i += replacement.length - 1;
      }
    } else if (isParent(child)) {
      walk(child);
    }
  }
}

export function remarkCitationMarkers() {
  return (tree: { type: string }) => {
    // unified hands us its `Node`; the walk only ever reads the structural
    // subset above, and an mdast root is a parent by definition.
    if (isParent(tree as TreeNode)) walk(tree as ParentNode);
  };
}
