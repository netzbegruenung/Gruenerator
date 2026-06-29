import { escapeHtml } from '@gruenerator/shared/utils';

import { BRAND, PRIMARY_URL } from '../../config/domains.js';

export const PRIMARY_COLOR = '#316049';
export const HEADER_BG_COLOR = '#F5F1E9';
export const LOGO_URL = `${PRIMARY_URL}/images/gruenerator_logo_gruen.svg`;

export { escapeHtml };

export function baseLayout(content: string): string {
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
            <td style="background-color:${HEADER_BG_COLOR};padding:24px 32px;text-align:center;border-bottom:1px solid #e8e2d0;">
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

// ----- Shared rich-notification building blocks -----

/** Format an ISO date (or yyyy-mm-dd) as dd.MM.yyyy; pass through unparseable input. */
export function formatDueDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Europe/Berlin',
  });
}

function renderCtaBlock(url: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 24px auto;">
      <tr>
        <td style="background-color:${PRIMARY_COLOR};border-radius:6px;">
          <a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 28px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">
            ${escapeHtml(label)}
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:0;font-size:13px;color:#888888;line-height:1.5;">
      Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:<br>
      <a href="${escapeHtml(url)}" style="color:${PRIMARY_COLOR};word-break:break-all;">${escapeHtml(url)}</a>
    </p>`;
}

// Status/label colours are user-editable and land in a CSS `style` value, where
// escapeHtml does NOT neutralize CSS metacharacters (; : ( ) }). Allow only a
// hex or rgb(a) literal; anything else drops the colour dot rather than inject CSS.
function safeCssColor(color: string | undefined): string | null {
  if (!color) return null;
  const trimmed = color.trim();
  return /^#[0-9a-fA-F]{3,8}$|^rgba?\([\d.,\s%]+\)$/.test(trimmed) ? trimmed : null;
}

function renderChip(label: string, color?: string): string {
  const safeColor = safeCssColor(color);
  const dot = safeColor
    ? `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background-color:${safeColor};margin-right:6px;vertical-align:middle;"></span>`
    : '';
  return `<span style="display:inline-block;background-color:#eef2ee;color:#316049;font-size:12px;font-weight:600;padding:4px 10px;border-radius:12px;margin:0 6px 6px 0;">${dot}${escapeHtml(label)}</span>`;
}

export interface ResourcePreviewCardParams {
  title: string;
  chips?: string[];
  /** Per-chip color dots, index-aligned with `chips` (e.g. status color). */
  chipColors?: (string | undefined)[];
  snippet?: string | null;
  /** A quoted line \u2014 e.g. a comment's full text or an attachment filename. */
  eventLine?: string | null;
}

