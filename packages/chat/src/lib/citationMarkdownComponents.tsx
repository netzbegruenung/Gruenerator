import { type ReactNode } from 'react';
import { unstable_memoizeMarkdownComponents as memoizeMarkdownComponents } from '@assistant-ui/react-markdown';
import { processChildren } from './citationProcessing';
import type { Citation } from '../hooks/useChatGraphStream';

export function makeCitationComponents(citationMap: Map<number, Citation>) {
  const withCitations = (children: ReactNode) => processChildren(children, citationMap);

  return memoizeMarkdownComponents({
    a: ({ children, href }: { children?: ReactNode; href?: string }) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline hover:text-primary-dark break-words"
      >
        {children}
      </a>
    ),
    code: ({ className, children, ...props }: { className?: string; children?: ReactNode }) => {
      const isInline = !className?.includes('language-');
      if (isInline) {
        return (
          <code
            className="rounded bg-code-inline-bg px-1 py-0.5 font-mono text-sm break-words"
            {...props}
          >
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
    pre: ({ children }: { children?: ReactNode }) => (
      <pre className="overflow-x-auto rounded-lg bg-code-block-bg p-4 text-code-block-fg">
        {children}
      </pre>
    ),
    ul: ({ children }: { children?: ReactNode }) => (
      <ul className="my-2 list-disc space-y-1 pl-4">{children}</ul>
    ),
    ol: ({ children }: { children?: ReactNode }) => (
      <ol className="my-2 list-decimal space-y-1 pl-4">{children}</ol>
    ),
    li: ({ children }: { children?: ReactNode }) => (
      <li className="leading-relaxed">{withCitations(children)}</li>
    ),
    h1: ({ children }: { children?: ReactNode }) => (
      <h1 className="mb-4 mt-6 text-xl font-bold">{children}</h1>
    ),
    h2: ({ children }: { children?: ReactNode }) => (
      <h2 className="mb-3 mt-5 text-lg font-bold">{children}</h2>
    ),
    h3: ({ children }: { children?: ReactNode }) => (
      <h3 className="mb-2 mt-4 text-base font-bold">{children}</h3>
    ),
    p: ({ children }: { children?: ReactNode }) => (
      <p className="mb-2 leading-relaxed">{withCitations(children)}</p>
    ),
    blockquote: ({ children }: { children?: ReactNode }) => (
      <blockquote className="my-2 border-l-4 border-primary pl-4 italic">{children}</blockquote>
    ),
    table: ({ children }: { children?: ReactNode }) => (
      <div className="my-4 overflow-x-auto">
        <table className="w-full border-collapse">{children}</table>
      </div>
    ),
    th: ({ children }: { children?: ReactNode }) => (
      <th className="border border-border px-3 py-2 text-left font-semibold">{children}</th>
    ),
    td: ({ children }: { children?: ReactNode }) => (
      <td className="border border-border px-3 py-2">{withCitations(children)}</td>
    ),
  });
}
