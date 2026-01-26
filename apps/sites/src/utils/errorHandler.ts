import axios from 'axios';

import { type useToast } from '../hooks/useToast';

export function handleApiError(error: unknown, toast: ReturnType<typeof useToast>): void {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const message = error.response?.data?.error || error.message;

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
          'Ein interner Fehler ist aufgetreten. Bitte versuche es später erneut.'
        );
        return;

      case 503:
        toast.error('Dienst nicht verfügbar', 'Der Server ist vorübergehend nicht erreichbar');
        return;

      default:
        toast.error('Fehler', message);
        return;
    }
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
