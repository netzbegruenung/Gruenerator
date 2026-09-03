'use client';

import { type FeedbackAdapter } from '@assistant-ui/react';
import { useMemo, useRef } from 'react';

import { useChatConfigStore } from '../stores/chatConfigStore';

/**
 * Thumbs up/down → Langfuse score on this turn's trace. The backend put the
 * trace id into the turn metadata, which the parsers stored on
 * `custom.streamMetadata`. No traceId (Langfuse off) → no-op. A per-trace guard
 * skips re-POSTing the same rating when the user toggles/double-clicks.
 *
 * Shared by every surface that renders the thumbs: the chat runtime and the
 * notebook runtime. assistant-ui's `submitFeedback` THROWS when no feedback
 * adapter is registered, so a surface that shows the buttons must register one.
 */
export function useFeedbackAdapter(): FeedbackAdapter {
  const lastFeedbackRef = useRef(new Map<string, 'positive' | 'negative'>());
  return useMemo<FeedbackAdapter>(
    () => ({
      submit: ({ message, type }) => {
        const custom = message.metadata?.custom as
          { streamMetadata?: { traceId?: string } } | undefined;
        const traceId = custom?.streamMetadata?.traceId;
        if (!traceId) return;
        if (lastFeedbackRef.current.get(traceId) === type) return;
        lastFeedbackRef.current.set(traceId, type);
        const { fetch: configFetch, endpoints } = useChatConfigStore.getState();
        void configFetch(endpoints.feedback, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ traceId, value: type }),
        })
          .then((res) => {
            // fetch resolves on 4xx/5xx too, so the guard above would otherwise
            // lock in a rating the backend rejected and block every retry.
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
          })
          .catch((err) => {
            lastFeedbackRef.current.delete(traceId);
            console.warn('[Feedback] submit failed', err);
          });
      },
    }),
    []
  );
}
