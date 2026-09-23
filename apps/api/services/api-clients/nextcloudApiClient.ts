import { parseCloudShareLink } from '@gruenerator/shared/utils';
import axios, { type AxiosInstance, type AxiosError } from 'axios';

import { toUserFacingMessage } from '../../utils/errors/index.js';
import { assertNoPathEscape } from '../../utils/validation/cloudPaths.js';
import { validateUrlSync, validateUrlForFetch } from '../../utils/validation/urlSecurity.js';

// Type Definitions
export interface ParsedShareLink {
  baseUrl: string;
  shareToken: string;
  fullPath: string;
}

/**
 * Der WebDAV-Etag kommt aus dem Regex-Parser HTML-entity-escapt heraus
 * (`&quot;…&quot;`), weil der Anführungszeichen-Strip nur echte Zeichen kennt.
 * Normalisiert wurde das bisher NUR im Scraper-Pfad (`wolkeShareHandler`) — der
 * Sync-Pfad speicherte den escapten Wert, und `WolkeSyncService.hasFileChanged`
 * verglich ihn danach gegen einen sauberen. Die Normalisierung gehört an die
 * Quelle, damit jeder Verbraucher denselben Wert sieht.
 */
export function normalizeWebdavEtag(etag: string | null | undefined): string | null {
  if (!etag) return null;
  const cleaned = etag
    .replace(/&quot;/g, '')
    .replace(/^["']|["']$/g, '')
    .trim();
  return cleaned || null;
}

export type ConnectionErrorCode =
  'invalid_link' | 'not_found' | 'forbidden' | 'file_drop' | 'unknown';

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  errorCode?: ConnectionErrorCode;
}

export interface NextcloudFile {
  href: string;
  name: string;
  size: number | null;
  lastModified: Date | null;
  etag: string | null;
  isDirectory?: boolean;
}

export interface ShareInfo {
  success: boolean;
  files?: NextcloudFile[];
  totalFiles?: number;
  message?: string;
}

export interface DownloadFileResult {
  buffer: Buffer;
  mimeType: string | null;
  size: number;
}

/**
 * A PROPFIND on a folder returns that folder itself as an entry. The parser
 * only ever dropped the share root's self-entry, so listing a subfolder
 * reported the subfolder as its own child: the count of subfolders was one too
 * high, and the folder browser offered a phantom child whose selected path
 * (`Stadtrat/Stadtrat`) does not exist.
 *
 * Hrefs are percent-encoded and end in a slash for collections; the requested
 * path may be either. Compare decoded and unslashed.
 */
export function isWebdavSelfEntry(href: string, requestPath: string): boolean {
  const normalize = (value: string): string => {
    let decoded = value;
    try {
      decoded = decodeURIComponent(value);
    } catch {
      // A malformed escape sequence must not drop a real entry.
    }
    // Split-and-drop trims both ends without an anchored `/+$/` and its ReDoS.
    return decoded.split('/').filter(Boolean).join('/');
  };
  return normalize(href) === normalize(requestPath);
}

/**
 * Die Antwort war kein verstandenes WebDAV-Dokument.
 *
 * Der Unterschied, um den es geht: „der Ordner ist leer" und „ich habe die
 * Antwort nicht gelesen" sahen bis #3038 identisch aus — beides eine leere
 * Liste. Ein Server, dessen Namensraum-Präfix wir nicht kannten, lieferte
 * dadurch stumm null Dateien: leerer Datei-Browser, leerer Notebook-Import,
 * und im Chat die freundliche Auskunft, in dem Ordner liege nichts.
 */
export class WebdavParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebdavParseError';
  }
}

/**
 * Ein HTTP-Fehler der Nextcloud-Instanz, mit überlebendem Statuscode.
 *
 * Der Response-Interceptor normalisierte jeden axios-Fehler zu einem plain
 * `Error` — die `err.response?.status`-Zweige in den Catches darunter waren
 * damit tote Zweige, und jeder 401/404/405 kam beim Aufrufer als nacktes
 * „Request failed" an. Diese Klasse trägt den Status durch alle Re-Wraps.
 */
export class NextcloudHttpError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly statusText?: string
  ) {
    super(message);
    this.name = 'NextcloudHttpError';
  }
}

