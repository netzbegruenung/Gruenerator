'use client';

import { createContext, useContext, type ReactNode } from 'react';

/**
 * Per-thread switch for assistant-ui's `MarkdownTextPrimitive` smooth-text
 * animation.
 *
 * Default: `true` — general chat and notebook threads alike.
 *
 * Only replayed threads (`ReadonlyThreadProvider`) set it to `false`: nothing
 * streams there, so there is nothing to animate.
 *
 * Notebook threads used to opt out because citation-dense answers visibly
 * jumped under smooth. The cause was never the badge density: the reveal
 * (`useSmooth`) only animates while each new text extends the displayed one,
 * and two things broke that — marker rewriting under the reveal cursor (now a
 * remark plugin, `remarkCitationMarkers`) and the notebook adapter swapping in
 * the renumbered backend answer while the message was still `running` (now
 * yielded together with `status: complete`, so the reveal snaps instead of
 * re-typing). Measured against a real SSE stream: 2 resets of ~800 chars per
 * answer before, none after — indistinguishable from smooth off.
 */
const MarkdownStreamingContext = createContext<boolean>(true);

export function MarkdownStreamingProvider({
  smooth,
  children,
}: {
  smooth: boolean;
  children: ReactNode;
}) {
  return (
    <MarkdownStreamingContext.Provider value={smooth}>{children}</MarkdownStreamingContext.Provider>
  );
}

export function useMarkdownSmooth(): boolean {
  return useContext(MarkdownStreamingContext);
}
