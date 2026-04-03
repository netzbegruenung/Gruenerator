import { type ReactNode, Children, isValidElement, Fragment, createElement } from 'react';
import { CitationBadge } from '../components/message-parts/CitationPopover';
import type { Citation } from '../hooks/useChatGraphStream';

const CITATION_REGEX = /\[(\d+)\]/g;

export function processTextWithCitations(
  text: string,
  citationMap: Map<number, Citation>
): ReactNode[] {
  if (citationMap.size === 0) return [text];

  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  CITATION_REGEX.lastIndex = 0;
  while ((match = CITATION_REGEX.exec(text)) !== null) {
    const citationId = parseInt(match[1], 10);
    const citation = citationMap.get(citationId);

    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    if (citation) {
      parts.push(
        createElement(CitationBadge, {
          key: `cite-${match.index}`,
          citationId,
          citation,
        })
      );
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}

export function processChildren(
  children: ReactNode,
  citationMap: Map<number, Citation>
): ReactNode {
  if (citationMap.size === 0) return children;

  return Children.map(children, (child) => {
    if (typeof child === 'string') {
      const parts = processTextWithCitations(child, citationMap);
      if (parts.length === 1 && parts[0] === child) return child;
      return createElement(Fragment, null, ...parts);
    }
    if (isValidElement(child)) {
      const props = child.props as Record<string, unknown>;
      if (props.children) {
        return {
          ...child,
          props: {
            ...props,
            children: processChildren(props.children as ReactNode, citationMap),
          },
        };
      }
    }
    return child;
  });
}

export function escapeCitationMarkers(text: string): string {
  return text.replace(/\[(\d+)\]/g, '\\[$1\\]');
}
