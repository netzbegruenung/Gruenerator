import nodemailer from 'nodemailer';

import { BRAND, PRIMARY_URL } from '../../config/domains.js';
import { createLogger } from '../../utils/logger.js';

import {
  renderContentDeliveryTemplate,
  renderDocumentShareTemplate,
  type ContentDeliveryTemplateParams,
  type DocumentShareTemplateParams,
} from './templates.js';

import type { Transporter } from 'nodemailer';

const log = createLogger('email');

const SMTP_HOST = process.env.BREVO_SMTP_HOST;
const SMTP_PORT = parseInt(process.env.BREVO_SMTP_PORT || '587', 10);
const SMTP_USER = process.env.BREVO_SMTP_USER;
const SMTP_PASS = process.env.BREVO_SMTP_PASS;
const FROM_ADDRESS = process.env.EMAIL_FROM || `${BRAND.name} <${BRAND.email}>`;

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

export async function sendEmail(options: SendEmailOptions): Promise<boolean> {
  const t = getTransporter();
  if (!t) {
    log.debug('[Email] SMTP not configured, skipping email');
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

export interface DocumentShareEmailParams {
  recipientEmail: string;
  recipientName: string;
  senderName: string;
  documentId: string;
  documentTitle: string;
  permissionLevel: string;
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
  };

  const { html, text } = renderDocumentShareTemplate(templateParams);

  return sendEmail({
    to: params.recipientEmail,
    subject: `${params.senderName} hat ein Dokument mit dir geteilt`,
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
    recipientName: params.recipientName,
    contentTitle: params.contentTitle,
    contentDescription: params.contentDescription,
    hasAttachment: !!params.attachment,
  };

  const { html, text } = renderContentDeliveryTemplate(templateParams);

  return sendEmail({
    to: params.recipientEmail,
    subject: `${params.contentTitle} — ${BRAND.name}`,
    html,
    text,
    attachments: params.attachment ? [params.attachment] : undefined,
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
