import { useCallback } from 'react';

import { useNotificationSSE } from '../../../hooks/useNotificationSSE';

export function GlobalBridges() {
  useNotificationSSE(
    useCallback((data: { title?: string; body?: string }) => {
      if (data.title) {
        void import('sonner').then(({ toast }) =>
          toast(data.title, { description: data.body || undefined })
        );
      }
    }, [])
  );

  return null;
}
