import { isVisualBlockKind, parseVisualBlock } from '@gruenerator/contracts';
import { ActivityIndicator, View } from 'react-native';

import { spacing } from '../../../theme';
import { VisualBlockView } from '../visual/VisualBlockView';

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
 *
 * A fence whose language is a visual-block kind (```bars, ```chart, …) is drawn
 * by `VisualBlockView`. While the message streams, a block whose JSON does not
 * parse yet is still being written, so it shows a spinner rather than half a
 * JSON object; once the message is done, an invalid block falls back to code.
 */
export function makeCodeMarkdownRules(theme: Theme, isStreaming = false): RenderRules {
  const render = (node: { key: string; content: string; sourceInfo?: string }) => {
    const code = stripTrailingNewline(node.content);
    const language = (node.sourceInfo ?? '').trim().split(/\s+/)[0] ?? '';
    const visual = parseVisualBlock(language, code);
    if (visual) return <VisualBlockView key={node.key} visual={visual} theme={theme} />;
    if (isStreaming && isVisualBlockKind(language)) {
      return (
        <View
          key={node.key}
          style={{ paddingVertical: spacing.medium, alignItems: 'center' }}
          accessibilityLabel="Darstellung wird erstellt"
        >
          <ActivityIndicator color={theme.textSecondary} />
        </View>
      );
    }
    return <CodeBlock key={node.key} code={code} info={node.sourceInfo} theme={theme} />;
  };

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
