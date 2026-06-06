import { toast as appToast } from '@gruenerator/ui';

/**
 * Sites surfaces feedback through the host app's global toast system (sonner,
 * mounted once at the web app root). It deliberately does NOT render its own
 * toast container — keeping notifications visually consistent with the rest of
 * the app instead of a parallel sites-only system.
 */
export function useToast() {
  return {
    success: (message: string, details?: string) =>
      appToast.success(message, { description: details }),

    error: (message: string, details?: string) =>
      appToast.error(message, { description: details }),

    warning: (message: string, details?: string) =>
      appToast.warning(message, { description: details }),

    info: (message: string, details?: string) => appToast.info(message, { description: details }),

    remove: (id: string | number) => appToast.dismiss(id),

    clearAll: () => appToast.dismiss(),
  };
}
