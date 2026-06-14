import { Linking, Text } from 'react-native';

import { colors } from '../../../theme';

import type { ResearchCitation } from '@gruenerator/chat';
import type { ReactNode } from 'react';
import type { StyleProp, TextStyle } from 'react-native';
import type { RenderRules } from 'react-native-markdown-display';

// Same marker grammar as web's processTextWithCitations.
const CITATION_REGEX = /\[(\d+)\]/g;

/**
 * react-native-markdown-display rule that renders inline [N] citation markers
 * as tappable chips opening the cited source — the native counterpart of
 * web's CitationBadge popovers (no hover on touch, so tap → source).
 * Returns undefined when there are no citations so Markdown keeps its
 * default text rule.
 */
export function makeCitationMarkdownRules(
  citations: Map<number, ResearchCitation>
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
        const citation = citations.get(parseInt(match[1], 10));
        if (!citation) continue;
        if (match.index > lastIndex) {
          parts.push(text.slice(lastIndex, match.index));
        }
        const url = citation.url;
        parts.push(
          <Text
            key={`cite-${match.index}`}
            style={chipStyle}
            onPress={url ? () => void Linking.openURL(url) : undefined}
            accessibilityRole="link"
            accessibilityLabel={`Quelle ${citation.id}: ${citation.title}`}
          >
            {' '}
            [{citation.id}]
          </Text>
        );
        lastIndex = match.index + match[0].length;
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

const chipStyle = {
  color: colors.primary[600],
  fontWeight: '700' as const,
  fontSize: 11,
};
