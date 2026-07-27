import { useContext, useMemo } from 'react';

import { useTheme } from '../../../hooks/useTheme';
import { getMarkdownStyles } from '../markdownStyles';
import { MathText } from '../math/MathText';
import { makeCitationMarkdownRules } from '../tool-ui/citationMarkdownRules';

import { MessageCitationsContext } from './citationContext';

/** The `Text` slot of `MessagePrimitive.Parts`: markdown, math and citation chips. */
export function AssistantTextPart(props: { text: string }) {
  const theme = useTheme();
  const markdownStyles = useMemo(() => getMarkdownStyles(theme), [theme]);
  const citationCtx = useContext(MessageCitationsContext);
  const rules = useMemo(
    () =>
      citationCtx
        ? makeCitationMarkdownRules(citationCtx.citationMap, citationCtx.onCitationPress)
        : undefined,
    [citationCtx]
  );
  return (
    <MathText
      text={props.text}
      markdownStyles={markdownStyles}
      rules={rules ?? null}
      theme={theme}
    />
  );
}
