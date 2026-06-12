import { type ReactNode } from 'react';

import { type RichTextDoc, type RichTextMark, type RichTextNode } from '@gruenerator/contracts';

// Hand-rolled over the closed richtext schema (see contracts/schemas/richtext.ts)
// instead of @tiptap/static-renderer, keeping prosemirror out of render-only
// bundles. Both switches are exhaustive: extending the schema fails
// compilation here until handled.

function wrapWithMarks(marks: RichTextMark[] | undefined, children: ReactNode): ReactNode {
  return (marks ?? []).reduce((acc, mark) => {
    switch (mark.type) {
      case 'bold':
        return <strong>{acc}</strong>;
      case 'italic':
        return <em>{acc}</em>;
      case 'underline':
        return <u>{acc}</u>;
      default: {
        const exhaustive: never = mark.type;
        return exhaustive;
      }
    }
  }, children);
}

function renderNode(node: RichTextNode, key: number): ReactNode {
  const children = (node.content ?? []).map(renderNode);
  switch (node.type) {
    case 'text':
      return <span key={key}>{wrapWithMarks(node.marks, node.text ?? '')}</span>;
    case 'hardBreak':
      return <br key={key} />;
    case 'paragraph':
      return <p key={key}>{children}</p>;
    case 'heading':
      return node.attrs?.['level'] === 2 ? (
        <h2 key={key}>{children}</h2>
      ) : (
        <h3 key={key}>{children}</h3>
      );
    case 'bulletList':
      return <ul key={key}>{children}</ul>;
    case 'orderedList':
      return <ol key={key}>{children}</ol>;
    case 'listItem':
      return <li key={key}>{children}</li>;
    default: {
      const exhaustive: never = node.type;
      return exhaustive;
    }
  }
}

interface RichTextContentProps {
  content: RichTextDoc;
  className?: string;
}

export function RichTextContent({ content, className }: RichTextContentProps) {
  return <div className={className}>{(content.content ?? []).map(renderNode)}</div>;
}
