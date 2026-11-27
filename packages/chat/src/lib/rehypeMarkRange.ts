/**
 * Marks a range of the Markdown SOURCE in the rendered tree. The citation panel
 * locates a quote in the stored text by character offset (`chunk_map`,
 * `findCitedRange`); rendering that text as Markdown must not lose the spot.
 * hast text nodes keep their source position, so each text node that overlaps
 * the range is split and the overlap wrapped in `<mark data-cited>`. A range
 * that crosses a heading or paragraph yields one mark per text node.
 *
 * Inside a node the source offset maps 1:1 only when the source slice equals
 * the node's value. Where it does not (escapes, entities), the whole node is
 * marked: a slightly wider mark beats one at the wrong place.
 */

interface Point {
  offset?: number;
}
interface Position {
  start: Point;
  end: Point;
}
interface HastText {
  type: 'text';
  value: string;
  position?: Position;
}
interface HastElement {
  type: 'element';
  tagName: string;
  properties: Record<string, unknown>;
  children: HastNode[];
}
type HastNode = HastText | HastElement | { type: string; children?: HastNode[] };

function markElement(value: string): HastElement {
  return {
    type: 'element',
    tagName: 'mark',
    properties: { dataCited: '' },
    children: [{ type: 'text', value }],
  };
}

function splitText(node: HastText, source: string, from: number, to: number): HastNode[] | null {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  if (start === undefined || end === undefined || end <= from || start >= to) return null;
  if (source.slice(start, end) !== node.value) return [markElement(node.value)];
  const a = Math.max(from, start) - start;
  const b = Math.min(to, end) - start;
  const parts: HastNode[] = [];
  if (a > 0) parts.push({ type: 'text', value: node.value.slice(0, a) });
  parts.push(markElement(node.value.slice(a, b)));
  if (b < node.value.length) parts.push({ type: 'text', value: node.value.slice(b) });
  return parts;
}

function walk(node: HastNode, source: string, from: number, to: number): void {
  if (!('children' in node) || !node.children) return;
  node.children = node.children.flatMap((child) => {
    if (child.type === 'text') return splitText(child as HastText, source, from, to) ?? [child];
    walk(child, source, from, to);
    return [child];
  });
}

export function rehypeMarkRange(options: { source: string; range: [number, number] | null }) {
  return (tree: HastNode) => {
    if (!options.range) return;
    const [from, to] = options.range;
    if (to > from) walk(tree, options.source, from, to);
  };
}
