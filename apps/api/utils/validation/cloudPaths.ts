/**
 * Pfade, die in eine Dateiablage hineingehen, dürfen sie nicht verlassen — und
 * das muss geprüft werden, nicht angenommen.
 *
 * Was ein `..` anrichtet, ist nicht offensichtlich: `NextcloudApiClient`
 * kodiert die Segmente einzeln, aber `encodeURIComponent('..')` ist `'..'` —
 * Punkte sind nicht reserviert. Erst der HTTP-Client löst die Punkt-Segmente
 * beim Bau der URL auf, und dann liegt die Anfrage außerhalb von
 * `/public.php/webdav/`. Die vorhandene SSRF-Prüfung in `downloadFile` sieht
 * das nicht: sie vergleicht `origin`, und der Host bleibt ja derselbe. Sie
 * schützt gegen einen anderen HOST, nicht gegen einen anderen PFAD.
 *
 * Deshalb wird hier GEWORFEN und nicht stillschweigend zurechtgebogen. Ein
 * bereinigter Pfad läse einen anderen Ordner als den benannten und sähe dabei
 * wie ein Erfolg aus.
 *
 * Warum die Prüfung neben `urlSecurity.ts` steht und nicht im Anbieter: sie
 * gehört an die Naht zum Netz, und dort gibt es NEUN Aufrufer mit vier
 * verschiedenen Pfadquellen — `?path=` aus einer Query, `filePath` aus einem
 * Request-Body, ein `path` aus einem `@wolke`-Erwähnungstoken und seit
 * `cloud_files` einer aus einer Modellantwort. Ein Wächter je Aufrufer wäre
 * acht Gelegenheiten, ihn zu vergessen; #3043 entstand genau so.
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
 * Wirft, wenn der Pfad die Ablage verlässt. Verändert ihn NICHT.
 *
 * Das ist die Form für die Transportschicht: dort trägt ein Pfad je nach
 * Aufrufer den WebDAV-Präfix, ist prozent-kodiert oder beides, und jede
 * Zurechtformung hier würde entweder doppelt kodieren oder den rohen Zweig von
 * `downloadFile` umleiten. Geprüft wird also nur — und zwar VOR dem Aufbau der
 * URL, damit im Fehlerfall gar keine Anfrage hinausgeht.
 */
export function assertNoPathEscape(path: string | null | undefined): void {
  const raw = (path ?? '').trim();
  if (!raw) return;

  // Eine absolute URL wäre keine Ortsangabe innerhalb der Ablage mehr.
  if (SCHEME.test(raw) || raw.startsWith('//')) {
    throw new CloudPathError(`Pfad muss relativ zur Verbindung sein, nicht „${raw}".`);
  }

  // Rückwärtsschrägstriche mitzählen: sie sind auf keinem WebDAV-Server ein
  // Trennzeichen, aber ein `..\` soll auch nicht als Segmentname durchgehen.
  for (const segment of raw.split(/[/\\]/)) {
    // Die kodierte Form ist derselbe Angriff: `downloadFile` reicht einen Pfad,
    // der schon mit dem WebDAV-Präfix beginnt, unverändert weiter — dort
    // überlebt ein `%2e%2e` bis auf die Leitung.
    if (segment === '..' || decodedOnce(segment) === '..') {
      throw new CloudPathError(`Pfad darf nicht aus der Freigabe herausführen: „${raw}".`);
    }
  }
}

/**
 * Der Pfad in seiner einzig zulässigen Form: Segmente mit `/` verbunden, ohne
 * führenden Schrägstrich, ohne `.` und ohne `..`. Ein leerer Pfad ist die
 * Wurzel und damit gültig.
 *
 * Für die Anbieterschicht, die einen normierten Pfad weiterreicht. Die
 * Transportschicht nimmt `assertNoPathEscape` — siehe dort, warum.
 */
export function assertRootRelativePath(path: string | null | undefined): string {
  assertNoPathEscape(path);
  return (path ?? '')
    .trim()
    .split(/[/\\]/)
    .filter((s) => s.length > 0 && s !== '.')
    .join('/');
}
