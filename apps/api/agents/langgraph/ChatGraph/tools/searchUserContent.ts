/**
 * Search User Content Tool
 *
 * Searches the user's own uploaded documents (Qdrant) and saved/generated texts
 * (PostgreSQL user_documents). Enables the DeepAgent to autonomously find user
 * content when the message implies personal documents — without requiring an
 * explicit @datei mention.
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

import { getPostgresInstance } from '../../../../database/services/PostgresService.js';
import { getQdrantDocumentService } from '../../../../services/document-services/DocumentSearchService/index.js';
import { createLogger } from '../../../../utils/logger.js';

import type { ToolDependencies } from './registry.js';

const log = createLogger('Tool:SearchUserContent');

function stripHtmlTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function createSearchUserContentTool(deps: ToolDependencies): DynamicStructuredTool | null {
  const userId = deps.userId || (deps.agentConfig as any).userId;
  if (!userId) {
    return null;
  }

  return new DynamicStructuredTool({
    name: 'search_user_content',
    description:
      'Durchsuche die hochgeladenen Dokumente und gespeicherten Texte des Nutzers. ' +
      'Nutze dieses Tool wenn der Nutzer auf eigene Inhalte Bezug nimmt — z.B. "mein Antrag", ' +
      '"meine Notizen", "das Dokument das ich hochgeladen habe", "fasse meinen Text zusammen".',
    schema: z.object({
      query: z.string().describe('Die Suchanfrage'),
      source_type: z
        .enum(['documents', 'texts', 'all'])
        .optional()
        .describe(
          'documents=hochgeladene Dateien, texts=gespeicherte Texte, all=beides (Standard)'
        ),
    }),
    func: async ({ query, source_type }) => {
      const effectiveSourceType = source_type || 'all';
      log.info(
        `[SearchUserContent] query="${query.slice(0, 60)}" source=${effectiveSourceType} user=${userId}`
      );

      const results: string[] = [];
      let totalCount = 0;

      // Search uploaded documents via Qdrant hybrid search
      if (effectiveSourceType === 'documents' || effectiveSourceType === 'all') {
        try {
          const documentSearchService = getQdrantDocumentService();
          const response = await documentSearchService.search({
            query,
            userId,
            options: {
              limit: 6,
              mode: 'hybrid',
              threshold: 0.2,
            },
          });

          const docs = response.results || [];
          for (const doc of docs) {
            totalCount++;
            const title = doc.title || doc.filename || 'Dokument';
            const content = (doc.relevant_content || '').slice(0, 500);
            const urlTag = doc.source_url ? ` (${doc.source_url})` : '';
            results.push(`[${totalCount}] ${title} (Hochgeladenes Dokument)${urlTag}\n${content}`);
          }
        } catch (err: any) {
          log.warn(`[SearchUserContent] Document search failed: ${err.message}`);
        }
      }

      // Search saved texts via PostgreSQL ILIKE
      if (effectiveSourceType === 'texts' || effectiveSourceType === 'all') {
        try {
          const postgres = getPostgresInstance();
          const likePattern = `%${query.replace(/[%_]/g, '\\$&')}%`;
          const rows = (await postgres.query(
            `SELECT id, title, content, document_type
             FROM user_documents
             WHERE user_id = $1 AND is_active = true
               AND (title ILIKE $2 OR content ILIKE $2)
             ORDER BY updated_at DESC
             LIMIT 5`,
            [userId, likePattern]
          )) as Array<{
            id: string;
            title: string;
            content: string;
            document_type: string;
          }>;

          for (const row of rows) {
            totalCount++;
            const plainContent = stripHtmlTags(row.content || '').slice(0, 500);
            const typeLabel = row.document_type || 'Text';
            results.push(
              `[${totalCount}] ${row.title} (Gespeicherter ${typeLabel})\n${plainContent}`
            );
          }
        } catch (err: any) {
          log.warn(`[SearchUserContent] Text search failed: ${err.message}`);
        }
      }

      if (results.length === 0) {
        return 'Keine eigenen Dokumente oder Texte gefunden, die zur Anfrage passen.';
      }

      return `${results.length} Ergebnisse aus eigenen Inhalten:\n\n${results.join('\n\n')}`;
    },
  });
}
