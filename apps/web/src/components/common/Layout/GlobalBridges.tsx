import { lazy, Suspense, useCallback } from 'react';
import { useLocation } from 'react-router-dom';

import { useDesktopMenu } from '../../../hooks/useDesktopMenu';
import { useNotificationSSE } from '../../../hooks/useNotificationSSE';
import { useAuthStore } from '../../../stores/authStore';
import { isEmbedded } from '../../../utils/platform';

// Lazy: das Widget zieht @dnd-kit (Launcher) und rendert nur für angemeldete Personen
// mit aktivem Knopf — es gehört nicht in den Entry.
const FeedbackWidget = lazy(() => import('../../../features/feedback/FeedbackWidget'));

export function GlobalBridges() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const feedbackButton = useAuthStore((s) => s.user?.feedback_button ?? 'text');
  const { pathname } = useLocation();
  // The start page keeps its bottom edge for the composer; the launcher would sit
  // on top of it and of „Neu erstellen".
  const onStartPage = pathname === '/' || pathname === '/start' || pathname.startsWith('/start/');

  useDesktopMenu();

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

  return (
    <Suspense fallback={null}>
      <FeedbackWidget variant={feedbackButton} showLauncher={!onStartPage} />
    </Suspense>
  );
}
