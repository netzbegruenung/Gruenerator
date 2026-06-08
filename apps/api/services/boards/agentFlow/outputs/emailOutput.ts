/**
 * Output: email the AI result to the user who started the agent (the requester).
 * Recipient is fixed to the requester — no free address field — so there is no
 * spam/SSRF surface. No-ops gracefully if SMTP is unconfigured or the user has no
 * email on file.
 */
import { createLogger } from '../../../../utils/logger.js';
import { sendNotificationEmail } from '../../../email/emailService.js';
import { getProfileService } from '../../../user/ProfileService.js';

import { type OutputExecutor } from './types.js';

const log = createLogger('boardFlow:emailOutput');

const MAX_EMAIL_BODY_CHARS = 4000;

export const emailOutput: OutputExecutor = async (ctx) => {
  const { task } = ctx;
  const profile = await getProfileService().getProfileById(task.requested_by);
  if (!profile?.email) {
    log.warn(`Email output skipped — no address for user ${task.requested_by}`);
    return;
  }

  const body =
    ctx.content.length > MAX_EMAIL_BODY_CHARS
      ? `${ctx.content.slice(0, MAX_EMAIL_BODY_CHARS)}\n\n[…gekürzt]`
      : ctx.content;

  await sendNotificationEmail({
    recipientEmail: profile.email,
    ...(profile.display_name != null && { recipientName: profile.display_name }),
    title: `Grünerator-Ergebnis: ${ctx.title}`,
    body,
    actionUrl: ctx.documentUrl ?? `/boards/${task.board_id}?card=${task.card_id}`,
  });
};
