import type { VoxtralErrorReason } from '@gruenerator/voice';

const MESSAGES: Record<VoxtralErrorReason, string> = {
  'mic-permission-denied':
    'Mikrofon-Zugriff wurde verweigert. Bitte erlaube den Zugriff in den Browsereinstellungen.',
  'mic-unavailable': 'Es konnte kein Mikrofon gefunden werden.',
  'audio-context-failed': 'Der Audio-Kontext konnte nicht gestartet werden.',
  'worklet-failed': 'Die Audio-Verarbeitung konnte nicht initialisiert werden.',
  'websocket-failed': 'Verbindung zum Diktat-Server fehlgeschlagen.',
  'session-handshake-failed': 'Diktat-Session konnte nicht gestartet werden.',
  'server-error': 'Der Diktat-Server hat einen Fehler gemeldet.',
  unknown: 'Diktat konnte nicht gestartet werden.',
};

export function handleDictationError(reason: VoxtralErrorReason, error: unknown): void {
  const message = MESSAGES[reason] ?? MESSAGES.unknown;
  console.warn('[Dictation]', reason, error);
  void import('sonner')
    .then(({ toast }) => {
      toast.error('Diktat', { description: message });
    })
    .catch(() => {
      // sonner not installed in host app — fall back to console only
    });
}
