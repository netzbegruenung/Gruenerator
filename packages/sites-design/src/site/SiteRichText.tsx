import { createElement, type ReactNode } from 'react';

import { type RichTextDoc, type RichTextNode } from '@gruenerator/contracts';

type HeadingTag = 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

function headingTag(level: unknown, offset: number): HeadingTag {
  const base = level === 3 ? 3 : 2;
  return `h${Math.min(base + offset, 6)}` as HeadingTag;
}

function renderText(node: RichTextNode, key: number): ReactNode {
  let out: ReactNode = node.text ?? '';
  for (const mark of node.marks ?? []) {
    if (mark.type === 'bold') out = <strong>{out}</strong>;
    else if (mark.type === 'italic') out = <em>{out}</em>;
    else if (mark.type === 'underline') out = <u>{out}</u>;
  }
  return <span key={key}>{out}</span>;
}

function renderNodes(nodes: readonly RichTextNode[] | undefined, offset: number): ReactNode[] {
  return (nodes ?? []).map((node, i) => renderNode(node, i, offset));
}

function renderNode(node: RichTextNode, key: number, offset: number): ReactNode {
  const children = renderNodes(node.content, offset);
  switch (node.type) {
    case 'text':
      return renderText(node, key);
    case 'hardBreak':
      return <br key={key} />;
    case 'paragraph':
      return <p key={key}>{children}</p>;
    case 'heading':
      return createElement(headingTag(node.attrs?.['level'], offset), { key }, children);
    case 'bulletList':
      return <ul key={key}>{children}</ul>;
    case 'orderedList': {
      const start = node.attrs?.['start'];
      return (
        <ol key={key} start={typeof start === 'number' ? start : 1}>
          {children}
        </ol>
      );
    }
    case 'listItem':
      return <li key={key}>{children}</li>;
    default:
      return null;
  }
}

export function SiteRichText({
  content,
  headingOffset = 0,
  field,
}: {
  content: RichTextDoc;
  headingOffset?: 0 | 1 | 2;
  field?: string;
}) {
  return (
    <div data-rich-text="" data-field={field} className="site:max-w-prose site:hyphens-auto">
      {renderNodes(content.content, headingOffset)}
    </div>
  );
}
