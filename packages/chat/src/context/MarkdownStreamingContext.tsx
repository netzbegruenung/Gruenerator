'use client';

import { createContext, useContext, type ReactNode } from 'react';

/**
 * Per-thread switch for assistant-ui's `MarkdownTextPrimitive` smooth-text
 * animation.
 *
 * Default: `true` (matches assistant-ui's own default, used by general chat).
 *
 * Notebook chats override this to `false` because:
 *   - Notebook answers are dense with `[N]` citation markers that become
 *     inline `<sup>` badges via `processChildren(..., true)`. Smooth's
 *     character-at-a-time reveal makes line wrap (and badge placement)
 *     recalculate on every frame, producing the visible up/down jump pattern.
 *   - The notebook adapter already throttles SSE yields to 50ms; a second
 *     animation layer doesn't help perceived smoothness.
 *
 * General chat keeps it `true` because chat answers have fewer citations,
 * shorter messages, and benefit from the typewriter feel.
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
