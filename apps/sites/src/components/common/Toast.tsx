import { useToastStore, type Toast as ToastType } from '../../stores/toastStore';

import { cn } from '@/utils/cn';

const iconStyles: Record<ToastType['type'], string> = {
  success: 'bg-[#46962b] text-white',
  error: 'bg-[#dc3545] text-white',
  warning: 'bg-[#ffc107] text-[#856404]',
  info: 'bg-[#00b5e5] text-white',
};

const borderStyles: Record<ToastType['type'], string> = {
  success: 'border-l-[#46962b]',
  error: 'border-l-[#dc3545]',
  warning: 'border-l-[#ffc107]',
  info: 'border-l-[#00b5e5]',
};

const iconChars: Record<ToastType['type'], string> = {
  success: '\u2713',
  error: '\u2715',
  warning: '\u26A0',
  info: '\u2139',
};

function ToastIcon({ type }: { type: ToastType['type'] }) {
  return (
    <span
      className={cn(
        'flex items-center justify-center w-6 h-6 rounded-full font-bold text-sm shrink-0',
        iconStyles[type]
      )}
    >
      {iconChars[type]}
    </span>
  );
}

function Toast({ toast }: { toast: ToastType }) {
  const { removeToast } = useToastStore();

  return (
    <div
      className={cn(
        'pointer-events-auto flex items-start gap-3 p-4 bg-white rounded-lg shadow-[0_4px_12px_rgba(0,0,0,0.15)] animate-[toast-slide-in_0.3s_ease-out] border-l-4',
        borderStyles[toast.type]
      )}
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
    >
      <div className="flex items-start gap-3 flex-1">
        <ToastIcon type={toast.type} />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-grey-800 mb-1 break-words">{toast.message}</div>
          {toast.details && (
            <div className="text-sm text-grey-600 break-words">{toast.details}</div>
          )}
        </div>
      </div>
      <button
        className="bg-transparent border-none text-2xl leading-none text-grey-600 cursor-pointer p-0 w-6 h-6 flex items-center justify-center shrink-0 transition-colors hover:text-grey-800"
        onClick={() => removeToast(toast.id)}
        aria-label="Schließen"
      >
        &times;
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
    <div
      className="fixed top-4 right-4 z-[10000] flex flex-col gap-3 pointer-events-none max-w-[400px] max-sm:top-2 max-sm:right-2 max-sm:left-2 max-sm:max-w-none"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
