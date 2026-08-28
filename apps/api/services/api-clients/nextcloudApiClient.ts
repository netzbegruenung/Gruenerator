import axios, { type AxiosInstance, type AxiosError } from 'axios';

import { toUserFacingMessage } from '../../utils/errors/index.js';
import { validateUrlSync, validateUrlForFetch } from '../../utils/validation/urlSecurity.js';

// Type Definitions
export interface ParsedShareLink {
  baseUrl: string;
  shareToken: string;
  fullPath: string;
}

export type ConnectionErrorCode = 'invalid_link' | 'not_found' | 'forbidden' | 'unknown';

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
    try {
      const urlObj = new URL(shareLink);
      const pathMatch = urlObj.pathname.match(/\/s\/([A-Za-z0-9]+)/);

      if (!pathMatch) {
        return null;
      }

      return {
        baseUrl: `${urlObj.protocol}//${urlObj.host}`,
        shareToken: pathMatch[1],
        fullPath: urlObj.pathname + urlObj.search,
      };
    } catch (error) {
      const err = error as Error;
      console.error('[NextcloudApiClient] Error parsing share link', {
        shareLink,
        error: err.message,
      });
      return null;
    }
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
      const err = error as AxiosError;
      console.error('[NextcloudApiClient] Connection test failed', { error: err.message });

      if (err.response?.status === 401) {
        return {
          success: false,
          message: 'Authentication failed - invalid share token',
          errorCode: 'invalid_link',
        };
      } else if (err.response?.status === 403) {
        return {
          success: false,
          message: 'Access forbidden - share may not be active',
          errorCode: 'forbidden',
        };
      } else if (err.response?.status === 404) {
        return {
          success: false,
          message: 'Share not found - check the share link',
          errorCode: 'not_found',
        };
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
        return this.parseWebDAVResponse(response.data, new URL(propfindUrl).pathname);
      }

      return [];
    } catch (error) {
      const err = error as Error;
      console.error('[NextcloudApiClient] Failed to list folder', {
        folderPath,
        error: err.message,
      });
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
        const files = this.parseWebDAVResponse(response.data);

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
      throw new Error(err.message || 'Failed to get share information');
    }
  }

  /**
   * Parse WebDAV XML response (simplified parser)
   */
  private parseWebDAVResponse(xmlData: string, requestPath?: string): NextcloudFile[] {
    // This is a simplified parser - in production you might want to use a proper XML parser
    const files: NextcloudFile[] = [];

    try {
      // Extract file information from XML (basic regex parsing)
      const responseMatches = xmlData.match(/<d:response[^>]*>(.*?)<\/d:response>/gs);

      if (responseMatches) {
        responseMatches.forEach((responseXml) => {
          const hrefMatch = responseXml.match(/<d:href[^>]*>(.*?)<\/d:href>/);
          const displayNameMatch = responseXml.match(/<d:displayname[^>]*>(.*?)<\/d:displayname>/);
          const contentLengthMatch = responseXml.match(
            /<d:getcontentlength[^>]*>(.*?)<\/d:getcontentlength>/
          );
          const lastModifiedMatch = responseXml.match(
            /<d:getlastmodified[^>]*>(.*?)<\/d:getlastmodified>/
          );
          const etagMatch = responseXml.match(/<d:getetag[^>]*>(.*?)<\/d:getetag>/);
          const isDirectory = /<d:collection\s*\/?>/.test(responseXml);

          if (hrefMatch && hrefMatch[1]) {
            const href = hrefMatch[1].trim();

            // Skip the listed folder itself — the share root always, any other
            // requested folder once we know which one was asked for.
            if (href.endsWith('/webdav/') || href.endsWith('/webdav')) {
              return;
            }
            if (requestPath && isWebdavSelfEntry(href, requestPath)) {
              return;
            }

            // Clean up etag value - remove quotes if present
            let etag: string | null = null;
            if (etagMatch && etagMatch[1]) {
              etag = etagMatch[1].trim().replace(/^["']|["']$/g, '');
            }

            // For directories, extract name from href (trailing slash)
            let name = displayNameMatch ? displayNameMatch[1].trim() : '';
            if (!name) {
              const segments = href.replace(/\/$/, '').split('/');
              name = decodeURIComponent(segments.pop() || '');
            }

            files.push({
              href: href,
              name,
              size: contentLengthMatch ? parseInt(contentLengthMatch[1]) : null,
              lastModified: lastModifiedMatch ? new Date(lastModifiedMatch[1]) : null,
              etag: etag,
              isDirectory,
            });
          }
        });
      }
    } catch (error) {
      const err = error as Error;
      console.error('[NextcloudApiClient] Error parsing WebDAV response', { error: err.message });
    }

    return files;
  }

  /**
   * Download file content from Nextcloud share
   * @param filePath - File path from WebDAV response (e.g., "/public.php/webdav/filename.pdf")
   * @returns File content as buffer
   */
  async downloadFile(filePath: string): Promise<DownloadFileResult> {
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
      const err = error as AxiosError;
      console.error(`[NextcloudApiClient] File download failed:`, {
        filePath,
        error: err.message,
        status: err.response?.status,
      });

      if (err.response?.status === 401) {
        throw new Error('Authentication failed - cannot download file');
      } else if (err.response?.status === 404) {
        throw new Error('File not found on Nextcloud share');
      } else if (err.response?.status === 403) {
        throw new Error('Access denied - file download not permitted');
      }

      throw new Error(`File download failed: ${err.message}`);
    }
  }

  /**
   * Normalize axios errors
   */
  private normalizeError(error: AxiosError): Error {
    if (error.response) {
      // Server responded with error status
      const normalizedError: Error & { status?: number; statusText?: string } = new Error(
        (error.response.data as { message?: string })?.message || error.message
      );
      normalizedError.status = error.response.status;
      normalizedError.statusText = error.response.statusText;
      return normalizedError;
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
