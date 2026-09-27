import { parseSourceLinkHref } from '@gruenerator/shared/utils';

/**
 * Turns source links — `[Titel](quelle:N)`, see `@gruenerator/shared/utils`
 * sourceLinks — into `sourcelink` elements on the syntax tree, keeping the
 * label as children.
 *
 * On the tree for the same reason as `remarkCitationMarkers`: the reveal only
 * ever sees raw text. And before hast, so the sanitize/harden layer never meets
 * the `quelle:` scheme as an href it would strip — the element carries the
 * citation id and nothing else, and `allowedTags` lets exactly that through.
 */

interface ParentNode {
  type: string;
  children: TreeNode[];
}
interface LinkNode extends ParentNode {
  type: 'link';
  url: string;
}
/** mdast-util-to-hast builds the element from `data.hName` / `hProperties`;
 *  an unknown node type with children keeps them. */
interface SourceLinkNode extends ParentNode {
  type: 'sourceLink';
  data: { hName: 'sourcelink'; hProperties: { n: string } };
}
type TreeNode = ParentNode | LinkNode | SourceLinkNode | { type: string };

function isParent(node: TreeNode): node is ParentNode {
  return 'children' in node && Array.isArray(node.children);
}

function isLink(node: TreeNode): node is LinkNode {
  return node.type === 'link' && 'url' in node && typeof node.url === 'string';
}

function walk(parent: ParentNode): void {
  parent.children = parent.children.map((child) => {
    if (!isParent(child)) return child;
    walk(child);
    const id = isLink(child) ? parseSourceLinkHref(child.url) : null;
    if (id === null) return child;
    const sourceLink: SourceLinkNode = {
      type: 'sourceLink',
      children: child.children,
      data: { hName: 'sourcelink', hProperties: { n: String(id) } },
    };
    return sourceLink;
  });
}

export function remarkSourceLinks() {
  return (tree: { type: string }) => {
    if (isParent(tree as TreeNode)) walk(tree as ParentNode);
  };
}
