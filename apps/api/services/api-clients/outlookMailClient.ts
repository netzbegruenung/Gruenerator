/**
 * Outlook-Postfach über Microsoft Graph, Scope `Mail.Read` (delegiert, auch
 * für private Outlook.com-Konten). Nur lesen: Ordner, Mails eines Ordners,
 * Suche, eine Mail als Text.
 */
import axios from 'axios';
import { z } from 'zod';

import { type MailMessageSummary, type MailMessageText } from './mailTypes.js';

const GRAPH_API = 'https://graph.microsoft.com/v1.0';

/** Graph-Kennungen für Mails und Ordner sind URL-sicheres Base64. */
const GRAPH_MAIL_ID = /^[A-Za-z0-9=_-]+$/;

function validateId(id: string, label: string): string {
  if (!GRAPH_MAIL_ID.test(id)) throw new Error(`Invalid ${label} format`);
  return id;
}

const headers = (token: string) => ({ Authorization: `Bearer ${token}` });

const addressSchema = z.object({
  emailAddress: z.object({ name: z.string().nullish(), address: z.string().nullish() }),
});
type Address = z.infer<typeof addressSchema>;

const formatAddress = (a: Address | null | undefined): string => {
  const { name, address } = a?.emailAddress ?? {};
  if (name && address && name !== address) return `${name} <${address}>`;
  return name || address || '';
};

const folderListSchema = z.object({
  value: z.array(z.object({ id: z.string(), displayName: z.string() })),
});

export interface OutlookFolder {
  id: string;
  name: string;
}

export async function listFolders(token: string): Promise<OutlookFolder[]> {
  const response = await axios.get(`${GRAPH_API}/me/mailFolders`, {
    headers: headers(token),
    params: { $select: 'id,displayName', $top: 100 },
  });
  return folderListSchema
    .parse(response.data)
    .value.map((f) => ({ id: f.id, name: f.displayName }));
}

const messageSummarySchema = z.object({
  id: z.string(),
  subject: z.string().nullish(),
  from: addressSchema.nullish(),
  receivedDateTime: z.string().nullish(),
});
const messageListSchema = z.object({
  value: z.array(messageSummarySchema),
  '@odata.nextLink': z.string().optional(),
});

export const MAIL_LIST_LIMIT = 50;

/**
 * Die neuesten Mails eines Ordners, oder Treffer einer Suche (`$search`, im
 * Ordner oder im ganzen Postfach). `$search` erlaubt kein `$orderby`; Graph
 * sortiert Treffer dann selbst nach Datum.
 */
export async function listMessages(
  token: string,
  { folderId, query }: { folderId?: string; query?: string }
): Promise<{ messages: MailMessageSummary[]; truncated: boolean }> {
  const base = folderId
    ? `${GRAPH_API}/me/mailFolders/${validateId(folderId, 'folder ID')}/messages`
    : `${GRAPH_API}/me/messages`;
  const params: Record<string, string | number> = {
    $select: 'id,subject,from,receivedDateTime',
    $top: MAIL_LIST_LIMIT,
  };
  // KQL in Anführungszeichen; ein Anführungszeichen in der Eingabe würde sie beenden.
  if (query) params.$search = `"${query.replace(/["\\]/g, ' ')}"`;
  else params.$orderby = 'receivedDateTime desc';
  const response = await axios.get(base, { headers: headers(token), params });
  const parsed = messageListSchema.parse(response.data);
  return {
    truncated: Boolean(parsed['@odata.nextLink']),
    messages: parsed.value.map((m) => ({
      id: m.id,
      subject: m.subject ?? '',
      from: formatAddress(m.from),
      receivedAt: m.receivedDateTime ?? null,
    })),
  };
}

const messageSchema = z.object({
  subject: z.string().nullish(),
  from: addressSchema.nullish(),
  toRecipients: z.array(addressSchema).nullish(),
  ccRecipients: z.array(addressSchema).nullish(),
  receivedDateTime: z.string().nullish(),
  body: z.object({ content: z.string().nullish() }).nullish(),
});

/** Eine Mail mit Text-Body (`Prefer: outlook.body-content-type="text"`). */
export async function getMessageText(token: string, messageId: string): Promise<MailMessageText> {
  const response = await axios.get(
    `${GRAPH_API}/me/messages/${validateId(messageId, 'message ID')}`,
    {
      headers: { ...headers(token), Prefer: 'outlook.body-content-type="text"' },
      params: { $select: 'subject,from,toRecipients,ccRecipients,receivedDateTime,body' },
    }
  );
  const m = messageSchema.parse(response.data);
  return {
    subject: m.subject ?? '',
    from: formatAddress(m.from),
    to: (m.toRecipients ?? []).map(formatAddress).filter(Boolean),
    cc: (m.ccRecipients ?? []).map(formatAddress).filter(Boolean),
    date: m.receivedDateTime ?? null,
    body: m.body?.content ?? '',
  };
}
