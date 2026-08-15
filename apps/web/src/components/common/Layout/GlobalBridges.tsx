import { useCallback } from 'react';

import FeedbackWidget from '../../../features/feedback/FeedbackWidget';
import { useNotificationSSE } from '../../../hooks/useNotificationSSE';
import { useAuthStore } from '../../../stores/authStore';
import { isEmbedded } from '../../../utils/platform';

export function GlobalBridges() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const feedbackButton = useAuthStore((s) => s.user?.feedback_button ?? 'text');

  useNotificationSSE(
    useCallback((data: { title?: string; body?: string }) => {
      // Embedded hosts have their own notification surface; a toast over a
      // pinned WebView is noise the user cannot act on.
      if (isEmbedded()) return;
      if (data.title) {
        void import('sonner').then(({ toast }) =>
          toast(data.title, { description: data.body || undefined })
        );
      }
    }, [])
  );

  // The floating launcher is draggable and sits over the embedded page.
  if (isEmbedded()) return null;

  if (!isAuthenticated || feedbackButton === 'off') return null;

  return <FeedbackWidget variant={feedbackButton} />;
}
