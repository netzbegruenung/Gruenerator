/**
 * Connected-account (Nango) file retrieval for the multi-doc fan-out.
 *
 * Resolves a single user-selected file from a Nango-connected provider
 * (Microsoft / Google / Jira / Confluence) at chat-send time, extracts its
 * text via the shared OCR / text-extraction pipeline (binary payloads) or
 * directly (string payloads), and returns SearchResult chunks the respondNode
 * can quote.
 *
 * No DB writes, no Qdrant indexing — purely inline-at-send-time. Stale tokens,
 * revoked connections, or unsupported files yield an empty result set so the
 * rest of the turn still succeeds. Mirrors wolkeRetrieval.ts (Nextcloud).
 */

import * as atlassianClient from '../../../../services/api-clients/atlassianClient.js';
import * as googleDriveClient from '../../../../services/api-clients/googleDriveClient.js';
import * as microsoftGraphClient from '../../../../services/api-clients/microsoftGraphClient.js';
import { ConnectionService } from '../../../../services/connections/ConnectionService.js';
import { extractTextFromFile } from '../../../../services/document-services/DocumentProcessingService/textExtraction.js';
import { createLogger } from '../../../../utils/logger.js';
import { SOURCE_PREFIX, type DocumentSource, type SearchResult } from '../types.js';

import type { NangoProviderKey } from '../../../../config/nango.js';

const log = createLogger('ConnectRetrieval');

const CHUNK_SIZE = 1500;
const CHUNK_OVERLAP = 100;

function chunkText(text: string, perSourceLimit: number): string[] {
  const cleaned = text.trim();
  if (!cleaned) return [];
  if (cleaned.length <= CHUNK_SIZE) return [cleaned];
  const chunks: string[] = [];
  let pos = 0;
  const stride = CHUNK_SIZE - CHUNK_OVERLAP;
  while (pos < cleaned.length && chunks.length < perSourceLimit) {
    chunks.push(cleaned.slice(pos, pos + CHUNK_SIZE));
    pos += stride;
  }
  return chunks;
}

function mimeTypeFromName(name: string, fallback?: string | null): string {
  if (fallback) return fallback;
  const lower = name.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.docx'))
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (lower.endsWith('.pptx'))
    return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  if (lower.endsWith('.txt') || lower.endsWith('.md')) return 'text/plain';
  return 'application/octet-stream';
}

/** Strip HTML tags + collapse whitespace for Confluence storage/view bodies. */
function htmlToText(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Acquire the text content of a connected-account file.
 * Returns null when the provider/file is unsupported or the fetch failed.
 */
async function acquireText(
  provider: NangoProviderKey,
  accessToken: string,
  fileId: string,
  name: string,
  mimeType?: string | null
): Promise<string | null> {
  switch (provider) {
    case 'microsoft': {
      const buffer = await microsoftGraphClient.downloadDriveItem(accessToken, fileId);
      return extractTextFromFile({
        buffer,
        mimetype: mimeTypeFromName(name, mimeType),
        originalname: name,
        size: buffer.length,
      });
    }
    case 'google': {
      // Google-native docs/sheets can't be downloaded raw — export to text.
      if (mimeType?.startsWith('application/vnd.google-apps')) {
        if (mimeType === 'application/vnd.google-apps.spreadsheet') {
          const sheet = await googleDriveClient.getSheetContent(accessToken, fileId);
          return JSON.stringify(sheet);
        }
        return googleDriveClient.exportDoc(accessToken, fileId, 'text/plain');
      }
      const buffer = await googleDriveClient.downloadFile(accessToken, fileId);
      return extractTextFromFile({
        buffer,
        mimetype: mimeTypeFromName(name, mimeType),
        originalname: name,
        size: buffer.length,
      });
    }
    case 'jira': {
      const sites = await atlassianClient.getAccessibleResources(accessToken);
      if (sites.length === 0) return null;
      const issue = await atlassianClient.getJiraIssue(accessToken, sites[0].id, fileId);
      const description =
        typeof issue.fields.description === 'string'
          ? issue.fields.description
          : JSON.stringify(issue.fields.description ?? '');
      return [
        `${issue.key}: ${issue.fields.summary}`,
        `Status: ${issue.fields.status.name}`,
        `Typ: ${issue.fields.issuetype.name}`,
        description,
      ].join('\n');
    }
    case 'confluence': {
      const sites = await atlassianClient.getAccessibleResources(accessToken);
      if (sites.length === 0) return null;
      const page = await atlassianClient.getConfluencePageContent(accessToken, sites[0].id, fileId);
      const body = page.body.view?.value ?? page.body.storage?.value ?? '';
      return `${page.title}\n\n${htmlToText(body)}`;
    }
    default:
      return null;
  }
}

export async function retrieveConnectFile(
  src: DocumentSource,
  perSourceLimit: number,
  userId: string
): Promise<SearchResult[]> {
  if (src.kind !== 'connect' || !src.connect) return [];
  const { provider, fileId, name, mimeType } = src.connect;

  let accessToken: string;
  try {
    const connection = await ConnectionService.getConnection(userId, provider as NangoProviderKey);
    accessToken = connection.accessToken;
  } catch (err) {
    log.warn(`[Connect] Connection lookup failed for ${provider} (${name})`, err);
    return [];
  }

  let text: string | null;
  try {
    text = await acquireText(provider as NangoProviderKey, accessToken, fileId, name, mimeType);
  } catch (err) {
    log.warn(`[Connect] content retrieval skipped for ${name} (${provider})`, err);
    return [];
  }

  if (!text) return [];

  const chunks = chunkText(text, perSourceLimit);
  return chunks.map<SearchResult>((content, idx) => ({
    source: `${SOURCE_PREFIX.CONNECT}${provider}:${fileId}`,
    title: name,
    content,
    relevance: 0.7,
    documentSourceId: src.id,
    chunkIndex: idx,
  }));
}
