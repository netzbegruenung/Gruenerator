/**
 * Chat Feedback Controller
 *
 * Records a thumbs up/down on an assistant message as a Langfuse score on that
 * chat turn's trace. No-op (204) when Langfuse is not configured — that path
 * should not be reachable, since the client only renders the buttons for a turn
 * whose `done` event carried a trace id, and there is no trace id when Langfuse
 * is off.
 */

import { z } from 'zod';

import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { validateBody, type TypedRequest } from '../../middleware/validateBody.js';
import { getLangfuseConfig } from '../../services/telemetry/langfuseTelemetry.js';
import { createAuthenticatedRouter } from '../../utils/keycloak/index.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('FeedbackController');
const router = createAuthenticatedRouter();

/** OTel trace ids are exactly 32 lowercase hex chars — anything else is forged. */
const TRACE_ID = /^[0-9a-f]{32}$/;

const feedbackSchema = z.object({
  traceId: z.string().regex(TRACE_ID, 'traceId muss eine 32-stellige Hex-Trace-ID sein'),
  value: z.enum(['positive', 'negative']),
  comment: z.string().max(2000).optional(),
});

/**
 * Does this trace id belong to one of the caller's own turns?
 *
 * The id is persisted in the assistant message's `tool_results` metadata (see
 * postResponseService), which is also what makes the button survive a reload.
 * Without this check any authenticated user could write scores onto any trace,
 * including ones from other people's conversations.
 *
 * Deliberately keyed on the message's `user_id`, not on access to the thread:
 * in a shared thread, feedback should come from whoever actually asked.
 */
async function ownsTrace(userId: string, traceId: string): Promise<boolean> {
  const rows = (await getPostgresInstance().query(
    `SELECT 1 FROM chat_messages
      WHERE user_id = $1 AND tool_results ->> 'traceId' = $2
      LIMIT 1`,
    [userId, traceId]
  )) as unknown[];
  return rows.length > 0;
}

/**
 * POST /api/chat-service/feedback
 * Body: { traceId, value: 'positive' | 'negative', comment? }
 */
router.post(
  '/',
  validateBody(feedbackSchema),
  async (req: TypedRequest<z.infer<typeof feedbackSchema>>, res) => {
    const { traceId, value, comment } = req.body;

    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Nicht angemeldet.' });
      return;
    }

    const cfg = getLangfuseConfig();
    if (!cfg) {
      // Langfuse disabled — accept silently so the UI stays consistent.
      res.status(204).end();
      return;
    }

    try {
      // 404 rather than 403: a trace the caller doesn't own is, for them,
      // indistinguishable from one that doesn't exist.
      if (!(await ownsTrace(userId, traceId))) {
        log.warn(`Feedback for a trace the user does not own (user ${userId})`);
        res.status(404).json({ error: 'Zu diesem Beitrag gibt es kein Feedback-Ziel.' });
        return;
      }

      const auth = Buffer.from(`${cfg.publicKey}:${cfg.secretKey}`).toString('base64');
      const response = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/api/public/scores`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          traceId,
          // Names the signal, not what we hope it measures: a thumbs-down says
          // the user was unhappy, never why. `user-feedback` was too generic to
          // stay distinguishable once a second feedback surface appears.
          name: 'user-thumbs',
          value: value === 'positive' ? 1 : 0,
          // Without an explicit dataType Langfuse infers NUMERIC from the 1/0
          // and averages it, instead of charting it as a satisfaction rate.
          dataType: 'BOOLEAN',
          ...(comment && { comment }),
        }),
        // Fail fast if the self-hosted instance hangs — don't tie up a request slot.
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        log.warn(`Langfuse score POST failed (${response.status}): ${text}`);
        res.status(502).json({ error: 'Feedback konnte nicht gespeichert werden.' });
        return;
      }

      res.status(204).end();
    } catch (error) {
      log.error('Feedback submission error:', error);
      res.status(500).json({ error: 'Feedback konnte nicht gespeichert werden.' });
    }
  }
);

export default router;
