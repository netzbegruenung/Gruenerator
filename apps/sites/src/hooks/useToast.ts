import { useToastStore } from '../stores/toastStore';

export function useToast() {
  const { addToast, removeToast, clearAllToasts } = useToastStore();

  return {
    success: (message: string, details?: string) => addToast({ type: 'success', message, details }),

    error: (message: string, details?: string) =>
      addToast({ type: 'error', message, details, duration: 8000 }),

    warning: (message: string, details?: string) =>
      addToast({ type: 'warning', message, details, duration: 6000 }),

    info: (message: string, details?: string) => addToast({ type: 'info', message, details }),

    remove: removeToast,

    clearAll: clearAllToasts,
  };
}
