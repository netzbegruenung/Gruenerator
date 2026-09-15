import { type ReactNode } from 'react';

import { CitationMarker } from '../components/message-parts/CitationMarker';
import { toText } from '../components/message-parts/codeBlockExecution';
import { StreamdownCodeBlock } from '../components/message-parts/StreamdownCodeBlock';

import { normalizeLang } from './shikiHighlight';

const LANGUAGE_CLASS_RE = /language-(\S+)/;

/**
 * Component map for StreamdownTextPrimitive (StreamdownMarkdownText). Fork of
 * `citationMarkdownComponents.tsx` for the Streamdown rendering path:
 *
 * - Citation badges arrive as `<citation n="…">` elements (rewritten in
 *   `preprocess`, passed through `allowedTags`), so there is no
 *   `processChildren` child-walking on p/li/td anymore — those overrides keep
 *   only their styling here.
 * - Unlike the react-markdown map this needs no `citationMap` closure
 *   (CitationMarker resolves citations from context), so it can be a
 *   module-level constant — a stable prop identity Streamdown's block
 *   memoization benefits from.
 * - Fenced code goes through the `code` override alone (no `pre`): the
 *   assistant-ui wrapper marks a fence's code element with `data-block`, and
 *   StreamdownCodeBlock draws it in Streamdown's own chrome. A `pre` override
 *   next to `code` would switch the wrapper into its react-markdown
 *   compatibility adapter, which bypasses that chrome.
 *
 * `citation` is not a standard HTML tag, hence the cast: the wrapper's
 * `StreamdownTextComponents` extends react-markdown's `Components` (keyed by
 * known tag names), while Streamdown deliberately supports custom tags
 * declared via `allowedTags` (same pattern as their `<mention>` example).
 *
 * Every override receives the hast `node` prop (the legacy map went through
 * memoizeMarkdownComponents, which strips it); an override that spreads its
 * rest props onto a DOM element must drop `node` first.
 */
export const streamdownComponents = {
  a: ({ children, href }: { children?: ReactNode; href?: string }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary underline hover:text-primary-dark break-words [overflow-wrap:anywhere]"
    >
      {children}
    </a>
  ),
  code: ({
    className,
    children,
    node: _node,
    'data-block': dataBlock,
    ...props
  }: {
    className?: string;
    children?: ReactNode;
    node?: unknown;
    'data-block'?: string;
  }) => {
    if (!dataBlock) {
      return (
        <code
          className="rounded bg-code-inline-bg px-1 py-0.5 font-mono text-sm break-words"
          {...props}
        >
          {children}
        </code>
      );
    }
    const language = normalizeLang(LANGUAGE_CLASS_RE.exec(className ?? '')?.[1]);
    return <StreamdownCodeBlock code={toText(children).replace(/\n$/, '')} language={language} />;
  },
  ul: ({ children }: { children?: ReactNode }) => (
    <ul className="my-2 list-disc space-y-1 pl-4">{children}</ul>
  ),
  ol: ({ children }: { children?: ReactNode }) => (
    <ol className="my-2 list-decimal space-y-1 pl-4">{children}</ol>
  ),
  li: ({ children }: { children?: ReactNode }) => <li className="leading-relaxed">{children}</li>,
  h1: ({ children }: { children?: ReactNode }) => (
    <h1 className="mb-4 mt-6 text-xl font-bold">{children}</h1>
  ),
  h2: ({ children }: { children?: ReactNode }) => (
    <h2 className="mb-3 mt-5 text-lg font-bold">{children}</h2>
  ),
  h3: ({ children }: { children?: ReactNode }) => (
    <h3 className="mb-2 mt-4 text-base font-bold">{children}</h3>
  ),
  p: ({ children }: { children?: ReactNode }) => <p className="mb-2 leading-relaxed">{children}</p>,
  hr: () => null,
  blockquote: ({ children }: { children?: ReactNode }) => (
    <blockquote className="my-2 border-l-4 border-primary pl-4 italic">{children}</blockquote>
  ),
  table: ({ children }: { children?: ReactNode }) => (
    <div className="my-4 overflow-x-auto">
      <table className="w-full min-w-[28rem] border-collapse">{children}</table>
    </div>
  ),
  th: ({ children }: { children?: ReactNode }) => (
    <th className="border border-border px-3 py-2 text-left font-semibold">{children}</th>
  ),
  td: ({ children }: { children?: ReactNode }) => (
    <td className="border border-border px-3 py-2">{children}</td>
  ),
  citation: ({ n }: { n?: string | number }) => <CitationMarker n={n} />,
} as const;
