import { CodeBlock } from './CodeBlock';

import type { Theme } from '../../../theme/colors';
import type { RenderRules } from 'react-native-markdown-display';

/**
 * `react-native-markdown-display` rules that route fenced and indented code
 * through `CodeBlock` instead of the default single grey paragraph.
 *
 * Both node kinds are covered: `fence` is ```-delimited, `code_block` is the
 * four-space form, which models still emit occasionally. The indented form
 * carries no language, so it falls through to the plain lexer.
 */
export function makeCodeMarkdownRules(theme: Theme): RenderRules {
  const render = (node: { key: string; content: string; sourceInfo?: string }) => (
    <CodeBlock
      key={node.key}
      code={stripTrailingNewline(node.content)}
      info={node.sourceInfo}
      theme={theme}
    />
  );

  return {
    fence: render,
    code_block: render,
  };
}

/**
 * The parser hands back the fence body with the newline that preceded the
 * closing ```. Keeping it would render an empty last line inside every block.
 */
function stripTrailingNewline(content: string): string {
  return content.endsWith('\n') ? content.slice(0, -1) : content;
}
