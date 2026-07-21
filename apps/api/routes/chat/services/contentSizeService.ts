/**
 * Cheap size probes for recall candidates — so the model can see roughly how
 * large a chat or document is BEFORE deciding to read it (MCP `estimate_size`
 * style). All estimates are coarse `tokens` (char/4 heuristic); the goal is a
 * "small vs large" signal, not exactness.
 */

import { getPostgresInstance } from '../../../database/services/PostgresService.js';
import { createLogger } from '../../../utils/logger.js';

const log = createLogger('ContentSizeService');

/** Approximate token count of a chat thread's user/assistant text. Batched. */
export async function probeThreadSizes(threadIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (threadIds.length === 0) return out;
  try {
    const rows = (await getPostgresInstance().query(
      `SELECT thread_id, COALESCE(SUM(length(content)), 0) AS chars
       FROM chat_messages
       WHERE thread_id = ANY($1::uuid[]) AND role IN ('user', 'assistant') AND content IS NOT NULL
       GROUP BY thread_id`,
      [threadIds]
    )) as Array<{ thread_id: string; chars: number | string }>;
    for (const r of rows) out.set(r.thread_id, Math.ceil(Number(r.chars) / 4));
  } catch (err) {
    log.warn(`[Size] Thread size probe failed: ${err}`);
  }
  return out;
}

/**
 * Approximate token count of office documents from their latest gzipped Yjs
 * snapshot. Gzipped bytes are a monotone proxy for body size; scaled up (~3×
 * decompression, /4 for tokens) into a coarse token estimate. Batched.
 */
export async function probeOfficeSizes(docIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (docIds.length === 0) return out;
  try {
    const rows = (await getPostgresInstance().query(
      `SELECT DISTINCT ON (document_id) document_id, octet_length(snapshot_data) AS bytes
       FROM yjs_document_snapshots
       WHERE document_id = ANY($1::uuid[])
       ORDER BY document_id, version DESC`,
      [docIds]
    )) as Array<{ document_id: string; bytes: number | string }>;
    for (const r of rows) out.set(r.document_id, Math.ceil((Number(r.bytes) * 3) / 4));
  } catch (err) {
    log.warn(`[Size] Office size probe failed: ${err}`);
  }
  return out;
}
