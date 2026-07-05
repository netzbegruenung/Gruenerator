/**
 * Chat Feedback Controller
 *
 * Records a thumbs up/down on an assistant message as a Langfuse score on that
 * chat turn's trace. No-op (204) when Langfuse is not configured — the frontend
 * buttons still render, the score just isn't stored.
 */

import { z } from 'zod';

import { validateBody, type TypedRequest } from '../../middleware/validateBody.js';
import { getLangfuseConfig } from '../../services/telemetry/langfuseTelemetry.js';
import { createAuthenticatedRouter } from '../../utils/keycloak/index.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('FeedbackController');
const router = createAuthenticatedRouter();

const feedbackSchema = z.object({
  traceId: z.string().min(1),
  value: z.enum(['positive', 'negative']),
  comment: z.string().max(2000).optional(),
});

/**
 * POST /api/chat-service/feedback
 * Body: { traceId, value: 'positive' | 'negative', comment? }
 */
router.post(
  '/',
  validateBody(feedbackSchema),
  async (req: TypedRequest<z.infer<typeof feedbackSchema>>, res) => {
    const { traceId, value, comment } = req.body;

    const cfg = getLangfuseConfig();
    if (!cfg) {
      // Langfuse disabled — accept silently so the UI stays consistent.
      res.status(204).end();
      return;
    }

    try {
      const auth = Buffer.from(`${cfg.publicKey}:${cfg.secretKey}`).toString('base64');
      const response = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/api/public/scores`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          traceId,
          name: 'user-feedback',
          value: value === 'positive' ? 1 : 0,
          dataType: 'NUMERIC',
          ...(comment && { comment }),
        }),
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
