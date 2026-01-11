import { useToastStore, type Toast as ToastType } from '../../stores/toastStore';
import '../../styles/components/toast.css';

function ToastIcon({ type }: { type: ToastType['type'] }) {
  switch (type) {
    case 'success':
      return <span className="toast-icon">✓</span>;
    case 'error':
      return <span className="toast-icon">✕</span>;
    case 'warning':
      return <span className="toast-icon">⚠</span>;
    case 'info':
      return <span className="toast-icon">ℹ</span>;
  }
}

function Toast({ toast }: { toast: ToastType }) {
  const { removeToast } = useToastStore();

  return (
    <div
      className={`toast toast-${toast.type}`}
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
    >
      <div className="toast-content">
        <ToastIcon type={toast.type} />
        <div className="toast-text">
          <div className="toast-message">{toast.message}</div>
          {toast.details && (
            <div className="toast-details">{toast.details}</div>
          )}
        </div>
      </div>
      <button
        className="toast-close"
        onClick={() => removeToast(toast.id)}
        aria-label="Schließen"
      >
        ×
      </button>
    </div>
  );
}

export function ToastContainer() {
  const { toasts } = useToastStore();

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="toast-container" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
