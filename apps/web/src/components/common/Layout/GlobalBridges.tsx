import { useCallback } from 'react';

import FeedbackWidget from '../../../features/feedback/FeedbackWidget';
import { useNotificationSSE } from '../../../hooks/useNotificationSSE';
import { useAuthStore } from '../../../stores/authStore';

export function GlobalBridges() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const feedbackButton = useAuthStore((s) => s.user?.feedback_button ?? 'text');

  useNotificationSSE(
    useCallback((data: { title?: string; body?: string }) => {
      if (data.title) {
        void import('sonner').then(({ toast }) =>
          toast(data.title, { description: data.body || undefined })
        );
      }
    }, [])
  );

  if (!isAuthenticated || feedbackButton === 'off') return null;

  return <FeedbackWidget variant={feedbackButton} />;
}