/** A bordered, card-styled preview block reused by board and document emails. */
function renderResourcePreviewCard(params: ResourcePreviewCardParams): string {
  const { title, chips = [], chipColors = [], snippet, eventLine } = params;

  const chipsBlock = chips.length
    ? `<div style="margin:0 0 4px 0;">${chips.map((c, i) => renderChip(c, chipColors[i])).join('')}</div>`
    : '';

  const snippetBlock = snippet
    ? `<p style="margin:8px 0 0 0;font-size:14px;color:#666666;line-height:1.5;">${escapeHtml(snippet)}</p>`
    : '';

  const eventBlock = eventLine
    ? `<p style="margin:10px 0 0 0;padding:10px 12px;background-color:#ffffff;border-left:3px solid ${PRIMARY_COLOR};font-size:14px;color:#444444;line-height:1.5;">${escapeHtml(eventLine)}</p>`
    : '';

  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 24px 0;">
      <tr>
        <td style="padding:16px 18px;background-color:#fafafa;border:1px solid #e8e2d0;border-radius:8px;">
          <p style="margin:0 0 8px 0;font-size:16px;font-weight:700;color:#333333;line-height:1.4;">${escapeHtml(title)}</p>
          ${chipsBlock}
          ${snippetBlock}
          ${eventBlock}
        </td>
      </tr>
    </table>`;
}

export interface DocumentShareTemplateParams {
  recipientName: string;
  senderName: string;
  documentTitle: string;
  documentUrl: string;
  permissionLevel: string;
  documentPreview?: string | null;
}

export function renderDocumentShareTemplate(params: DocumentShareTemplateParams): {
  html: string;
  text: string;
} {
  const {
    recipientName,
    senderName,
    documentTitle,
    documentUrl,
    permissionLevel,
    documentPreview,
  } = params;

  const levelLabel =
    permissionLevel === 'editor'
      ? 'Bearbeiten'
      : permissionLevel === 'owner'
        ? 'Eigent\u00fcmer*in'
        : 'Lesen';

  const previewCard = renderResourcePreviewCard({
    title: documentTitle,
    chips: [`Berechtigung: ${levelLabel}`],
    snippet: documentPreview ?? null,
  });

  const content = `
    <h1 style="margin:0 0 16px 0;font-size:20px;color:#333333;">Dokument geteilt</h1>
    <p style="margin:0 0 16px 0;font-size:15px;color:#555555;line-height:1.6;">
      Hallo ${escapeHtml(recipientName)},
    </p>
    <p style="margin:0 0 20px 0;font-size:15px;color:#555555;line-height:1.6;">
      <strong>${escapeHtml(senderName)}</strong> hat ein Dokument mit dir geteilt:
    </p>
    ${previewCard}
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

${senderName} hat das Dokument "${documentTitle}" mit dir geteilt (Berechtigung: ${levelLabel}).${
    documentPreview ? `\n\n${documentPreview}` : ''
  }

Dokument öffnen: ${documentUrl}

--
${BRAND.name} — KI-Werkzeuge für Grüne
${PRIMARY_URL}`;

  return { html: baseLayout(content), text };
}

export interface GenericNotificationTemplateParams {
  recipientName?: string;
  title: string;
  body: string | null;
  actionUrl?: string | null;
  actionLabel?: string;
}

export function renderGenericNotificationTemplate(params: GenericNotificationTemplateParams): {
  html: string;
  text: string;
} {
  const { recipientName, title, body, actionUrl, actionLabel = 'In Grünerator öffnen' } = params;

  const greeting = recipientName
    ? `<p style="margin:0 0 16px 0;font-size:15px;color:#555555;line-height:1.6;">Hallo ${escapeHtml(recipientName)},</p>`
    : '';

  const bodyBlock = body
    ? `<p style="margin:0 0 24px 0;font-size:15px;color:#555555;line-height:1.6;">${escapeHtml(body)}</p>`
    : '';

  const ctaBlock = actionUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 24px auto;">
      <tr>
        <td style="background-color:${PRIMARY_COLOR};border-radius:6px;">
          <a href="${escapeHtml(actionUrl)}" style="display:inline-block;padding:12px 28px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">
            ${escapeHtml(actionLabel)}
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:0;font-size:13px;color:#888888;line-height:1.5;">
      Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:<br>
      <a href="${escapeHtml(actionUrl)}" style="color:${PRIMARY_COLOR};word-break:break-all;">${escapeHtml(actionUrl)}</a>
    </p>`
    : '';

  const content = `
    <h1 style="margin:0 0 16px 0;font-size:20px;color:#333333;">${escapeHtml(title)}</h1>
    ${greeting}
    ${bodyBlock}
    ${ctaBlock}`;

  const greetingText = recipientName ? `Hallo ${recipientName},\n\n` : '';
  const bodyText = body ? `${body}\n\n` : '';
  const ctaText = actionUrl ? `${actionLabel}: ${actionUrl}\n\n` : '';

  const text = `${title}

${greetingText}${bodyText}${ctaText}--
${BRAND.name} — KI-Werkzeuge für Grüne
${PRIMARY_URL}`;

  return { html: baseLayout(content), text };
}

// ----- Rich board notification template -----

export interface BoardNotificationTemplateParams {
  recipientName?: string;
  /** The notification headline, e.g. "Moritz hat dir eine Aufgabe zugewiesen". */
  title: string;
  actionUrl?: string | null;
  actionLabel?: string;
  cardTitle?: string | null;
  boardTitle?: string | null;
  descriptionSnippet?: string | null;
  statusLabel?: string | null;
  statusColor?: string | null;
  dueDate?: string | null;
  assigneeNames?: string[];
  labelNames?: string[];
  /** Full comment text / attachment filename — the "what happened" line. */
  eventText?: string | null;
}

