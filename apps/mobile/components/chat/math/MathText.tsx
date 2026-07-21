import {
  normalizeMathDelimiters,
  normalizeUnicodeMath,
  splitMathSegments,
} from '@gruenerator/chat';
import { memo, useMemo } from 'react';
import Markdown from 'react-native-markdown-display';

import MathViewDOM from './MathViewDOM';

import type { Theme } from '../../../theme/colors';
import type { getMarkdownStyles } from '../markdownStyles';
import type { RenderRules } from 'react-native-markdown-display';

// Same detector web uses to lazy-load the KaTeX CSS (packages/chat katexCss.ts):
// $$…$$, closed inline $…$, or backslash delimiters.
const MATH_DETECT_RE = /\$\$|\$[^$\n]+\$|\\\(|\\\[/;

interface MathTextProps {
  text: string;
  markdownStyles: ReturnType<typeof getMarkdownStyles>;
  rules: RenderRules | null;
  theme: Theme;
}

/** One KaTeX WebView per math segment; memo + stable keys keep already-closed
 *  segments mounted while the streaming tail keeps changing. */
const MathBlock = memo(function MathBlock(props: {
  content: string;
  mode: 'display' | 'mixed';
  theme: Theme;
}) {
  return (
    <MathViewDOM
      content={props.content}
      mode={props.mode}
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
 * split into markdown and math segments (shared `splitMathSegments`), math
 * rendered via the KaTeX DOM component.
 *
 * Known tradeoff: inside `math-paragraph` segments the paragraph is rendered
 * by KaTeX auto-render as plain text + math — inline [N] citation chips and
 * markdown emphasis are not applied there. Math paragraphs are prose-light,
 * and citations keep working in every plain-markdown segment.
 */
export function MathText({ text, markdownStyles, rules, theme }: MathTextProps) {
  const segments = useMemo(() => {
    if (!MATH_DETECT_RE.test(text)) return null;
    return splitMathSegments(normalizeUnicodeMath(normalizeMathDelimiters(text)));
  }, [text]);

  if (!segments) {
    return (
      <Markdown style={markdownStyles} rules={rules ?? undefined}>
        {text}
      </Markdown>
    );
  }

  return (
    <>
      {segments.map((segment, index) =>
        segment.kind === 'markdown' ? (
          <Markdown key={`markdown:${index}`} style={markdownStyles} rules={rules ?? undefined}>
            {segment.content}
          </Markdown>
        ) : (
          <MathBlock
            key={`${segment.kind}:${index}`}
            content={segment.content}
            mode={segment.kind === 'math-display' ? 'display' : 'mixed'}
            theme={theme}
          />
        )
      )}
    </>
  );
}
