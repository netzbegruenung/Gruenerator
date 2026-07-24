import { type JobErrorCode } from '@gruenerator/contracts';
import { Button } from '@gruenerator/ui';
import { MdErrorOutline } from 'react-icons/md';

import { cn } from '../../utils/cn';

export interface JobErrorNoticeProps {
  /** Curated message from the backend — never raw tooling output. */
  message: string | null;
  /** Machine-readable cause; drives the "what now" hint. */
  code?: JobErrorCode | null;
  /** Backend says a retry could plausibly succeed. */
  retryable?: boolean | null;
  /** Correlates with the backend log line — worth quoting to support. */
  errorId?: string | null;
  onRetry?: (() => void) | null;
  onDismiss?: (() => void) | null;
  className?: string;
}

/**
 * What the user sees when an async job fails. Deliberately shows only the
 * curated message plus an error id: the raw cause lives in the backend log,
 * which is the only place it is useful.
 */
const HINTS: Partial<Record<JobErrorCode, string>> = {
  unsupported_media: 'Ein Export als MP4 (H.264) lässt sich am zuverlässigsten verarbeiten.',
  media_unreadable: 'Die Datei ist möglicherweise beim Hochladen abgebrochen.',
  media_missing: 'Uploads werden nach einiger Zeit automatisch gelöscht.',
  storage_full: 'Das liegt an uns, nicht an deiner Datei.',
  timed_out: 'Kürzere Videos werden deutlich schneller fertig.',
  provider_unavailable: 'Das legt sich meist von selbst wieder.',
};

export function JobErrorNotice({
  message,
  code,
  retryable,
  errorId,
  onRetry,
  onDismiss,
  className,
}: JobErrorNoticeProps): React.ReactElement | null {
  if (!message) return null;

  const hint = code ? HINTS[code] : null;
  const showRetry = Boolean(onRetry) && retryable !== false;

  return (
    <div
      className={cn(
        'flex flex-col gap-sm rounded-lg border border-red-600 bg-red-50 p-md text-red-700 dark:bg-grey-800 dark:text-red-400',
        className
      )}
      role="alert"
    >
      <div className="flex items-start gap-sm">
        <MdErrorOutline className="mt-0.5 size-5 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm">{message}</p>
          {hint && <p className="mt-xs text-xs opacity-80">{hint}</p>}
        </div>
      </div>

      {(showRetry || onDismiss || errorId) && (
        <div className="flex flex-wrap items-center justify-between gap-sm">
          {errorId ? (
            <span className="font-mono text-xs opacity-70">Fehler-ID: {errorId}</span>
          ) : (
            <span />
          )}
          <div className="flex shrink-0 gap-xs">
            {showRetry && onRetry && (
              <Button size="sm" onClick={onRetry}>
                Erneut versuchen
              </Button>
            )}
            {onDismiss && (
              <Button variant="outline" size="sm" onClick={onDismiss}>
                Schließen
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default JobErrorNotice;
