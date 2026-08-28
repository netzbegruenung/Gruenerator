/**
 * Pfade, die in einen Anbieter hineingehen, sind wurzel-relativ — und das muss
 * geprüft werden, nicht angenommen.
 *
 * Der Grund, warum das hier steht und nicht bloß im Nextcloud-Client: seit
 * `cloud_files` kommt der Pfad aus einer MODELLANTWORT. Er ist damit indirekt
 * über Prompt-Injektion erreichbar (ein Dateiname, ein Ordnerinhalt, eine
 * angehängte Seite), während er vorher nur von Hand zu formen war.
 *
 * Was ein `..` anrichtet, ist nicht offensichtlich: `NextcloudApiClient`
 * kodiert die Segmente einzeln, aber `encodeURIComponent('..')` ist `'..'` —
 * Punkte sind nicht reserviert. Erst der HTTP-Client löst die Punkt-Segmente
 * beim Bau der URL auf, und dann liegt die Anfrage außerhalb von
 * `/public.php/webdav/`. Die vorhandene Prüfung in `downloadFile` sieht das
 * nicht: sie vergleicht `origin`, und der Host bleibt ja derselbe.
 *
 * Deshalb wird hier GEWORFEN und nicht stillschweigend zurechtgebogen. Ein
 * bereinigter Pfad läse einen anderen Ordner als den benannten und sähe dabei
 * wie ein Erfolg aus; ein Fehler geht als korrigierbare Werkzeugantwort zurück
 * in die Schleife.
 *
 * NICHT betroffen und bewusst nicht mit repariert: derselbe Weg über
 * `wolkeController.ts` (`GET /api/documents/wolke/browse`), der ohne Modell
 * auskommt und einen eigenen Vorgang bekommt.
 */

export class CloudPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CloudPathError';
  }
}

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

function decodedOnce(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * Der Pfad in seiner einzig zulässigen Form: Segmente mit `/` verbunden, ohne
 * führenden Schrägstrich, ohne `.` und ohne `..`. Ein leerer Pfad ist die
 * Wurzel und damit gültig.
 */
export function assertRootRelativePath(path: string | null | undefined): string {
  const raw = (path ?? '').trim();
  if (!raw) return '';

  // Eine absolute URL wäre keine Ortsangabe innerhalb der Freigabe mehr.
  if (SCHEME.test(raw) || raw.startsWith('//')) {
    throw new CloudPathError(`Pfad muss relativ zur Verbindung sein, nicht „${raw}".`);
  }

  // Rückwärtsschrägstriche mitzählen: sie sind auf keinem WebDAV-Server ein
  // Trennzeichen, aber ein `..\` soll auch nicht als Segmentname durchgehen.
  const segments = raw.split(/[/\\]/).filter((s) => s.length > 0 && s !== '.');

  for (const segment of segments) {
    // Die kodierte Form ist derselbe Angriff: `downloadFile` reicht einen Pfad,
    // der schon mit dem WebDAV-Präfix beginnt, unverändert weiter.
    if (segment === '..' || decodedOnce(segment) === '..') {
      throw new CloudPathError(`Pfad darf nicht aus der Freigabe herausführen: „${raw}".`);
    }
  }

  return segments.join('/');
}
