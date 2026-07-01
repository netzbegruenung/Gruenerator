import nodemailer from 'nodemailer';

import { BRAND, PRIMARY_URL } from '../../config/domains.js';
import { env } from '../../config/env.js';
import { createLogger } from '../../utils/logger.js';

import {
  renderBoardNotificationTemplate,
  renderContentDeliveryTemplate,
  renderContentSyncTemplate,
  renderDocumentNotificationTemplate,
  renderDocumentShareTemplate,
  renderGenericNotificationTemplate,
  renderLvSyncNotificationTemplate,
  type BoardNotificationTemplateParams,
  type ContentDeliveryTemplateParams,
  type ContentSyncTemplateParams,
  type DocumentNotificationTemplateParams,
  type DocumentShareTemplateParams,
  type GenericNotificationTemplateParams,
  type LvSyncNotificationTemplateParams,
} from './templates.js';

import type { Transporter } from 'nodemailer';

const log = createLogger('email');

const SMTP_HOST = env.BREVO_SMTP_HOST;
const SMTP_PORT = env.BREVO_SMTP_PORT;
const SMTP_USER = env.BREVO_SMTP_USER;
const SMTP_PASS = env.BREVO_SMTP_PASS;
const FROM_ADDRESS = env.EMAIL_FROM ?? `${BRAND.name} <${BRAND.email}>`;

let transporter: Transporter | null = null;

function isConfigured(): boolean {
  return !!(SMTP_HOST && SMTP_USER && SMTP_PASS);
}

function getTransporter(): Transporter | null {
  if (!isConfigured()) {
    return null;
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
    });
    log.info('[Email] SMTP transporter created', { host: SMTP_HOST, port: SMTP_PORT });
  }
  return transporter;
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
}

export function isEmailConfigured(): boolean {
  return isConfigured();
}

export async function sendEmail(options: SendEmailOptions): Promise<boolean> {
  const t = getTransporter();
  if (!t) {
    log.warn('[Email] SMTP not configured, skipping email', {
      to: options.to,
      subject: options.subject,
    });
    return false;
  }

  try {
    await t.sendMail({
      from: FROM_ADDRESS,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      attachments: options.attachments,
    });
    log.info('[Email] Sent', { to: options.to, subject: options.subject });
    return true;
  } catch (error) {
    log.error('[Email] Failed to send', { to: options.to, subject: options.subject, error });
    return false;
  }
}

/** Resolve a possibly-relative actionUrl to an absolute URL for use in an email link. */
function resolveActionUrl(actionUrl: string | null | undefined): string | null {
  if (!actionUrl) return null;
  if (actionUrl.startsWith('http')) return actionUrl;
  return `${PRIMARY_URL}${actionUrl.startsWith('/') ? '' : '/'}${actionUrl}`;
}

export interface DocumentShareEmailParams {
  recipientEmail: string;
  recipientName: string;
  senderName: string;
  documentId: string;
  documentTitle: string;
  permissionLevel: string;
  documentPreview?: string | null;
}

export async function sendDocumentShareEmail(params: DocumentShareEmailParams): Promise<boolean> {
  if (!isConfigured()) return false;

  const documentUrl = `${PRIMARY_URL}/docs/${params.documentId}`;

  const templateParams: DocumentShareTemplateParams = {
    recipientName: params.recipientName,
    senderName: params.senderName,
    documentTitle: params.documentTitle,
    documentUrl,
    permissionLevel: params.permissionLevel,
    ...(params.documentPreview != null && { documentPreview: params.documentPreview }),
  };

  const { html, text } = renderDocumentShareTemplate(templateParams);

  return sendEmail({
    to: params.recipientEmail,
    subject: `${params.senderName} hat ein Dokument mit dir geteilt`,
    html,
    text,
  });
}

export interface BoardNotificationEmailParams {
  recipientEmail: string;
  recipientName?: string;
  title: string;
  actionUrl?: string | null;
  fields: Omit<BoardNotificationTemplateParams, 'recipientName' | 'title' | 'actionUrl'>;
}

