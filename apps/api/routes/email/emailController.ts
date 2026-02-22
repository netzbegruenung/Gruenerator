import { Router, type Response } from 'express';

import { sendContentDeliveryEmail } from '../../services/email/index.js';
import { createLogger } from '../../utils/logger.js';

import type { AuthenticatedRequest } from '../../middleware/types.js';

const log = createLogger('email-route');
const router = Router();

const ALLOWED_CONTENT_TYPES = ['image/png', 'image/jpeg', 'application/pdf'];
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024; // 10 MB

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface SendContentBody {
  recipientEmail: string;
  contentTitle: string;
  contentDescription?: string;
  attachment?: {
    base64: string;
    filename: string;
    contentType: string;
  };
}

/**
 * @route   POST /api/email/send-content
 * @desc    Send generated content via email with optional attachment
 * @access  Private (authenticated users)
 */
router.post('/send-content', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { recipientEmail, contentTitle, contentDescription, attachment } =
      req.body as SendContentBody;

    if (!recipientEmail || !contentTitle) {
      return res.status(400).json({ error: 'recipientEmail and contentTitle are required' });
    }

    if (!EMAIL_REGEX.test(recipientEmail)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    let attachmentBuffer: Buffer | undefined;
    let attachmentFilename: string | undefined;
    let attachmentContentType: string | undefined;

    if (attachment) {
      if (!attachment.base64 || !attachment.filename || !attachment.contentType) {
        return res
          .status(400)
          .json({ error: 'Attachment requires base64, filename, and contentType' });
      }

      if (!ALLOWED_CONTENT_TYPES.includes(attachment.contentType)) {
        return res.status(400).json({
          error: `Content type not allowed. Allowed: ${ALLOWED_CONTENT_TYPES.join(', ')}`,
        });
      }

      attachmentBuffer = Buffer.from(attachment.base64, 'base64');

      if (attachmentBuffer.length > MAX_ATTACHMENT_SIZE) {
        return res.status(400).json({ error: 'Attachment exceeds 10 MB limit' });
      }

      attachmentFilename = attachment.filename;
      attachmentContentType = attachment.contentType;
    }

    const sent = await sendContentDeliveryEmail({
      recipientEmail,
      contentTitle,
      contentDescription,
      attachment:
        attachmentBuffer && attachmentFilename && attachmentContentType
          ? {
              filename: attachmentFilename,
              content: attachmentBuffer,
              contentType: attachmentContentType,
            }
          : undefined,
    });

    if (!sent) {
      return res.status(503).json({ error: 'Email service unavailable' });
    }

    log.info('[Email] Content delivered', { userId, recipientEmail, contentTitle });
    return res.json({ success: true, message: 'Email sent successfully' });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error('[Email] Send content error', { error: err });
    return res.status(500).json({ error: 'Failed to send email', details: err.message });
  }
});

export default router;
