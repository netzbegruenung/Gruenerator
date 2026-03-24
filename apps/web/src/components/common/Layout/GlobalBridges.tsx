import { useCallback } from 'react';

import { useCustomGeneratorsData } from '../../../features/auth/hooks/useProfileData';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import { useNotificationSSE } from '../../../hooks/useNotificationSSE';

export function GlobalBridges() {
  const userId = useOptimizedAuth().user?.id;

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