/** Der Status eines Fehlers, sofern er einer unserer HTTP-Fehler ist. */
export function statusOf(err: unknown): number | undefined {
  return err instanceof NextcloudHttpError ? err.status : undefined;
}

/**
 * Live gemessene Semantik von `public.php/webdav`: die Auth wird VOR der
 * Pfadauflösung geprüft — 401 heißt also immer „Token abgewiesen" (Freigabe
 * gelöscht, abgelaufen oder passwortgeschützt; wir senden Token + leeres
 * Passwort), nie „Pfad falsch". 405 auf einem Lese-Verb ist eine
 * File-Drop-Freigabe („Dateien ablegen" — sabre/dav erlaubt dort nur
 * Schreib-Verben, gemessen am lebenden Endpunkt). 404 ist ein gültiges Token
 * mit fehlendem Pfad.
 */
export function classifyWebdavStatus(status: number | undefined): ConnectionErrorCode {
  if (status === 401) return 'invalid_link';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 405) return 'file_drop';
  return 'unknown';
}

/**
 * In XML ist das Namensraum-PRÄFIX beliebig. `DAV:` darf an `d:`, `D:`, `dav:`
 * gebunden sein oder als Standard-Namensraum ganz ohne Präfix stehen — vier
 * Schreibweisen desselben Dokuments. Nextclouds sabre/dav schickt heute `d:`,
 * weshalb der auf `d:` festgenagelte Parser bisher trug.
 *
 * `(?![\w.-])` ist nicht Zierde: ohne die Grenze fängt `response` auch
 * `responsedescription`, und der träge Bereich bis zum nächsten
 * `</…:response>` verschlänge dann den halben Rest des Dokuments.
 */
function webdavTag(name: string, flags: string): RegExp {
  return new RegExp(
    `<(?:[A-Za-z][\\w.-]*:)?${name}(?![\\w.-])[^>]*>(.*?)</(?:[A-Za-z][\\w.-]*:)?${name}>`,
    flags
  );
}

const RESPONSE_RE = webdavTag('response', 'gs');
const HREF_RE = webdavTag('href', 's');
const DISPLAYNAME_RE = webdavTag('displayname', 's');
const CONTENT_LENGTH_RE = webdavTag('getcontentlength', 's');
const LAST_MODIFIED_RE = webdavTag('getlastmodified', 's');
const ETAG_RE = webdavTag('getetag', 's');
const COLLECTION_RE = /<(?:[A-Za-z][\w.-]*:)?collection(?![\w.-])\s*\/?>/;
const MULTISTATUS_RE = /<(?:[A-Za-z][\w.-]*:)?multistatus(?![\w.-])/;

/**
 * PROPFIND-Antwort → Dateiliste. Regex statt XML-Parser, bewusst: die Antwort
 * ist flach, und ein echter Parser zöge drei Aufrufer hinter sich her
 * (`isWebdavSelfEntry`, `normalizeWebdavEtag`, die Form von `NextcloudFile`).
 *
 * Wirft, wenn das Dokument keine `multistatus`-Hülle trägt — siehe
 * `WebdavParseError`. Innerhalb einer erkannten Hülle bleibt es tolerant:
 * ein kaputter einzelner Eintrag kostet diesen Eintrag, nicht die Liste.
 */
