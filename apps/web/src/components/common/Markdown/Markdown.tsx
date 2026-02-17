import {
  Component,
  lazy,
  Suspense,
  type ErrorInfo,
  type JSX,
  type AnchorHTMLAttributes,
  type ReactNode,
} from 'react';

import type { Components } from 'react-markdown';

const ReactMarkdown = lazy(() => import('react-markdown'));

class MarkdownErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.warn('[Markdown] Rendering failed, showing raw text fallback:', error.message, info);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

/**
 * Preprocesses markdown to fix common formatting issues from Qdrant chunks.
 */
const preprocessMarkdown = (text: string): string => {
  let result = text;

  // 1. Join multi-line headers: "# Header\nContinuation" → "# Header Continuation"
  // Only join when the next line is a short continuation (≤3 words, no sentence structure)
  // Avoids merging headers with body paragraphs (e.g. "## Betreff\nDer Verband beantragt...")
  result = result.replace(
    /(#{1,6}\s+[^\n.!?]{2,30})\n+([A-ZÄÖÜ][a-zäöüß]+(?:\s+[a-zäöüß]+){0,2})\s*$/gm,
    '$1 $2'
  );

  // 2. Add line break BEFORE headers appearing after sentences
  result = result.replace(/([.!?])\s+(#{1,6}\s+)/g, '$1\n\n$2');

  // 3. Add line break AFTER headers followed by body text
  result = result.replace(/(#{1,6}\s+[A-ZÄÖÜ][^\n]{2,50}?)\s+([A-ZÄÖÜ][a-zäöüß]{2,})/g, '$1\n\n$2');

  return result;
};

export const MARKDOWN_COMPONENTS: Partial<Components> = {
  a: (props): JSX.Element => {
    const { node, ...rest } = props as AnchorHTMLAttributes<HTMLAnchorElement> & { node?: unknown };
    return <a {...rest} target="_blank" rel="noopener noreferrer" />;
  },
};

const INLINE_COMPONENTS: Partial<Components> = {
  ...MARKDOWN_COMPONENTS,
  p: ({ children }): JSX.Element => <span>{children}</span>,
};

interface MarkdownProps {
  children: string;
  className?: string;
  components?: Partial<Components>;
  fallback?: ReactNode;
  inline?: boolean;
}

export const Markdown = ({
  children,
  className,
  components,
  fallback,
  inline,
}: MarkdownProps): JSX.Element => {
  const baseComponents = inline ? INLINE_COMPONENTS : MARKDOWN_COMPONENTS;
  const Wrapper = inline ? 'span' : 'div';
  const processedContent = inline ? children : preprocessMarkdown(children);

  const rawFallback = fallback ?? <span>{children}</span>;

  return (
    <MarkdownErrorBoundary fallback={rawFallback}>
      <Suspense fallback={rawFallback}>
        <Wrapper className={className}>
          <ReactMarkdown components={{ ...baseComponents, ...components }}>
            {processedContent}
          </ReactMarkdown>
        </Wrapper>
      </Suspense>
    </MarkdownErrorBoundary>
  );
};

export default Markdown;
