'use client';

import { createContext, useContext } from 'react';

/**
 * Visual treatment of the inline streaming `ProgressIndicator`.
 *
 * `box` is the default chat surface: a tinted pill (`bg-primary/5`) with an
 * agent-colored dot. In the main chat a search arrives as a tool-call, so this
 * box is short-lived before the tool pill takes over.
 *
 * `plain` is for surfaces whose search runs internally and emits a `searching`
 * progress without a tool-call — notably notebook QA. There the box would sit
 * on screen for the whole search, so we render the shimmering message text
 * alone (no box, no dot), matching the chat's "clear text only" loading feel.
 */
export type ProgressDisplay = 'box' | 'plain';

export const ProgressDisplayContext = createContext<ProgressDisplay>('box');

export function useProgressDisplay(): ProgressDisplay {
  return useContext(ProgressDisplayContext);
}
