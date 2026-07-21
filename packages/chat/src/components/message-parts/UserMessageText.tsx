'use client';

import { memo, type ReactNode } from 'react';
import { useMessagePartText } from '@assistant-ui/react';
import { parseMentionTokens } from '@gruenerator/shared/utils';

/**
 * Text part for user messages: renders durable mention tokens
 * (`@[Label](type:id)`) as chips instead of raw markup. Plain text (old
 * messages, no tokens) passes through untouched.
 */
function renderWithChips(text: string): ReactNode {
  const tokens = parseMentionTokens(text);
  if (tokens.length === 0) return text;
  const out: ReactNode[] = [];
  let cursor = 0;
  for (const token of tokens) {
    if (token.index > cursor) out.push(text.slice(cursor, token.index));
    out.push(
      <span
        key={`${token.index}-${token.type}-${token.id}`}
        className="mx-0.5 inline-flex items-center rounded-md bg-primary/10 px-1.5 py-0.5 align-baseline text-[0.92em] font-medium text-primary-700 dark:bg-primary-400/15 dark:text-primary-300"
        title={`@${token.label}`}
      >
        @{token.label}
      </span>
    );
    cursor = token.index + token.raw.length;
  }
  if (cursor < text.length) out.push(text.slice(cursor));
  return out;
}

export const UserMessageText = memo(function UserMessageText() {
  const { text } = useMessagePartText();
  return <>{renderWithChips(text)}</>;
});
