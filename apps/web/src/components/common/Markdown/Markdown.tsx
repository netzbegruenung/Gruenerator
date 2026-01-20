import { lazy, Suspense, JSX, AnchorHTMLAttributes, ReactNode } from 'react';
import type { Components } from 'react-markdown';

const ReactMarkdown = lazy(() => import('react-markdown'));

/**
 * Preprocesses markdown to fix common formatting issues from Qdrant chunks.
 */
const preprocessMarkdown = (text: string): string => {
  let result = text;

  // 1. Join multi-line headers: "# Header\nContinuation" → "# Header Continuation"
  // Detects when header text is split across lines (no sentence-ending punctuation)
  result = result.replace(
    /(#{1,6}\s+[^\n.!?]{2,30})\n+([A-ZÄÖÜ][a-zäöüß]+)/g,
    '$1 $2'
  );

  // 2. Add line break BEFORE headers appearing after sentences
  result = result.replace(
    /([.!?])\s+(#{1,6}\s+)/g,
    '$1\n\n$2'
  );

  // 3. Add line break AFTER headers followed by body text
  result = result.replace(
    /(#{1,6}\s+[A-ZÄÖÜ][^\n]{2,50}?)\s+([A-ZÄÖÜ][a-zäöüß]{2,})/g,
    '$1\n\n$2'
  );

  return result;
};

export const MARKDOWN_COMPONENTS: Partial<Components> = {
  a: (props): JSX.Element => {
    const { node, ...rest } = props as AnchorHTMLAttributes<HTMLAnchorElement> & { node?: unknown };
    return <a {...rest} target="_blank" rel="noopener noreferrer" />;
  }
};

const INLINE_COMPONENTS: Partial<Components> = {
  ...MARKDOWN_COMPONENTS,
  p: ({ children }): JSX.Element => <span>{children}</span>
};

interface MarkdownProps {
  children: string;
  className?: string;
  components?: Partial<Components>;
  fallback?: ReactNode;
  inline?: boolean;
}

export const Markdown = ({ children, className, components, fallback, inline }: MarkdownProps): JSX.Element => {
  const baseComponents = inline ? INLINE_COMPONENTS : MARKDOWN_COMPONENTS;
  const Wrapper = inline ? 'span' : 'div';
  const processedContent = inline ? children : preprocessMarkdown(children);

  return (
    <Suspense fallback={fallback ?? <span>{children}</span>}>
      <Wrapper className={className}>
        <ReactMarkdown components={{ ...baseComponents, ...components }}>
          {processedContent}
        </ReactMarkdown>
      </Wrapper>
    </Suspense>
  );
};

export default Markdown;
