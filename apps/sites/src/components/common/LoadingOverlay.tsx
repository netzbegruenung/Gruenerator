import '../../styles/components/loading.css';

interface LoadingOverlayProps {
  isLoading: boolean;
  message: string;
  progress?: number;
  submessage?: string;
}

export function LoadingOverlay({
  isLoading,
  message,
  progress,
  submessage,
}: LoadingOverlayProps) {
  if (!isLoading) return null;

  return (
    <div className="loading-overlay" role="dialog" aria-modal="true" aria-live="polite">
      <div className="loading-card">
        <div className="loading-spinner" />
        <p className="loading-message">{message}</p>
        {submessage && <p className="loading-submessage">{submessage}</p>}
        {progress !== undefined && progress > 0 && (
          <div className="loading-progress">
            <div
              className="loading-progress-bar"
              style={{ width: `${progress}%` }}
            />
            <span className="loading-progress-text">{progress}%</span>
          </div>
        )}
      </div>
    </div>
  );
}
