import { createContext } from 'react';

import type { Citation } from '@gruenerator/chat';

/**
 * Per-message citation lookup + tap handler, provided by `AssistantMessage`.
 *
 * Lets the streamed text part turn inline [N] markers into tappable chips that
 * open the citation detail sheet — the native analog of web's
 * CitationProvider → CitationBadge. It is a context rather than a prop because
 * the text part is instantiated by `MessagePrimitive.Parts`, not by us.
 */
export const MessageCitationsContext = createContext<{
  citationMap: Map<number, Citation>;
  onCitationPress: (citation: Citation) => void;
} | null>(null);
