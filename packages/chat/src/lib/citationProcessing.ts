import { type ReactNode, Children, isValidElement, Fragment, createElement } from 'react';
import { CitationBadge } from '../components/message-parts/CitationPopover';
import type { Citation } from '../hooks/useChatGraphStream';

const CITATION_REGEX = /\[(\d+)\]/g;
const MAX_CITATION_ID = 999;

export function processTextWithCitations(
  text: string,
  citationMap: Map<number, Citation>,
  allowPlaceholders = false
): ReactNode[] {
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let replacedAny = false;

  CITATION_REGEX.lastIndex = 0;
  while ((match = CITATION_REGEX.exec(text)) !== null) {
    const citationId = parseInt(match[1], 10);
    const citation = citationMap.get(citationId);

    // Reserve the same inline box during streaming so the final text→badge
    // swap at completion does not reflow paragraph line wrapping.
    const shouldRenderBadge =
      citation !== undefined ||
      (allowPlaceholders && citationId >= 1 && citationId <= MAX_CITATION_ID);

    if (!shouldRenderBadge) continue;

    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    parts.push(
      createElement(CitationBadge, {
        key: `cite-${match.index}`,
        citationId,
        citation,
      })
    );
    lastIndex = match.index + match[0].length;
    replacedAny = true;
  }

  if (!replacedAny) return [text];

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

export function processChildren(
  children: ReactNode,
  citationMap: Map<number, Citation>,
  allowPlaceholders = false
): ReactNode {
  return Children.map(children, (child) => {
    if (typeof child === 'string') {
      const parts = processTextWithCitations(child, citationMap, allowPlaceholders);
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
            children: processChildren(props.children as ReactNode, citationMap, allowPlaceholders),
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
