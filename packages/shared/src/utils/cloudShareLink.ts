/**
 * Die eine Zerlegung eines Nextcloud-Freigabe-Links.
 *
 * Es gab sie dreimal mit derselben Regex: `NextcloudShareManager.validateShareLink`
 * (englische Fehlertexte), `packages/wolke/src/lib/validation.ts` (deutsche) und
 * `NextcloudApiClient.parseShareLink` (ohne Fehlertext). Die Regex ist der Teil,
 * der stimmen muss; die Meldung gehört zur Oberfläche und bleibt bei den
 * Aufrufern.
 *
 * Bewusst HOST-AGNOSTISCH: `wolke.netzbegruenung.de` ist die eine Instanz, die
 * wir dokumentieren, nicht die einzige, die funktioniert — ein Teamtools- oder
 * LV-eigenes Nextcloud trägt dieselbe `/s/<token>`-Form. Wer den Zugriff
 * einschränken will, tut das an EINER Stelle (`allowedHosts` im API-Client) und
 * nicht in drei UI-Texten.
 */

export interface ParsedCloudShareLink {
  /** `https://host` ohne Pfad — die Basis für die WebDAV-URL. */
  baseUrl: string;
  /** Der öffentliche Freigabe-Token; zugleich der WebDAV-Basic-Auth-Benutzername. */
  shareToken: string;
  /** Pfad + Query des Originallinks, für Aufrufer, die ihn weiterreichen. */
  fullPath: string;
}

/**
 * Nur `/s/<token>` im Pfad — der Token ist alphanumerisch, wie Nextcloud ihn
 * vergibt. Kein Anker am Anfang, weil manche Instanzen unter einem Unterpfad
 * laufen (`https://host/nextcloud/s/<token>`).
 */
const SHARE_PATH_RE = /\/s\/([A-Za-z0-9]+)/;

export function parseCloudShareLink(link: string): ParsedCloudShareLink | null {
  if (!link || typeof link !== 'string') return null;
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  const match = SHARE_PATH_RE.exec(url.pathname);
  if (!match?.[1]) return null;
  return {
    baseUrl: `${url.protocol}//${url.host}`,
    shareToken: match[1],
    fullPath: url.pathname + url.search,
  };
}

/** Warum ein Link nicht taugt — die Aufrufer übersetzen das in ihre Sprache. */
export type CloudShareLinkProblem = 'empty' | 'not_a_url' | 'no_share_token';

export type CloudShareLinkCheck =
  { ok: true; parsed: ParsedCloudShareLink } | { ok: false; problem: CloudShareLinkProblem };

export function checkCloudShareLink(link: string): CloudShareLinkCheck {
  if (!link || typeof link !== 'string' || !link.trim()) {
    return { ok: false, problem: 'empty' };
  }
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return { ok: false, problem: 'not_a_url' };
  }
  const parsed = parseCloudShareLink(url.toString());
  if (!parsed) return { ok: false, problem: 'no_share_token' };
  return { ok: true, parsed };
}

/**
 * Trägt dieser Text einen Freigabe-Link? Der Detektor, der eine getippte
 * Wolke-URL von einer normalen Webseite trennt — siehe die `scrape_url`-Weiche
 * im Klassifikator.
 */
export function isCloudShareUrl(value: string): boolean {
  return parseCloudShareLink(value) !== null;
}

/**
 * Ist dieser Wert ein Freigabe-Link, wo ein DATEIPFAD stehen sollte? Trifft
 * die volle URL genauso wie den nackten URL-Pfad (`s/<token>`), den ein
 * Modell aus einem geposteten Link herausschneidet — genau so lief `read`
 * mit `path: 's/4oKeBG2t…'` gegen die falsche gespeicherte Verbindung.
 */
export function looksLikeCloudSharePath(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  return isCloudShareUrl(v) || /^\/?(?:index\.php\/)?s\/[A-Za-z0-9]+\/?$/.test(v);
}
