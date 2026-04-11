import { Router, type Response } from 'express';
import { z } from 'zod';

import { validateBody, type TypedRequest } from '../../middleware/validateBody.js';
import { sendContentDeliveryEmail } from '../../services/email/index.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('email-route');
const router = Router();

const ALLOWED_CONTENT_TYPES = ['image/png', 'image/jpeg', 'application/pdf'] as const;
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024; // 10 MB

const sendContentSchema = z.object({
  recipientEmail: z.string().email('Invalid email address'),
  contentTitle: z.string().min(1, 'contentTitle is required'),
  contentDescription: z.string().optional(),
  attachment: z
    .object({
      base64: z.string().min(1),
      filename: z.string().min(1),
      contentType: z.enum(ALLOWED_CONTENT_TYPES),
    })
    .optional(),
});

type SendContentBody = z.infer<typeof sendContentSchema>;

/**
 * @route   POST /api/email/send-content
 * @desc    Send generated content via email with optional attachment
 * @access  Private (authenticated users)
 */
router.post(
  '/send-content',
  validateBody(sendContentSchema),
  async (req: TypedRequest<SendContentBody>, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const { recipientEmail, contentTitle, contentDescription, attachment } = req.body;

      let attachmentBuffer: Buffer | undefined;
      let attachmentFilename: string | undefined;
      let attachmentContentType: string | undefined;

      if (attachment) {
        attachmentBuffer = Buffer.from(attachment.base64, 'base64');

        if (attachmentBuffer.length > MAX_ATTACHMENT_SIZE) {
          return res.status(400).json({ error: 'Attachment exceeds 10 MB limit' });
        }

        attachmentFilename = attachment.filename;
        attachmentContentType = attachment.contentType;
      }

      const params = {
        recipientEmail,
        contentTitle,
        ...(contentDescription != null && { contentDescription }),
        ...(attachmentBuffer &&
          attachmentFilename &&
          attachmentContentType && {
            attachment: {
              filename: attachmentFilename,
              content: attachmentBuffer,
              contentType: attachmentContentType,
            },
          }),
      };
      const sent = await sendContentDeliveryEmail(params);

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
  }
);

export default router;
