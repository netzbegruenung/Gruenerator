/**
 * Gmail-Postfach, Scope `gmail.readonly`. Nur lesen: Labels, Mails eines
 * Labels, Suche, eine Mail als Text.
 *
 * `gmail.readonly` ist bei Google ein „restricted scope“: bis zur Prüfung durch
 * Google nur für eingetragene Testnutzer*innen (höchstens 100).
 */
import axios from 'axios';
import { z } from 'zod';

import { htmlToStructuredText } from '../scrapers/utils/htmlCleaner.js';

import { type MailMessageSummary, type MailMessageText } from './mailTypes.js';

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

/** Nachrichten-IDs sind hex, Label-IDs `INBOX` oder `Label_123`. */
const GMAIL_ID = /^[A-Za-z0-9_-]+$/;

function validateId(id: string, label: string): string {
  if (!GMAIL_ID.test(id)) throw new Error(`Invalid ${label} format`);
  return id;
}

const headers = (token: string) => ({ Authorization: `Bearer ${token}` });

/** System-Labels, die als Ordner taugen, in dieser Reihenfolge. */
const SYSTEM_LABELS: Record<string, string> = {
  INBOX: 'Posteingang',
  STARRED: 'Markiert',
  IMPORTANT: 'Wichtig',
  SENT: 'Gesendet',
};

const labelListSchema = z.object({
  labels: z
    .array(z.object({ id: z.string(), name: z.string(), type: z.string().optional() }))
    .optional(),
});

export interface GmailLabel {
  id: string;
  name: string;
}

export async function listLabels(token: string): Promise<GmailLabel[]> {
  const response = await axios.get(`${GMAIL_API}/labels`, { headers: headers(token) });
  const labels = labelListSchema.parse(response.data).labels ?? [];
  const system = Object.entries(SYSTEM_LABELS)
    .filter(([id]) => labels.some((l) => l.id === id))
    .map(([id, name]) => ({ id, name }));
  const own = labels
    .filter((l) => l.type === 'user')
    .map((l) => ({ id: l.id, name: l.name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  return [...system, ...own];
}

const messageIdListSchema = z.object({
  messages: z.array(z.object({ id: z.string() })).optional(),
  nextPageToken: z.string().optional(),
});

const headerSchema = z.object({ name: z.string(), value: z.string() });

interface GmailPart {
  mimeType?: string | undefined;
  headers?: z.infer<typeof headerSchema>[] | undefined;
  body?: { data?: string | undefined } | undefined;
  parts?: GmailPart[] | undefined;
}
const partSchema: z.ZodType<GmailPart> = z.lazy(() =>
  z.object({
    mimeType: z.string().optional(),
    headers: z.array(headerSchema).optional(),
    body: z.object({ data: z.string().optional() }).optional(),
    parts: z.array(partSchema).optional(),
  })
);

const messageSchema = z.object({
  id: z.string(),
  internalDate: z.string().optional(),
  payload: partSchema.optional(),
});

const header = (part: GmailPart | undefined, name: string): string =>
  part?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';

const isoFromInternalDate = (ms: string | undefined): string | null => {
  const n = ms ? Number(ms) : NaN;
  return Number.isFinite(n) ? new Date(n).toISOString() : null;
};

export const MAIL_LIST_LIMIT = 30;
/** Gmail liefert in der Liste nur IDs; die Kopfzeilen kommen je Mail. */
const METADATA_CONCURRENCY = 10;

/** Die neuesten Mails eines Labels, oder Treffer einer Gmail-Suche. */
export async function listMessages(
  token: string,
  { labelId, query }: { labelId?: string; query?: string }
): Promise<{ messages: MailMessageSummary[]; truncated: boolean }> {
  const response = await axios.get(`${GMAIL_API}/messages`, {
    headers: headers(token),
    params: {
      maxResults: MAIL_LIST_LIMIT,
      ...(labelId ? { labelIds: validateId(labelId, 'label ID') } : {}),
      ...(query ? { q: query } : {}),
    },
  });
  const list = messageIdListSchema.parse(response.data);
  const ids = (list.messages ?? []).map((m) => m.id);

  const messages: MailMessageSummary[] = [];
  for (let i = 0; i < ids.length; i += METADATA_CONCURRENCY) {
    const batch = await Promise.all(
      ids.slice(i, i + METADATA_CONCURRENCY).map(async (id) => {
        const r = await axios.get(`${GMAIL_API}/messages/${validateId(id, 'message ID')}`, {
          headers: headers(token),
          params: { format: 'metadata', metadataHeaders: ['Subject', 'From'] },
          paramsSerializer: { indexes: null },
        });
        const m = messageSchema.parse(r.data);
        return {
          id: m.id,
          subject: header(m.payload, 'Subject'),
          from: header(m.payload, 'From'),
          receivedAt: isoFromInternalDate(m.internalDate),
        };
      })
    );
    messages.push(...batch);
  }
  return { messages, truncated: Boolean(list.nextPageToken) };
}

const decode = (data: string | undefined) =>
  data ? Buffer.from(data, 'base64url').toString('utf8') : '';

/** Erster Teil mit diesem Typ und Inhalt (Anhänge tragen statt `data` eine `attachmentId`). */
function findPart(part: GmailPart | undefined, mimeType: string): GmailPart | null {
  if (!part) return null;
  if (part.mimeType === mimeType && part.body?.data) return part;
  for (const child of part.parts ?? []) {
    const found = findPart(child, mimeType);
    if (found) return found;
  }
  return null;
}

/** Eine Mail als Text: `text/plain`, sonst `text/html` ohne Markup. */
export async function getMessageText(token: string, messageId: string): Promise<MailMessageText> {
  const response = await axios.get(`${GMAIL_API}/messages/${validateId(messageId, 'message ID')}`, {
    headers: headers(token),
    params: { format: 'full' },
  });
  const m = messageSchema.parse(response.data);
  const plain = findPart(m.payload, 'text/plain');
  const html = plain ? null : findPart(m.payload, 'text/html');
  const body = plain
    ? decode(plain.body?.data)
    : html
      ? htmlToStructuredText(decode(html.body?.data))
      : '';
  const list = (name: string) =>
    header(m.payload, name)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  return {
    subject: header(m.payload, 'Subject'),
    from: header(m.payload, 'From'),
    to: list('To'),
    cc: list('Cc'),
    date: isoFromInternalDate(m.internalDate),
    body,
  };
}