export function renderBoardNotificationTemplate(params: BoardNotificationTemplateParams): {
  html: string;
  text: string;
} {
  const {
    recipientName,
    title,
    actionUrl,
    actionLabel = 'Aufgabe öffnen',
    cardTitle,
    boardTitle,
    descriptionSnippet,
    statusLabel,
    statusColor,
    dueDate,
    assigneeNames = [],
    labelNames = [],
    eventText,
  } = params;

  const chips: string[] = [];
  const chipColors: (string | undefined)[] = [];
  if (boardTitle) {
    chips.push(boardTitle);
    chipColors.push(undefined);
  }
  if (dueDate) {
    chips.push(`Fällig ${formatDueDate(dueDate)}`);
    chipColors.push(undefined);
  }
  if (statusLabel) {
    chips.push(statusLabel);
    chipColors.push(statusColor ?? undefined);
  }
  if (assigneeNames.length) {
    chips.push(
      assigneeNames.length <= 2 ? assigneeNames.join(', ') : `${assigneeNames.length} Personen`
    );
    chipColors.push(undefined);
  }
  for (const label of labelNames) {
    chips.push(label);
    chipColors.push(undefined);
  }

  const previewCard = renderResourcePreviewCard({
    title: cardTitle || boardTitle || 'Aufgabe',
    chips,
    chipColors,
    snippet: descriptionSnippet ?? null,
    eventLine: eventText ?? null,
  });

  const greeting = recipientName
    ? `<p style="margin:0 0 16px 0;font-size:15px;color:#555555;line-height:1.6;">Hallo ${escapeHtml(recipientName)},</p>`
    : '';

  const content = `
    <h1 style="margin:0 0 16px 0;font-size:20px;color:#333333;">${escapeHtml(title)}</h1>
    ${greeting}
    ${previewCard}
    ${actionUrl ? renderCtaBlock(actionUrl, actionLabel) : ''}`;

  const textChips = chips.length ? `${chips.join(' · ')}\n` : '';
  const text = `${title}

${recipientName ? `Hallo ${recipientName},\n\n` : ''}${cardTitle || boardTitle || 'Aufgabe'}
${textChips}${descriptionSnippet ? `${descriptionSnippet}\n` : ''}${eventText ? `\n${eventText}\n` : ''}${
    actionUrl ? `\n${actionLabel}: ${actionUrl}\n` : ''
  }
--
${BRAND.name} — KI-Werkzeuge für Grüne
${PRIMARY_URL}`;

  return { html: baseLayout(content), text };
}

// ----- Rich document notification template (permission changed / revoked / group share) -----

export interface DocumentNotificationTemplateParams {
  recipientName?: string;
  title: string;
  /** The explanatory sentence (e.g. "Dein Zugriff auf X wurde entfernt"). */
  body?: string | null;
  actionUrl?: string | null;
  actionLabel?: string;
  docTitle?: string | null;
  actorName?: string | null;
  permissionLabel?: string | null;
  previewSnippet?: string | null;
}

export function renderDocumentNotificationTemplate(params: DocumentNotificationTemplateParams): {
  html: string;
  text: string;
} {
  const {
    recipientName,
    title,
    body,
    actionUrl,
    actionLabel = 'Dokument öffnen',
    docTitle,
    actorName,
    permissionLabel,
    previewSnippet,
  } = params;

  const chips: string[] = [];
  if (actorName) chips.push(`von ${actorName}`);
  if (permissionLabel) chips.push(permissionLabel);

  const previewCard = renderResourcePreviewCard({
    title: docTitle || 'Dokument',
    chips,
    snippet: previewSnippet ?? null,
  });

  const greeting = recipientName
    ? `<p style="margin:0 0 16px 0;font-size:15px;color:#555555;line-height:1.6;">Hallo ${escapeHtml(recipientName)},</p>`
    : '';

  const bodyBlock = body
    ? `<p style="margin:0 0 20px 0;font-size:15px;color:#555555;line-height:1.6;">${escapeHtml(body)}</p>`
    : '';

  const content = `
    <h1 style="margin:0 0 16px 0;font-size:20px;color:#333333;">${escapeHtml(title)}</h1>
    ${greeting}
    ${bodyBlock}
    ${previewCard}
    ${actionUrl ? renderCtaBlock(actionUrl, actionLabel) : ''}`;

  const textChips = chips.length ? `${chips.join(' · ')}\n` : '';
  const text = `${title}

${recipientName ? `Hallo ${recipientName},\n\n` : ''}${body ? `${body}\n\n` : ''}${docTitle || 'Dokument'}
${textChips}${previewSnippet ? `${previewSnippet}\n` : ''}${
    actionUrl ? `\n${actionLabel}: ${actionUrl}\n` : ''
  }
--
${BRAND.name} — KI-Werkzeuge für Grüne
${PRIMARY_URL}`;

  return { html: baseLayout(content), text };
}

export interface ContentSyncSourceResult {
  name: string;
  status: 'success' | 'failed';
  stored: number;
  updated: number;
  skipped: number;
  errors: number;
  duration: number;
  error?: string;
}

export interface ContentSyncTemplateParams {
  timestamp: string;
  totalDuration: number;
  sources: ContentSyncSourceResult[];
  totals: {
    sources: number;
    succeeded: number;
    failed: number;
    stored: number;
    updated: number;
    skipped: number;
    errors: number;
  };
  runUrl?: string | undefined;
  dryRun: boolean;
}

