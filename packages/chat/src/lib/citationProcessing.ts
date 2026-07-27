import { type ReactNode, Children, isValidElement, Fragment, createElement } from 'react';

import { CitationBadge } from '../components/message-parts/CitationPopover';

import type { Citation } from '../hooks/useChatGraphStream';

/**
 * A single marker (`[3]`) OR a grouped one (`[3, 7]`). Groups are not a
 * hypothetical: the backend's citation clamp emits them verbatim
 * (`stripOutOfRangeCitations`, "[2, 7]" → "[2]"), and models write them
 * unprompted. Matching only the single form left `[1, 2]` on screen as literal
 * brackets beside real ① badges in the SAME answer.
 */
const CITATION_REGEX = /\[(\d+(?:\s*,\s*\d+)*)\]/g;
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
    // Reserve the same inline box during streaming so the final text→badge
    // swap at completion does not reflow paragraph line wrapping.
    const renderable = match[1]
      .split(',')
      .map((n) => parseInt(n, 10))
      .filter(
        (id) =>
          citationMap.get(id) !== undefined ||
          (allowPlaceholders && id >= 1 && id <= MAX_CITATION_ID)
      );

    // A group whose ids are ALL unbacked stays literal text, exactly as a
    // single unbacked marker does. A partly-backed group renders the ids it can
    // and drops the rest — the same rule the backend clamp applies.
    if (renderable.length === 0) continue;

    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    for (const citationId of renderable) {
      parts.push(
        createElement(CitationBadge, {
          key: `cite-${match.index}-${citationId}`,
          citationId,
          citation: citationMap.get(citationId),
        })
      );
    }
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
  return text.replace(/\[(\d+(?:\s*,\s*\d+)*)\]/g, '\\[$1\\]');
}