export function parseWebDAVResponse(xmlData: string, requestPath?: string): NextcloudFile[] {
  const responseMatches = xmlData.match(RESPONSE_RE);

  if (!responseMatches) {
    // Keine Einträge UND keine Hülle: das war kein Multistatus, sondern eine
    // Fehlerseite, ein leerer Body oder ein Format, das wir nicht kennen.
    if (!MULTISTATUS_RE.test(xmlData)) {
      throw new WebdavParseError(
        'WebDAV-Antwort nicht lesbar: kein <multistatus>-Element gefunden.'
      );
    }
    return [];
  }

  const files: NextcloudFile[] = [];

  for (const responseXml of responseMatches) {
    try {
      const hrefMatch = responseXml.match(HREF_RE);
      if (!hrefMatch?.[1]) continue;

      const href = hrefMatch[1].trim();

      // Skip the listed folder itself — the share root always, any other
      // requested folder once we know which one was asked for.
      if (href.endsWith('/webdav/') || href.endsWith('/webdav')) continue;
      if (requestPath && isWebdavSelfEntry(href, requestPath)) continue;

      const displayNameMatch = responseXml.match(DISPLAYNAME_RE);
      const contentLengthMatch = responseXml.match(CONTENT_LENGTH_RE);
      const lastModifiedMatch = responseXml.match(LAST_MODIFIED_RE);
      const etagMatch = responseXml.match(ETAG_RE);

      // For directories, extract name from href (trailing slash)
      let name = displayNameMatch ? displayNameMatch[1].trim() : '';
      if (!name) {
        const segments = href.replace(/\/$/, '').split('/');
        name = decodeURIComponent(segments.pop() || '');
      }

      files.push({
        href,
        name,
        size: contentLengthMatch ? parseInt(contentLengthMatch[1]) : null,
        lastModified: lastModifiedMatch ? new Date(lastModifiedMatch[1]) : null,
        etag: normalizeWebdavEtag(etagMatch?.[1]),
        isDirectory: COLLECTION_RE.test(responseXml),
      });
    } catch (error) {
      const err = error as Error;
      console.error('[NextcloudApiClient] Skipping unreadable WebDAV entry', {
        error: err.message,
      });
    }
  }

  return files;
}

/**
 * Read-only WebDAV client for public Nextcloud shares. Deliberately issues
 * only PROPFIND and GET — WebDAV write verbs must not be reintroduced; the
 * guard test in nextcloudApiClient.vitest.ts enforces this.
 */
class NextcloudApiClient {
  private shareLink: string;
  private parsedLink: ParsedShareLink | null;
  private baseURL: string;
  private shareToken: string;
  private webdavUrl: string;
  private axiosInstance: AxiosInstance;

