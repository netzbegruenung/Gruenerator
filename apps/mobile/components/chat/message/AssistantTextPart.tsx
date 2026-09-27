import { parseSourceLinkHref } from '@gruenerator/shared/utils';
import { useCallback, useContext, useMemo } from 'react';

import { useTheme } from '../../../hooks/useTheme';
import { makeCodeMarkdownRules } from '../code/codeMarkdownRules';
import { getMarkdownStyles } from '../markdownStyles';
import { MathText } from '../math/MathText';
import { makeCitationMarkdownRules } from '../tool-ui/citationMarkdownRules';

import { MessageCitationsContext } from './citationContext';

/** The `Text` slot of `MessagePrimitive.Parts`: markdown, math and citation chips. */
export function AssistantTextPart(props: { text: string }) {
  const theme = useTheme();
  const markdownStyles = useMemo(() => getMarkdownStyles(theme), [theme]);
  const citationCtx = useContext(MessageCitationsContext);
  // Code rules always; citation rules only when the message carries sources.
  // The two never touch the same node kind (`fence`/`code_block` vs `text`), so
  // the merge order is irrelevant — it is spelled out anyway so a future rule
  // collision is a visible decision rather than a silent overwrite.
  const rules = useMemo(
    () => ({
      ...makeCodeMarkdownRules(theme),
      ...(citationCtx
        ? makeCitationMarkdownRules(citationCtx.citationMap, citationCtx.onCitationPress)
        : {}),
    }),
    [theme, citationCtx]
  );
  // A source link `[Titel](quelle:N)` opens its citation's document; its
  // scheme must never reach Linking. While streaming, before the citations
  // arrive, the tap does nothing. Every other link opens as before.
  const onLinkPress = useCallback(
    (url: string) => {
      const id = parseSourceLinkHref(url);
      if (id === null) return true;
      const citation = citationCtx?.citationMap.get(id);
      if (citation) citationCtx?.onSourceLinkPress(citation);
      return false;
    },
    [citationCtx]
  );
  return (
    <MathText
      text={props.text}
      markdownStyles={markdownStyles}
      rules={rules}
      theme={theme}
      onLinkPress={onLinkPress}
    />
  );
}
