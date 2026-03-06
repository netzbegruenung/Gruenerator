import { MessageCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface RateLimitStatus {
  remaining: number | null;
  limit: number | null;
  used: number;
}

async function fetchRateLimitStatus(): Promise<RateLimitStatus | null> {
  try {
    const res = await fetch('/api/gruen-o-mat/status');
    if (res.ok) return (await res.json()) as RateLimitStatus;
  } catch {
    // silently ignore — badge just won't show
  }
  return null;
}

export function RateLimitBadge() {
  const [status, setStatus] = useState<RateLimitStatus | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    const refresh = () => {
      void fetchRateLimitStatus().then((result) => {
        if (mountedRef.current) setStatus(result);
      });
    };

    refresh();

    // Re-fetch every 30s
    const interval = setInterval(refresh, 30_000);

    // Also re-fetch when the user sends a message (DOM mutation on thread)
    const observer = new MutationObserver(() => {
      // Small delay so the backend has time to increment
      setTimeout(refresh, 2000);
    });
    const viewport = document.querySelector('[data-thread-viewport]');
    if (viewport) {
      observer.observe(viewport, { childList: true, subtree: true });
    }

    return () => {
      mountedRef.current = false;
      clearInterval(interval);
      observer.disconnect();
    };
  }, []);

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
