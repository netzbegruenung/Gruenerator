/**
 * Email Smoke Test
 *
 * Sends one minimal email via the same Brevo SMTP path the content sync uses.
 * Designed to be invoked from the email-test GitHub workflow when SMTP fails
 * silently in production runs — surfaces the actual nodemailer error so we can
 * tell `Sender address rejected` from `Authentication failed` from a TLS issue.
 *
 * Usage:
 *   TEST_EMAIL_TO=foo@example.com npx tsx apps/api/test-email.ts
 *   npx tsx apps/api/test-email.ts --to foo@example.com
 *
 * Reads SMTP credentials from env (BREVO_SMTP_HOST/PORT/USER/PASS, EMAIL_FROM).
 * Writes a config diagnostic line BEFORE the send so a synchronous reject still
 * leaves a trail of what was attempted.
 */

import { env } from './config/env.js';
import { sendEmail } from './services/email/emailService.js';

function parseRecipient(): string {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--to') return args[++i] ?? '';
  }
  return env.TEST_EMAIL_TO ?? env.CONTENT_SYNC_EMAIL ?? '';
}

function mask(value: string | undefined): string {
  if (!value) return '<unset>';
  if (value.length <= 4) return '***';
  return `${value.slice(0, 2)}***${value.slice(-2)} (len=${value.length})`;
}

async function main() {
  const to = parseRecipient();
  if (!to) {
    console.error(
      'No recipient. Pass --to <addr> or set TEST_EMAIL_TO / CONTENT_SYNC_EMAIL.'
    );
    process.exit(2);
  }

  console.log('=== Email Smoke Test ===');
  console.log(`Recipient:        ${to}`);
  console.log(`EMAIL_FROM:       ${env.EMAIL_FROM ?? '<unset, will fall back to BRAND default>'}`);
  console.log(`BREVO_SMTP_HOST:  ${env.BREVO_SMTP_HOST ?? '<unset>'}`);
  console.log(`BREVO_SMTP_PORT:  ${env.BREVO_SMTP_PORT ?? '<unset>'}`);
  console.log(`BREVO_SMTP_USER:  ${mask(env.BREVO_SMTP_USER)}`);
  console.log(`BREVO_SMTP_PASS:  ${mask(env.BREVO_SMTP_PASS)}`);
  console.log('');

  const subject = `Grünerator email smoke test (${new Date().toISOString()})`;
  const body =
    'This is an automated email-deliverability smoke test triggered from the ' +
    '`email-test` GitHub workflow. If you received it, the Brevo SMTP path is ' +
    'healthy. If the workflow failed, check the workflow logs for the underlying ' +
    'nodemailer error (now visible thanks to the structured-metadata logger fix).';

  const ok = await sendEmail({
    to,
    subject,
    text: body,
    html: `<p>${body}</p>`,
  });

  if (ok) {
    console.log('✓ sendEmail returned true');
    process.exit(0);
  } else {
    console.error('✗ sendEmail returned false — see [Email] log line above for the error');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
