import { Linking, Text } from 'react-native';

import { CitationBadge } from '../CitationBadge';

import type { ReactNode } from 'react';
import type { StyleProp, TextStyle } from 'react-native';
import type { RenderRules } from 'react-native-markdown-display';

// Same marker grammar as web's processTextWithCitations — single `[3]` AND
// grouped `[3, 7]`. Keep the two in step: the backend emits groups (its clamp
// even rewrites them in place), and a renderer that only knows the single form
// leaves them on screen as literal brackets beside real chips.
const CITATION_REGEX = /\[(\d+(?:\s*,\s*\d+)*)\]/g;

/** Minimal shape an inline citation chip needs — satisfied by both the chat
 *  `Citation` and the tool-result `ResearchCitation` from `@gruenerator/chat`. */
interface ChipCitation {
  id: number;
  url?: string | null;
  title?: string;
}

/**
 * react-native-markdown-display rule that renders inline [N] citation markers
 * as tappable chips — the native counterpart of web's CitationBadge.
 * When `onPress` is given, a tap opens it (e.g. the chat citation detail sheet,
 * mirroring web's popover); otherwise it falls back to opening the source URL
 * (used by tool/research cards). Returns undefined when there are no citations
 * so Markdown keeps its default text rule.
 */
export function makeCitationMarkdownRules<C extends ChipCitation>(
  citations: Map<number, C>,
  onPress?: (citation: C) => void
): RenderRules | undefined {
  if (citations.size === 0) return undefined;

  return {
    text: (node, _children, _parent, styles, inheritedStyles = {}) => {
      // react-native-markdown-display types `styles` as any; extract the one
      // entry we need behind a typed boundary.
      const textStyle = (styles as { text?: StyleProp<TextStyle> }).text;
      const text: string = node.content;
      CITATION_REGEX.lastIndex = 0;
      if (!CITATION_REGEX.test(text)) {
        return (
          <Text key={node.key} style={[inheritedStyles, textStyle]}>
            {text}
          </Text>
        );
      }

      const parts: ReactNode[] = [];
      let lastIndex = 0;
      let match: RegExpExecArray | null;
      CITATION_REGEX.lastIndex = 0;
      while ((match = CITATION_REGEX.exec(text)) !== null) {
        // A group renders one chip per backed id; a group whose ids are all
        // unknown stays literal text, exactly as a single unknown marker does.
        const matched = match[1]
          .split(',')
          .map((n) => citations.get(parseInt(n, 10)))
          .filter((c): c is C => c !== undefined);
        if (matched.length === 0) continue;
        const matchIndex = match.index;
        if (matchIndex > lastIndex) {
          parts.push(text.slice(lastIndex, matchIndex));
        }
        for (const citation of matched) {
          const url = citation.url;
          const handlePress = onPress
            ? () => onPress(citation)
            : url
              ? () => void Linking.openURL(url)
              : undefined;
          // Plain space before the badge so the bubble doesn't sit flush against
          // the preceding word.
          parts.push(' ');
          parts.push(
            <CitationBadge
              key={`cite-${matchIndex}-${citation.id}`}
              label={citation.id}
              onPress={handlePress}
              accessibilityLabel={`Quelle ${citation.id}: ${citation.title ?? ''}`}
            />
          );
        }
        lastIndex = matchIndex + match[0].length;
      }
      if (parts.length === 0) {
        return (
          <Text key={node.key} style={[inheritedStyles, textStyle]}>
            {text}
          </Text>
        );
      }
      if (lastIndex < text.length) {
        parts.push(text.slice(lastIndex));
      }

      return (
        <Text key={node.key} style={[inheritedStyles, textStyle]}>
          {parts}
        </Text>
      );
    },
  };
}
