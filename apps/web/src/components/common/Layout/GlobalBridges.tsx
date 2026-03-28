import { useCallback } from 'react';

import { useCustomGeneratorsData } from '../../../features/auth/hooks/useProfileData';
import { useNotificationSSE } from '../../../hooks/useNotificationSSE';
import { useAuthStore } from '../../../stores/authStore';

export function GlobalBridges() {
  const userId = useAuthStore((s) => s.user)?.id;

  useNotificationSSE(
    useCallback((data: { title?: string; body?: string }) => {
      if (data.title) {
        import('sonner').then(({ toast }) =>
          toast(data.title, { description: data.body || undefined })
        );
      }
    }, [])
  );

  useCustomGeneratorsData({ enabled: !!userId });

  return null;
}
