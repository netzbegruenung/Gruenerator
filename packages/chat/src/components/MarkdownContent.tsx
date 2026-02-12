'use client';

import { memo, Fragment, type ReactNode, Children, isValidElement } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CitationBadge } from './message-parts/CitationPopover';
import { useCitations } from '../context/CitationContext';
import type { Citation } from '../hooks/useChatGraphStream';

interface MarkdownContentProps {
  content: string;
}

const CITATION_REGEX = /\[(\d+)\]/g;

function processTextWithCitations(text: string, citations: Citation[]): ReactNode[] {
  if (!citations.length) return [text];

  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const regex = new RegExp(CITATION_REGEX.source, 'g');
  while ((match = regex.exec(text)) !== null) {
    const citationId = parseInt(match[1], 10);
    const citation = citations.find((c) => c.id === citationId);

    if (citation) {
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index));
      }
      parts.push(
        <CitationBadge key={`cite-${match.index}`} citationId={citationId} citation={citation} />
      );
      lastIndex = match.index + match[0].length;
    }
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}

function processChildren(children: ReactNode, citations: Citation[]): ReactNode {
  if (!citations.length) return children;

  return Children.map(children, (child) => {
    if (typeof child === 'string') {
      const parts = processTextWithCitations(child, citations);
      if (parts.length === 1 && parts[0] === child) return child;
      return <Fragment>{parts}</Fragment>;
    }
    if (isValidElement(child)) {
      const props = child.props as Record<string, unknown>;
      if (props.children) {
        return {
          ...child,
          props: {
            ...props,
            children: processChildren(props.children as ReactNode, citations),
          },
        };
      }
    }
    return child;
  });
}

export const MarkdownContent = memo(function MarkdownContent({ content }: MarkdownContentProps) {
  const citations = useCitations();

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ children, href }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline hover:text-primary-dark"
          >
            {children}
          </a>
        ),
        code: ({ className, children, ...props }) => {
          const isInline = !className?.includes('language-');
          if (isInline) {
            return (
              <code className="rounded bg-code-inline-bg px-1 py-0.5 font-mono text-sm" {...props}>
                {children}
              </code>
            );
          }
          return (
            <code className={className} {...props}>
              {children}
            </code>
          );
        },
        pre: ({ children }) => (
          <pre className="overflow-x-auto rounded-lg bg-code-block-bg p-4 text-code-block-fg">
            {children}
          </pre>
        ),
        ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-4">{children}</ul>,
        ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-4">{children}</ol>,
        li: ({ children }) => (
          <li className="leading-relaxed">{processChildren(children, citations)}</li>
        ),
        h1: ({ children }) => <h1 className="mb-4 mt-6 text-xl font-bold">{children}</h1>,
        h2: ({ children }) => <h2 className="mb-3 mt-5 text-lg font-bold">{children}</h2>,
        h3: ({ children }) => <h3 className="mb-2 mt-4 text-base font-bold">{children}</h3>,
        p: ({ children }) => (
          <p className="mb-2 leading-relaxed">{processChildren(children, citations)}</p>
        ),
        blockquote: ({ children }) => (
          <blockquote className="my-2 border-l-4 border-primary pl-4 italic">{children}</blockquote>
        ),
        table: ({ children }) => (
          <div className="my-4 overflow-x-auto">
            <table className="w-full border-collapse">{children}</table>
          </div>
        ),
        th: ({ children }) => (
          <th className="border border-border px-3 py-2 text-left font-semibold">{children}</th>
        ),
        td: ({ children }) => (
          <td className="border border-border px-3 py-2">{processChildren(children, citations)}</td>
        ),
      }}
    >
      {content.replace(/\[(\d+)\]/g, '\\[$1\\]')}
    </ReactMarkdown>
  );
});
