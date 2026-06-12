import { useMemo } from 'react';

import { type RichTextDoc } from '@gruenerator/contracts';
import { siteRichTextExtensions } from '@gruenerator/contracts/sites-richtext';
import { renderToReactElement } from '@tiptap/static-renderer/pm/react';

interface RichTextContentProps {
  content: RichTextDoc;
  className?: string;
}

export function RichTextContent({ content, className }: RichTextContentProps) {
  const rendered = useMemo(
    () => renderToReactElement({ extensions: siteRichTextExtensions, content }),
    [content]
  );
  return <div className={className}>{rendered}</div>;
}
