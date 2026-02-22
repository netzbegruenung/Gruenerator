import { BRAND, PRIMARY_URL } from '../../config/domains.js';

const PRIMARY_COLOR = '#316049';
const LOGO_URL = `${PRIMARY_URL}/images/gruenerator_logo_gruen.svg`;

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function baseLayout(content: string): string {
  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(BRAND.name)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;">
    <tr>
      <td align="center" style="padding:24px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="background-color:${PRIMARY_COLOR};padding:24px 32px;text-align:center;">
              <img src="${LOGO_URL}" alt="${escapeHtml(BRAND.name)}" width="180" style="max-width:180px;height:auto;" />
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding:32px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 32px;border-top:1px solid #e5e5e5;text-align:center;color:#888888;font-size:12px;line-height:1.5;">
              <p style="margin:0;">${escapeHtml(BRAND.name)} &mdash; KI-Werkzeuge f&uuml;r Gr&uuml;ne</p>
              <p style="margin:4px 0 0 0;">
                <a href="${PRIMARY_URL}" style="color:${PRIMARY_COLOR};text-decoration:none;">${PRIMARY_URL.replace('https://', '')}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export interface DocumentShareTemplateParams {
  recipientName: string;
  senderName: string;
  documentTitle: string;
  documentUrl: string;
  permissionLevel: string;
}

export function renderDocumentShareTemplate(params: DocumentShareTemplateParams): {
  html: string;
  text: string;
} {
  const { recipientName, senderName, documentTitle, documentUrl, permissionLevel } = params;

  const levelLabel =
    permissionLevel === 'editor'
      ? 'Bearbeiten'
      : permissionLevel === 'owner'
        ? 'Eigent\u00fcmer'
        : 'Lesen';

  const content = `
    <h1 style="margin:0 0 16px 0;font-size:20px;color:#333333;">Dokument geteilt</h1>
    <p style="margin:0 0 16px 0;font-size:15px;color:#555555;line-height:1.6;">
      Hallo ${escapeHtml(recipientName)},
    </p>
    <p style="margin:0 0 24px 0;font-size:15px;color:#555555;line-height:1.6;">
      <strong>${escapeHtml(senderName)}</strong> hat das Dokument
      <strong>&bdquo;${escapeHtml(documentTitle)}&ldquo;</strong> mit dir geteilt
      (Berechtigung: ${escapeHtml(levelLabel)}).
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 24px auto;">
      <tr>
        <td style="background-color:${PRIMARY_COLOR};border-radius:6px;">
          <a href="${escapeHtml(documentUrl)}" style="display:inline-block;padding:12px 28px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">
            Dokument &ouml;ffnen
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:0;font-size:13px;color:#888888;line-height:1.5;">
      Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:<br>
      <a href="${escapeHtml(documentUrl)}" style="color:${PRIMARY_COLOR};word-break:break-all;">${escapeHtml(documentUrl)}</a>
    </p>`;

  const text = `Dokument geteilt

Hallo ${recipientName},

${senderName} hat das Dokument "${documentTitle}" mit dir geteilt (Berechtigung: ${levelLabel}).

Dokument öffnen: ${documentUrl}

--
${BRAND.name} — KI-Werkzeuge für Grüne
${PRIMARY_URL}`;

  return { html: baseLayout(content), text };
}

export interface ContentDeliveryTemplateParams {
  recipientName?: string;
  contentTitle: string;
  contentDescription?: string;
  hasAttachment: boolean;
}

export function renderContentDeliveryTemplate(params: ContentDeliveryTemplateParams): {
  html: string;
  text: string;
} {
  const { recipientName, contentTitle, contentDescription, hasAttachment } = params;

  const greeting = recipientName
    ? `<p style="margin:0 0 16px 0;font-size:15px;color:#555555;line-height:1.6;">Hallo ${escapeHtml(recipientName)},</p>`
    : '';

  const descBlock = contentDescription
    ? `<p style="margin:0 0 16px 0;font-size:15px;color:#555555;line-height:1.6;">${escapeHtml(contentDescription)}</p>`
    : '';

  const attachmentNote = hasAttachment
    ? `<p style="margin:16px 0 0 0;font-size:13px;color:#888888;line-height:1.5;">Die Datei ist als Anhang beigef&uuml;gt.</p>`
    : '';

  const content = `
    <h1 style="margin:0 0 16px 0;font-size:20px;color:#333333;">${escapeHtml(contentTitle)}</h1>
    ${greeting}
    ${descBlock}
    <p style="margin:0 0 8px 0;font-size:15px;color:#555555;line-height:1.6;">
      Dein Inhalt aus dem ${escapeHtml(BRAND.name)} ist bereit.
    </p>
    ${attachmentNote}`;

  const greetingText = recipientName ? `Hallo ${recipientName},\n\n` : '';
  const descText = contentDescription ? `${contentDescription}\n\n` : '';
  const attachText = hasAttachment ? '\nDie Datei ist als Anhang beigefügt.' : '';

  const text = `${contentTitle}

${greetingText}${descText}Dein Inhalt aus dem ${BRAND.name} ist bereit.${attachText}

--
${BRAND.name} — KI-Werkzeuge für Grüne
${PRIMARY_URL}`;

  return { html: baseLayout(content), text };
}