export async function sendBoardNotificationEmail(
  params: BoardNotificationEmailParams
): Promise<boolean> {
  if (!isConfigured()) return false;

  const { html, text } = renderBoardNotificationTemplate({
    ...params.fields,
    title: params.title,
    actionUrl: resolveActionUrl(params.actionUrl),
    ...(params.recipientName != null && { recipientName: params.recipientName }),
  });

  return sendEmail({ to: params.recipientEmail, subject: params.title, html, text });
}

export interface DocumentNotificationEmailParams {
  recipientEmail: string;
  recipientName?: string;
  title: string;
  actionUrl?: string | null;
  fields: Omit<DocumentNotificationTemplateParams, 'recipientName' | 'title' | 'actionUrl'>;
}

export async function sendDocumentNotificationEmail(
  params: DocumentNotificationEmailParams
): Promise<boolean> {
  if (!isConfigured()) return false;

  const { html, text } = renderDocumentNotificationTemplate({
    ...params.fields,
    title: params.title,
    actionUrl: resolveActionUrl(params.actionUrl),
    ...(params.recipientName != null && { recipientName: params.recipientName }),
  });

  return sendEmail({ to: params.recipientEmail, subject: params.title, html, text });
}

export interface NotificationEmailParams {
  recipientEmail: string;
  recipientName?: string;
  title: string;
  body: string | null;
  actionUrl?: string | null;
  actionLabel?: string;
}

export async function sendNotificationEmail(params: NotificationEmailParams): Promise<boolean> {
  if (!isConfigured()) return false;

  const resolvedActionUrl = resolveActionUrl(params.actionUrl);

  const templateParams: GenericNotificationTemplateParams = {
    title: params.title,
    body: params.body,
    actionUrl: resolvedActionUrl,
    ...(params.recipientName != null && { recipientName: params.recipientName }),
    ...(params.actionLabel != null && { actionLabel: params.actionLabel }),
  };

  const { html, text } = renderGenericNotificationTemplate(templateParams);

  return sendEmail({
    to: params.recipientEmail,
    subject: params.title,
    html,
    text,
  });
}

export interface ContentDeliveryEmailParams {
  recipientEmail: string;
  recipientName?: string;
  contentTitle: string;
  contentDescription?: string;
  attachment?: {
    filename: string;
    content: Buffer;
    contentType: string;
  };
}

export async function sendContentDeliveryEmail(
  params: ContentDeliveryEmailParams
): Promise<boolean> {
  if (!isConfigured()) return false;

  const templateParams: ContentDeliveryTemplateParams = {
    ...(params.recipientName && { recipientName: params.recipientName }),
    contentTitle: params.contentTitle,
    ...(params.contentDescription && { contentDescription: params.contentDescription }),
    hasAttachment: !!params.attachment,
  };

  const { html, text } = renderContentDeliveryTemplate(templateParams);

  return sendEmail({
    to: params.recipientEmail,
    subject: `${params.contentTitle} — ${BRAND.name}`,
    html,
    text,
    ...(params.attachment && { attachments: [params.attachment] }),
  });
}

export async function sendContentSyncEmail(
  to: string,
  params: ContentSyncTemplateParams
): Promise<boolean> {
  if (!isConfigured()) return false;

  const { html, text } = renderContentSyncTemplate(params);
  const hasFailures = params.totals.failed > 0 || params.totals.errors > 0;
  const icon = hasFailures ? '⚠️' : '✅';
  const subject = hasFailures
    ? `${icon} Content Sync: ${params.totals.failed}/${params.totals.sources} Quellen fehlgeschlagen`
    : `${icon} Content Sync: +${params.totals.stored} neu, ${params.totals.updated} aktualisiert`;

  return sendEmail({ to, subject, html, text });
}

export async function sendLvSyncNotificationEmail(
  to: string,
  params: LvSyncNotificationTemplateParams
): Promise<boolean> {
  if (!isConfigured()) return false;

  const { html, text } = renderLvSyncNotificationTemplate(params);

  return sendEmail({
    to,
    subject: `${params.newArticles.length} neue Artikel indexiert — ${params.lvName}`,
    html,
    text,
  });
}

export async function verifyEmailConnection(): Promise<boolean> {
  const t = getTransporter();
  if (!t) return false;

  try {
    await t.verify();
    log.info('[Email] SMTP connection verified');
    return true;
  } catch (error) {
    log.error('[Email] SMTP connection verification failed', { error });
    return false;
  }
}
