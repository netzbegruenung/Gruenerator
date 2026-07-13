import express, { type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';

import { env } from '../../config/env.js';
import { validateBody, type TypedRequest } from '../../middleware/validateBody.js';
import { sendEmail } from '../../services/email/index.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('feedback');
const router = express.Router();

const FEEDBACK_RECIPIENT = 'info@moritz-waechter.de';

const feedbackSchema = z.object({
  name: z.string().trim().max(200).optional(),
  email: z.string().trim().email().max(320),
  message: z.string().trim().min(1).max(5000),
  source: z.string().trim().max(120).optional(),
});

type FeedbackBody = z.infer<typeof feedbackSchema>;

const feedbackLimiter = env.DISABLE_RATE_LIMITS
  ? (_req: Request, _res: Response, next: () => void) => next()
  : rateLimit({
      windowMs: 60 * 60 * 1000,
      max: 8,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Zu viele Nachrichten, bitte versuche es später erneut.' },
    });

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

router.post(
  '/',
  feedbackLimiter,
  validateBody(feedbackSchema),
  async (req: TypedRequest<FeedbackBody>, res: Response): Promise<void> => {
    const { name, email, message, source } = req.body;
    const displayName = name?.trim() || 'Anonym';

    const subject = `Testsommer-Feedback von ${displayName}`;
    const text = [`Von: ${displayName} <${email}>`, source ? `Seite: ${source}` : null, '', message]
      .filter((line) => line !== null)
      .join('\n');
    const html = [
      `<p><strong>Von:</strong> ${escapeHtml(displayName)} &lt;${escapeHtml(email)}&gt;</p>`,
      source ? `<p><strong>Seite:</strong> ${escapeHtml(source)}</p>` : '',
      `<p style="white-space:pre-wrap">${escapeHtml(message)}</p>`,
    ].join('');

    const sent = await sendEmail({
      to: FEEDBACK_RECIPIENT,
      subject,
      text,
      html,
      replyTo: name?.trim() ? `${displayName} <${email}>` : email,
    });

    if (!sent) {
      log.warn('[Feedback] Email not sent (SMTP unconfigured or failed)', { email });
      res.status(502).json({ ok: false, error: 'Nachricht konnte nicht zugestellt werden.' });
      return;
    }

    log.info('[Feedback] Received', { email, source });
    res.status(200).json({ ok: true });
  }
);

export default router;
