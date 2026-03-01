import { MessageCircle } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

interface RateLimitStatus {
  remaining: number | null;
  limit: number | null;
  used: number;
}

export function RateLimitBadge() {
  const [status, setStatus] = useState<RateLimitStatus | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/gruen-o-mat/status');
      if (res.ok) {
        setStatus(await res.json());
      }
    } catch {
      // silently ignore — badge just won't show
    }
  }, []);

  useEffect(() => {
    fetchStatus();

    // Re-fetch after each message (listen for SSE connections closing)
    const interval = setInterval(fetchStatus, 30_000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // Also re-fetch when the user sends a message (DOM mutation on thread)
  useEffect(() => {
    const observer = new MutationObserver(() => {
      // Small delay so the backend has time to increment
      setTimeout(fetchStatus, 2000);
    });

    const viewport = document.querySelector('[data-thread-viewport]');
    if (viewport) {
      observer.observe(viewport, { childList: true, subtree: true });
    }

    return () => observer.disconnect();
  }, [fetchStatus]);

  if (!status || status.remaining === null || status.limit === null) return null;

  const isLow = status.remaining <= 5;
  const isExhausted = status.remaining <= 0;

  return (
    <div
      className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
        isExhausted
          ? 'bg-error-bg text-error'
          : isLow
            ? 'bg-[rgba(202,138,4,0.1)] text-status-yellow'
            : 'bg-surface text-foreground-muted'
      }`}
      title={`${status.remaining} von ${status.limit} Fragen heute übrig`}
    >
      <MessageCircle className="size-3" />
      <span>
        {status.remaining}/{status.limit}
      </span>
    </div>
  );
}