  constructor(shareLink: string) {
    this.shareLink = shareLink;
    this.parsedLink = this.parseShareLink(shareLink);

    if (!this.parsedLink) {
      throw new Error('Invalid Nextcloud share link format');
    }

    this.baseURL = this.parsedLink.baseUrl;
    this.shareToken = this.parsedLink.shareToken;
    this.webdavUrl = `${this.baseURL}/public.php/webdav`;

    const urlCheck = validateUrlSync(this.baseURL, { allowedProtocols: ['https:'] });
    if (!urlCheck.isValid) {
      throw new Error(`Invalid Nextcloud share URL: ${urlCheck.error}`);
    }

    // Create axios instance with basic authentication using share token
    this.axiosInstance = axios.create({
      timeout: 30000, // 30 seconds timeout
      headers: {
        'User-Agent': 'Gruenerator/1.0',
        'Content-Type': 'application/octet-stream',
      },
    });

    // Set authentication exactly as cloudsend.sh does:
    // Username = shareToken, Password = empty (for non-password protected shares)
    this.axiosInstance.defaults.headers['X-Requested-With'] = 'XMLHttpRequest';
    this.axiosInstance.defaults.auth = {
      username: this.shareToken,
      password: '',
    };

    // Add response interceptor for error handling
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        console.error('[NextcloudApiClient] Nextcloud API error:', error.message, {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          url: error.config?.url,
        });
        return Promise.reject(this.normalizeError(error));
      }
    );

    console.log('[NextcloudApiClient] NextcloudApiClient initialized', {
      baseUrl: this.baseURL,
      shareToken: this.shareToken.substring(0, 8) + '...',
    });
  }

  /**
   * Async factory that adds DNS-aware SSRF validation on top of the sync check.
   * All call sites should use `await NextcloudApiClient.create(link)` instead of `new`.
   */
  static async create(shareLink: string): Promise<NextcloudApiClient> {
    const client = new NextcloudApiClient(shareLink);
    const urlCheck = await validateUrlForFetch(client.baseURL, {
      allowedProtocols: ['https:'],
    });
    if (!urlCheck.isValid) {
      throw new Error(`Nextcloud URL failed SSRF validation: ${urlCheck.error}`);
    }
    return client;
  }

  /**
   * Parse Nextcloud share link to extract components
   */
  private parseShareLink(shareLink: string): ParsedShareLink | null {
    return parseCloudShareLink(shareLink);
  }

  /**
   * Test connection to the Nextcloud share. Read-only by design: a PROPFIND
   * proves the link is valid and accessible — no write probe.
   */
  async testConnection(): Promise<ConnectionTestResult> {
    try {
      console.log('[NextcloudApiClient] Testing Nextcloud connection');

      const response = await this.axiosInstance.request({
        method: 'PROPFIND',
        url: this.webdavUrl,
        headers: {
          Depth: '0',
          'Content-Type': 'application/xml',
        },
        data: `<?xml version="1.0" encoding="utf-8" ?>
               <propfind xmlns="DAV:">
                   <prop>
                       <resourcetype/>
                       <getcontentlength/>
                       <getlastmodified/>
                       <getetag/>
                   </prop>
               </propfind>`,
      });

      if (response.status !== 207 && response.status !== 200) {
        return {
          success: false,
          message: `Unexpected response: ${response.status}`,
          errorCode: 'unknown',
        };
      }

      console.log('[NextcloudApiClient] Connection test successful (read)');
      return {
        success: true,
        message: 'Connection successful',
      };
    } catch (error) {
      const err = error as Error;
      console.error('[NextcloudApiClient] Connection test failed', {
        error: err.message,
        status: statusOf(err),
      });

      // Der Interceptor hat den axios-Fehler bereits zu `NextcloudHttpError`
      // normalisiert — `err.response` gibt es hier nicht mehr.
      const errorCode = classifyWebdavStatus(statusOf(err));
      const messages: Record<Exclude<ConnectionErrorCode, 'unknown'>, string> = {
        invalid_link: 'Authentication failed - share deleted, expired, or password-protected',
        forbidden: 'Access forbidden - share may not be active',
        not_found: 'Share not found - check the share link',
        file_drop: 'Read access denied - this is a file-drop (upload only) share',
      };

      if (errorCode !== 'unknown') {
        return { success: false, message: messages[errorCode], errorCode };
      }

      return {
        success: false,
        message: toUserFacingMessage(err) || 'Connection test failed',
        errorCode: 'unknown',
      };
    }
  }

  /**
   * List files and folders at a given path within the share
   */
  async listFolder(folderPath?: string): Promise<NextcloudFile[]> {
    // VOR dem try: der Wächter soll den Pfad abweisen, bevor eine URL gebaut
    // wird — und `CloudPathError` soll den Aufrufer als solcher erreichen. Im
    // catch unten würde er zu einem nackten „Failed to list folder".
    assertNoPathEscape(folderPath);

    try {
      let propfindUrl = this.webdavUrl;
      if (folderPath) {
        const encodedPath = folderPath
          .split('/')
          .filter(Boolean)
          .map((segment) => encodeURIComponent(segment))
          .join('/');
        propfindUrl = `${this.webdavUrl}/${encodedPath}`;
      }

      console.log('[NextcloudApiClient] Listing folder', { folderPath, propfindUrl });

      const response = await this.axiosInstance.request<string>({
        method: 'PROPFIND',
        url: propfindUrl,
        headers: {
          Depth: '1',
          'Content-Type': 'application/xml',
        },
        data: `<?xml version="1.0" encoding="utf-8" ?>
               <propfind xmlns="DAV:">
                   <prop>
                       <resourcetype/>
                       <getcontentlength/>
                       <getlastmodified/>
                       <displayname/>
                       <getetag/>
                   </prop>
               </propfind>`,
      });

      if (response.status === 207) {
        return parseWebDAVResponse(response.data, new URL(propfindUrl).pathname);
      }

      return [];
    } catch (error) {
      const err = error as Error;
      console.error('[NextcloudApiClient] Failed to list folder', {
        folderPath,
        error: err.message,
      });
      // Unverpackt weiterreichen: „ich habe die Antwort nicht gelesen" ist
      // eine andere Auskunft als „das Auflisten ist fehlgeschlagen", und der
      // ganze Sinn von #3038 ist, dass ein Aufrufer sie unterscheiden kann.
      // `NextcloudHttpError` ebenso: der Status ist die Grundlage, auf der
      // `cloud_files` dem Modell sagt, WARUM die Wolke nicht antwortet.
      if (err instanceof WebdavParseError || err instanceof NextcloudHttpError) throw err;
      throw new Error(err.message || 'Failed to list folder');
    }
  }

  /**
   * Get information about the share
   */
  async getShareInfo(): Promise<ShareInfo> {
    try {
      console.log('[NextcloudApiClient] Getting share information');

      const response = await this.axiosInstance.request<string>({
        method: 'PROPFIND',
        url: this.webdavUrl,
        headers: {
          Depth: '1',
          'Content-Type': 'application/xml',
        },
        data: `<?xml version="1.0" encoding="utf-8" ?>
               <propfind xmlns="DAV:">
                   <prop>
                       <resourcetype/>
                       <getcontentlength/>
                       <getlastmodified/>
                       <displayname/>
                       <getetag/>
                   </prop>
               </propfind>`,
      });

      if (response.status === 207) {
        // Parse WebDAV XML response (simplified)
        const files = parseWebDAVResponse(response.data);

        return {
          success: true,
          files: files,
          totalFiles: files.length,
        };
      }

      return {
        success: false,
        message: 'Failed to get share information',
      };
    } catch (error) {
      const err = error as Error;
      console.error('[NextcloudApiClient] Failed to get share info', { error: err.message });
      if (err instanceof NextcloudHttpError) throw err;
      throw new Error(err.message || 'Failed to get share information');
    }
  }

  /**
   * Download file content from Nextcloud share
   * @param filePath - File path from WebDAV response (e.g., "/public.php/webdav/filename.pdf")
   * @returns File content as buffer
   */
  async downloadFile(filePath: string): Promise<DownloadFileResult> {
    // Siehe `listFolder`. Hier wiegt es schwerer: der Zweig unten reicht einen
    // Pfad, der schon mit dem WebDAV-Präfix beginnt, ROH weiter — dort
    // überlebt auch die prozent-kodierte Form (`%2e%2e`) bis auf die Leitung.
    assertNoPathEscape(filePath);

    try {
      console.log(`[NextcloudApiClient] Downloading file: ${filePath}`);

      // Construct the full WebDAV URL for the file
      // filePath already contains the WebDAV path structure from the share info
      let fileUrl = `${this.baseURL}${filePath}`;

      // If the path doesn't start with WebDAV, prepend it
      if (!filePath.startsWith('/public.php/webdav/')) {
        // Handle relative paths - encode each segment properly
        const encodedPath = filePath
          .split('/')
          .map((segment) => encodeURIComponent(segment))
          .join('/');
        fileUrl = `${this.webdavUrl}/${encodedPath}`;
      }

      const parsedFileUrl = new URL(fileUrl);
      const parsedBaseUrl = new URL(this.baseURL);
      if (parsedFileUrl.origin !== parsedBaseUrl.origin) {
        throw new Error('Download URL origin mismatch — possible SSRF attempt');
      }

      console.log(`[NextcloudApiClient] Downloading from URL: ${fileUrl}`);

      const response = await this.axiosInstance.get<ArrayBuffer>(fileUrl, {
        responseType: 'arraybuffer',
        headers: {
          Accept: '*/*',
        },
      });

      if (response.status === 200) {
        const buffer = Buffer.from(response.data);
        console.log(
          `[NextcloudApiClient] Successfully downloaded file: ${filePath} (${buffer.length} bytes)`
        );

        return {
          buffer: buffer,
          mimeType: (response.headers['content-type'] as string) || null,
          size: response.headers['content-length']
            ? parseInt(response.headers['content-length'] as string)
            : buffer.length,
        };
      } else {
        throw new Error(`Download failed with status: ${response.status}`);
      }
    } catch (error) {
      const err = error as Error;
      const status = statusOf(err);
      console.error(`[NextcloudApiClient] File download failed:`, {
        filePath,
        error: err.message,
        status,
      });

      const messages: Partial<Record<number, string>> = {
        401: 'Authentication failed - cannot download file',
        403: 'Access denied - file download not permitted',
        404: 'File not found on Nextcloud share',
        405: 'Read access denied - this is a file-drop (upload only) share',
      };
      throw new NextcloudHttpError(
        (status && messages[status]) || `File download failed: ${err.message}`,
        status
      );
    }
  }

  /**
   * Normalize axios errors
   */
  private normalizeError(error: AxiosError): Error {
    if (error.response) {
      // Server responded with error status
      return new NextcloudHttpError(
        (error.response.data as { message?: string })?.message || error.message,
        error.response.status,
        error.response.statusText
      );
    } else if (error.request) {
      // Network error
      return new Error('Network error: Unable to connect to Nextcloud');
    } else {
      // Other error
      return error;
    }
  }
}

export default NextcloudApiClient;
