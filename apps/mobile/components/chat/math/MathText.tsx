import {
  normalizeMathDelimiters,
  normalizeUnicodeMath,
  splitMathSegments,
} from '@gruenerator/chat';
import { memo, useMemo } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import Markdown, { MarkdownIt } from 'react-native-markdown-display';
import { SvgAst } from 'react-native-svg';

import { chatType, spacing } from '../../../theme';

import MathViewDOM from './MathViewDOM';
import { texToSvg } from './texToSvg';

import type { Theme } from '../../../theme/colors';
import type { getMarkdownStyles } from '../markdownStyles';
import type { RenderRules } from 'react-native-markdown-display';

// Same detector web uses to lazy-load the KaTeX CSS (packages/chat katexCss.ts):
// $$…$$, closed inline $…$, or backslash delimiters.
const MATH_DETECT_RE = /\$\$|\$[^$\n]+\$|\\\(|\\\[/;

// The library's default prop builds a new parser on every render, i.e. per streamed token.
const markdownIt = MarkdownIt({ typographer: true });

interface MathTextProps {
  text: string;
  markdownStyles: ReturnType<typeof getMarkdownStyles>;
  rules: RenderRules | null;
  theme: Theme;
  /** Markdown's link hook: return `false` to keep a link from opening. */
  onLinkPress?: (url: string) => boolean;
}

const MATH_FONT_SIZE = chatType.chatBody.fontSize as number;

/** A `$$…$$` block, drawn natively from MathJax's SVG. Wide formulas scroll
 *  sideways like code blocks; TeX MathJax rejects shows as its source. */
const MathDisplay = memo(function MathDisplay(props: { content: string; theme: Theme }) {
  const svg = texToSvg(props.content, true);
  if (!svg) {
    return (
      <Text style={[styles.fallback, { color: props.theme.text }]} selectable>
        {`$$${props.content}$$`}
      </Text>
    );
  }
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.display}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Formel: ${props.content}`}
    >
      <SvgAst
        ast={svg.ast}
        override={{
          width: svg.width * MATH_FONT_SIZE,
          height: svg.height * MATH_FONT_SIZE,
          color: props.theme.text,
        }}
      />
    </ScrollView>
  );
});

/** One KaTeX WebView per prose-with-`$…$` paragraph; memo + stable keys keep
 *  already-closed segments mounted while the streaming tail keeps changing. */
const MathParagraph = memo(function MathParagraph(props: { content: string; theme: Theme }) {
  return (
    <MathViewDOM
      content={props.content}
      textColor={props.theme.text}
      fontSize={16}
      dom={{
        matchContents: true,
        scrollEnabled: false,
        style: { backgroundColor: 'transparent' },
      }}
    />
  );
});

/**
 * Assistant text renderer with math support: plain prose goes through the
 * existing markdown renderer untouched (fast path); text containing LaTeX is
 * split into markdown and math segments (shared `splitMathSegments`). Display
 * math is drawn natively as SVG; math paragraphs use the KaTeX DOM component.
 *
 * Known tradeoff: inside `math-paragraph` segments the paragraph is rendered
 * by KaTeX auto-render as plain text + math — inline [N] citation chips and
 * markdown emphasis are not applied there. Math paragraphs are prose-light,
 * and citations keep working in every plain-markdown segment.
 */
export function MathText({ text, markdownStyles, rules, theme, onLinkPress }: MathTextProps) {
  const segments = useMemo(() => {
    if (!MATH_DETECT_RE.test(text)) return null;
    return splitMathSegments(normalizeUnicodeMath(normalizeMathDelimiters(text)));
  }, [text]);

  if (!segments) {
    return (
      <Markdown
        style={markdownStyles}
        rules={rules ?? undefined}
        markdownit={markdownIt}
        onLinkPress={onLinkPress}
      >
        {text}
      </Markdown>
    );
  }

  return (
    <>
      {segments.map((segment, index) =>
        segment.kind === 'markdown' ? (
          <Markdown
            key={`markdown:${index}`}
            style={markdownStyles}
            rules={rules ?? undefined}
            markdownit={markdownIt}
            onLinkPress={onLinkPress}
          >
            {segment.content}
          </Markdown>
        ) : segment.kind === 'math-display' ? (
          <MathDisplay key={`${segment.kind}:${index}`} content={segment.content} theme={theme} />
        ) : (
          <MathParagraph key={`${segment.kind}:${index}`} content={segment.content} theme={theme} />
        )
      )}
    </>
  );
}

const styles = StyleSheet.create({
  // Centred like KaTeX's display mode while narrower than the screen.
  display: { flexGrow: 1, justifyContent: 'center', paddingVertical: spacing.xsmall },
  fallback: chatType.chatBody,
});