export function renderContentSyncTemplate(params: ContentSyncTemplateParams): {
  html: string;
  text: string;
} {
  const { sources, totals, totalDuration, runUrl, dryRun } = params;

  const hasFailures = totals.failed > 0 || totals.errors > 0;
  const statusIcon = hasFailures ? '⚠️' : '✅';
  const title = dryRun ? 'Content Sync — Dry Run' : 'Content Sync Report';

  const dateStr = new Date(params.timestamp).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Berlin',
  });

  const sourceRows = sources
    .map((s) => {
      const icon = s.status === 'success' ? '✅' : '❌';
      const bgColor = s.status === 'failed' ? '#fff5f5' : 'transparent';
      return `<tr style="background-color:${bgColor};">
        <td style="padding:8px 12px;border:1px solid #e5e5e5;">${icon} ${escapeHtml(s.name)}</td>
        <td style="padding:8px 12px;border:1px solid #e5e5e5;text-align:right;font-weight:${s.stored > 0 ? '700' : '400'};">${s.stored}</td>
        <td style="padding:8px 12px;border:1px solid #e5e5e5;text-align:right;">${s.updated}</td>
        <td style="padding:8px 12px;border:1px solid #e5e5e5;text-align:right;">${s.skipped}</td>
        <td style="padding:8px 12px;border:1px solid #e5e5e5;text-align:right;${s.errors > 0 ? 'color:#c00;font-weight:700;' : ''}">${s.errors}</td>
        <td style="padding:8px 12px;border:1px solid #e5e5e5;text-align:right;">${s.duration}s</td>
      </tr>${s.error ? `<tr style="background-color:#fff5f5;"><td colspan="6" style="padding:4px 12px;border:1px solid #e5e5e5;color:#c00;font-size:13px;">Fehler: ${escapeHtml(s.error)}</td></tr>` : ''}`;
    })
    .join('\n');

  const content = `
    <h1 style="margin:0 0 8px 0;font-size:20px;color:#333333;">${statusIcon} ${title}</h1>
    <p style="margin:0 0 24px 0;font-size:14px;color:#888888;">${dateStr} &middot; Dauer: ${totalDuration}s</p>

    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:24px;font-size:14px;">
      <tr>
        <td style="padding:6px 0;color:#555555;">Quellen</td>
        <td style="padding:6px 0;color:#333333;font-weight:600;text-align:right;">${totals.sources} (${totals.succeeded} ok, ${totals.failed} fehlgeschlagen)</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:#555555;">Neue Dokumente</td>
        <td style="padding:6px 0;color:${PRIMARY_COLOR};font-weight:700;text-align:right;font-size:16px;">+${totals.stored}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:#555555;">Aktualisiert</td>
        <td style="padding:6px 0;color:#333333;text-align:right;">${totals.updated}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:#555555;">&Uuml;bersprungen</td>
        <td style="padding:6px 0;color:#333333;text-align:right;">${totals.skipped}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:#555555;">Fehler</td>
        <td style="padding:6px 0;color:${totals.errors > 0 ? '#c00' : '#333333'};font-weight:${totals.errors > 0 ? '700' : '400'};text-align:right;">${totals.errors}</td>
      </tr>
    </table>

    <h2 style="margin:0 0 12px 0;font-size:16px;color:#333333;">Details pro Quelle</h2>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:24px;">
      <tr style="background-color:#f8f8f8;">
        <th style="padding:8px 12px;border:1px solid #e5e5e5;text-align:left;">Quelle</th>
        <th style="padding:8px 12px;border:1px solid #e5e5e5;text-align:right;">Neu</th>
        <th style="padding:8px 12px;border:1px solid #e5e5e5;text-align:right;">Update</th>
        <th style="padding:8px 12px;border:1px solid #e5e5e5;text-align:right;">&Uuml;berspr.</th>
        <th style="padding:8px 12px;border:1px solid #e5e5e5;text-align:right;">Fehler</th>
        <th style="padding:8px 12px;border:1px solid #e5e5e5;text-align:right;">Dauer</th>
      </tr>
      ${sourceRows}
      <tr style="background-color:#f0f0f0;font-weight:600;">
        <td style="padding:8px 12px;border:1px solid #e5e5e5;">Gesamt</td>
        <td style="padding:8px 12px;border:1px solid #e5e5e5;text-align:right;">${totals.stored}</td>
        <td style="padding:8px 12px;border:1px solid #e5e5e5;text-align:right;">${totals.updated}</td>
        <td style="padding:8px 12px;border:1px solid #e5e5e5;text-align:right;">${totals.skipped}</td>
        <td style="padding:8px 12px;border:1px solid #e5e5e5;text-align:right;">${totals.errors}</td>
        <td style="padding:8px 12px;border:1px solid #e5e5e5;text-align:right;">${totalDuration}s</td>
      </tr>
    </table>

    ${
      runUrl
        ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
      <tr>
        <td style="background-color:${PRIMARY_COLOR};border-radius:6px;">
          <a href="${escapeHtml(runUrl)}" style="display:inline-block;padding:10px 24px;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">
            Workflow-Log ansehen
          </a>
        </td>
      </tr>
    </table>`
        : ''
    }`;

  // Plain text version
  const sourceLines = sources
    .map((s) => {
      const icon = s.status === 'success' ? '✓' : '✗';
      const line = `  ${icon} ${s.name}: +${s.stored} neu, ${s.updated} aktualisiert, ${s.skipped} übersprungen, ${s.errors} Fehler (${s.duration}s)`;
      return s.error ? `${line}\n    Fehler: ${s.error}` : line;
    })
    .join('\n');

  const text = `${statusIcon} ${title}
