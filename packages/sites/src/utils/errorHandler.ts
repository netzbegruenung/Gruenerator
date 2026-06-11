import axios from 'axios';

import { type useToast } from '../hooks/useToast';

/** Error thrown by the typed contracts-client calls in useSite. */
export class SitesApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'SitesApiError';
    this.status = status;
  }
}

function toastForStatus(
  toast: ReturnType<typeof useToast>,
  status: number | undefined,
  message: string,
  details?: string
): void {
  switch (status) {
    case 400:
      toast.error('Eingabefehler', message);
      return;

    case 401:
      return;

    case 403:
      toast.error('Keine Berechtigung', 'Du hast keine Rechte für diese Aktion');
      return;

    case 404:
      toast.error('Nicht gefunden', message);
      return;

    case 429:
      toast.error('Zu viele Anfragen', 'Bitte warte kurz und versuche es erneut');
      return;

    case 500:
      toast.error(
        'Serverfehler',
        details || 'Ein interner Fehler ist aufgetreten. Bitte versuche es später erneut.'
      );
      return;

    case 503:
      toast.error('Dienst nicht verfügbar', 'Der Server ist vorübergehend nicht erreichbar');
      return;

    case undefined:
    default:
      toast.error('Fehler', message);
      return;
  }
}

export function handleApiError(error: unknown, toast: ReturnType<typeof useToast>): void {
  if (error instanceof SitesApiError) {
    toastForStatus(toast, error.status, error.message);
    return;
  }

  if (axios.isAxiosError<{ error?: string; details?: string }>(error)) {
    toastForStatus(
      toast,
      error.response?.status,
      error.response?.data?.error || error.message,
      error.response?.data?.details
    );
    return;
  }

  if (error instanceof Error) {
    if (error.message.includes('timeout')) {
      toast.error(
        'Zeitüberschreitung',
        'Die Anfrage hat zu lange gedauert. Bitte versuche es erneut.'
      );
      return;
    }

    if (error.message.includes('Network Error')) {
      toast.error('Netzwerkfehler', 'Bitte prüfe deine Internetverbindung');
      return;
    }

    toast.error('Fehler', error.message);
    return;
  }

  toast.error('Unbekannter Fehler', 'Ein unerwarteter Fehler ist aufgetreten');
}
