import { toError } from '../../utils/errors/index.js';
import { createLogger } from '../../utils/logger.js';
import { sendEmail } from '../email/emailService.js';
import { baseLayout, escapeHtml, PRIMARY_COLOR } from '../email/templates.js';

import type { BriefingAgent, CollectedItem } from './types.js';

const log = createLogger('BriefingDelivery');

function renderBriefingContent(
  agentName: string,
  summary: string,
  items: CollectedItem[],
  period: string
): string {
  const itemsHtml = items
    .slice(0, 20)
    .map(
      (item) => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #eee;">
          <a href="${escapeHtml(item.url)}" style="color:${PRIMARY_COLOR};text-decoration:none;font-weight:600;font-size:14px;">
            ${escapeHtml(item.title || item.url)}
          </a>
          <div style="font-size:12px;color:#888;margin-top:2px;">
            ${escapeHtml(item.source)} &middot; ${escapeHtml(item.sourceType)}${item.publishedAt ? ` &middot; ${new Date(item.publishedAt).toLocaleDateString('de-DE')}` : ''}
          </div>
          ${item.excerpt ? `<div style="font-size:13px;color:#555;margin-top:4px;">${escapeHtml(item.excerpt.slice(0, 200))}${item.excerpt.length > 200 ? '...' : ''}</div>` : ''}
        </td>
      </tr>`
    )
    .join('');

  return `
    <h1 style="margin:0 0 8px 0;font-size:20px;color:#333;">${escapeHtml(agentName)}</h1>
    <p style="margin:0 0 20px 0;font-size:13px;color:#888;">Briefing f&uuml;r ${escapeHtml(period)}</p>
    <div style="background:#f8f9fa;border-left:3px solid ${PRIMARY_COLOR};padding:16px;margin:0 0 24px 0;border-radius:0 4px 4px 0;">
      <h2 style="margin:0 0 8px 0;font-size:15px;color:#333;">Zusammenfassung</h2>
      <div style="font-size:14px;color:#444;line-height:1.6;white-space:pre-wrap;">${escapeHtml(summary)}</div>
    </div>
    ${
      items.length > 0
        ? `
    <h2 style="margin:0 0 12px 0;font-size:15px;color:#333;">Quellen (${items.length})</h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${itemsHtml}</table>`
        : ''
    }`;
}

function renderBriefingText(
  agentName: string,
  summary: string,
  items: CollectedItem[],
  period: string
): string {
  const lines = [
    agentName,
    `Briefing f\u00fcr ${period}`,
    '',
    '--- Zusammenfassung ---',
    summary,
    '',
    `--- Quellen (${items.length}) ---`,
  ];

  for (const item of items.slice(0, 20)) {
    lines.push(`\u2022 ${item.title || item.url}`);
    lines.push(`  ${item.url}`);
    lines.push(`  ${item.source} \u00b7 ${item.sourceType}`);
    lines.push('');
  }

  return lines.join('\n');
}

function getPeriodLabel(timeRange: string): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  return timeRange === 'week' ? `Woche bis ${dateStr}` : dateStr;
}

export async function deliverBriefing(
  agent: BriefingAgent,
  summary: string,
  items: CollectedItem[],
  recipientEmail: string
): Promise<boolean> {
  const period = getPeriodLabel(agent.config.timeRange);
  const content = renderBriefingContent(agent.name, summary, items, period);
  const html = baseLayout(content);
  const text = renderBriefingText(agent.name, summary, items, period);

  const success = await sendEmail({
    to: recipientEmail,
    subject: `${agent.name} \u2014 Briefing ${period}`,
    html,
    text,
  });

  if (success) {
    log.info(`Briefing delivered to ${recipientEmail} for agent ${agent.id}`);
  } else {
    log.error(`Briefing delivery failed for agent ${agent.id}`);
  }

  return success;
}