${dateStr} · Dauer: ${totalDuration}s

Quellen: ${totals.sources} (${totals.succeeded} ok, ${totals.failed} fehlgeschlagen)
Neue Dokumente: +${totals.stored}
Aktualisiert: ${totals.updated}
Übersprungen: ${totals.skipped}
Fehler: ${totals.errors}

Details:
${sourceLines}
${runUrl ? `\nWorkflow-Log: ${runUrl}` : ''}
--
${BRAND.name} — KI-Werkzeuge für Grüne
${PRIMARY_URL}`;

  return { html: baseLayout(content), text };
}

import { type NewArticle } from '../scrapers/implementations/LandesverbandScraper/types.js';

export interface LvSyncNotificationTemplateParams {
  lvName: string;
  newArticles: NewArticle[];
  syncDate: string;
}

export function renderLvSyncNotificationTemplate(params: LvSyncNotificationTemplateParams): {
  html: string;
  text: string;
} {
  const { lvName, newArticles, syncDate } = params;

  const dateStr = new Date(syncDate).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Berlin',
  });

  const typeLabels: Record<string, string> = {
    presse: 'Presse',
    beschluss: 'Beschluss',
    antrag: 'Antrag',
    blog: 'Blog',
    wahlprogramm: 'Wahlprogramm',
  };

  const articleRows = newArticles
    .map(
      (a) =>
        `<tr>
          <td style="padding:6px 12px;border:1px solid #e5e5e5;">
            <a href="${escapeHtml(a.url)}" style="color:${PRIMARY_COLOR};text-decoration:none;">${escapeHtml(a.title)}</a>
          </td>
          <td style="padding:6px 12px;border:1px solid #e5e5e5;text-align:center;font-size:12px;color:#888;">${escapeHtml(typeLabels[a.type] || a.type)}</td>
        </tr>`
    )
    .join('\n');

  const content = `
    <h1 style="margin:0 0 8px 0;font-size:20px;color:#333333;">Neue Inhalte indexiert</h1>
    <p style="margin:0 0 24px 0;font-size:14px;color:#888888;">${escapeHtml(lvName)} &middot; ${dateStr}</p>
    <p style="margin:0 0 16px 0;font-size:15px;color:#555555;line-height:1.6;">
      Beim letzten Content-Sync wurden <strong>${newArticles.length} neue Artikel</strong> f&uuml;r ${escapeHtml(lvName)} indexiert:
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:24px;">
      <tr style="background-color:#f8f8f8;">
        <th style="padding:6px 12px;border:1px solid #e5e5e5;text-align:left;">Artikel</th>
        <th style="padding:6px 12px;border:1px solid #e5e5e5;text-align:center;">Typ</th>
      </tr>
      ${articleRows}
    </table>
    <p style="margin:0;font-size:13px;color:#888888;">
      Diese Artikel sind jetzt im ${escapeHtml(BRAND.name)} durchsuchbar.
    </p>`;

  const articleLines = newArticles
    .map((a) => `  - ${a.title} (${typeLabels[a.type] || a.type})\n    ${a.url}`)
    .join('\n');

  const text = `Neue Inhalte indexiert — ${lvName}
${dateStr}

Beim letzten Content-Sync wurden ${newArticles.length} neue Artikel für ${lvName} indexiert:

${articleLines}

Diese Artikel sind jetzt im ${BRAND.name} durchsuchbar.

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
