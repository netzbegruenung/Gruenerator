import { type ConnectionErrorCode } from '../types';

/**
 * Die errorCode→Prosa-Stelle fürs Frontend, an die PERSON gerichtet: jeder
 * Text nennt, was sie als Nächstes tun kann. Die modellgerichtete Schwester
 * lebt in `apps/api/routes/chat/agents/cloudFileTools.ts`
 * (`CLOUD_ERROR_REASONS`) — zwei Maps, weil die API kein Frontend-Paket
 * importiert und die Adressaten verschieden sind.
 *
 * Zur 401-Deutung (`invalid_link`): Nextcloud prüft die Auth vor der
 * Pfadauflösung, ein abgewiesener Link ist also gelöscht, abgelaufen oder
 * passwortgeschützt. `file_drop` ist eine „Dateien ablegen"-Freigabe —
 * Upload-only, aus ihr kann der Grünerator per Design nichts lesen.
 */
export const CONNECTION_ERROR_MESSAGES: Record<ConnectionErrorCode, string> = {
  invalid_link:
    'Der Freigabe-Link funktioniert nicht (mehr) — die Freigabe wurde gelöscht, ist abgelaufen oder ist passwortgeschützt. Erstelle in der Wolke einen neuen Link ohne Passwort.',
  not_found: 'Der freigegebene Ordner wurde nicht gefunden — er existiert womöglich nicht mehr.',
  forbidden:
    'Die Freigabe ist nicht mehr aktiv. Aktiviere sie in der Wolke oder erstelle einen neuen Link.',
  file_drop:
    'Das ist eine Upload-Freigabe („Dateien ablegen") — der Grünerator kann daraus nichts lesen. Erstelle einen Freigabe-Link mit der Berechtigung „Nur anzeigen".',
  unknown: 'Die Verbindung ist fehlgeschlagen. Prüfe den Link oder versuche es später erneut.',
};

export function connectionErrorMessage(code: ConnectionErrorCode | undefined): string {
  return CONNECTION_ERROR_MESSAGES[code ?? 'unknown'] ?? CONNECTION_ERROR_MESSAGES.unknown;
}
