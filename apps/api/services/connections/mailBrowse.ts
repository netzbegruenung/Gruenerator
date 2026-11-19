/**
 * Postfächer (Gmail, Outlook) im Dateibrowser des Chats: Ordner bzw. Labels
 * oben, darunter die neuesten Mails; mit Suche beim Anbieter. Eine Mail ist
 * ein Eintrag wie eine Datei, gelesen wird sie erst beim Senden
 * (`connectRetrieval` → `readMailAsText`).
 */
import { type DriveEntry } from '@gruenerator/contracts';

import * as gmailClient from '../api-clients/gmailClient.js';
import { type MailMessageSummary, type MailMessageText } from '../api-clients/mailTypes.js';
import * as outlookMailClient from '../api-clients/outlookMailClient.js';

import type { DriveFolder } from './driveBrowse.js';

export type MailProvider = 'google-mail' | 'microsoft-mail';

export const MAIL_MIME_TYPE = 'message/rfc822';

export const isMailProvider = (provider: string): provider is MailProvider =>
  provider === 'google-mail' || provider === 'microsoft-mail';

const folderEntry = (id: string, name: string): DriveEntry => ({
  id,
  name,
  isFolder: true,
  mimeType: null,
  size: null,
  isSupported: false,
});

const shortDate = (iso: string | null): string =>
  iso
    ? new Date(iso).toLocaleDateString('de-DE', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'Europe/Berlin',
      })
    : '';

/** „Betreff — Absender · 12. Nov. 2026“, Absender ohne Adresse. */
export function mailEntryName(m: MailMessageSummary): string {
  const sender = m.from.replace(/\s*<[^>]*>\s*$/, '').replace(/^"|"$/g, '') || m.from;
  const parts = [m.subject.trim() || '(kein Betreff)', sender].filter(Boolean).join(' — ');
  const date = shortDate(m.receivedAt);
  return date ? `${parts} · ${date}` : parts;
}

const mailEntry = (m: MailMessageSummary): DriveEntry => ({
  id: m.id,
  name: mailEntryName(m),
  isFolder: false,
  mimeType: MAIL_MIME_TYPE,
  size: null,
  isSupported: true,
});

/**
 * Ohne Ordner und ohne Suche: die Ordnerliste. Mit Suche: Treffer im Ordner
 * oder, auf der obersten Ebene, im ganzen Postfach.
 */
export async function browseMail(
  provider: MailProvider,
  accessToken: string,
  folderId?: string,
  query?: string
): Promise<DriveFolder> {
  if (!folderId && !query) {
    const folders =
      provider === 'google-mail'
        ? await gmailClient.listLabels(accessToken)
        : await outlookMailClient.listFolders(accessToken);
    return { truncated: false, entries: folders.map((f) => folderEntry(f.id, f.name)) };
  }
  const scope = { ...(query ? { query } : {}) };
  const result =
    provider === 'google-mail'
      ? await gmailClient.listMessages(accessToken, {
          ...scope,
          ...(folderId ? { labelId: folderId } : {}),
        })
      : await outlookMailClient.listMessages(accessToken, {
          ...scope,
          ...(folderId ? { folderId } : {}),
        });
  return { truncated: result.truncated, entries: result.messages.map(mailEntry) };
}

/** Kopfzeilen plus Text, so wie das Modell die Mail als Material sieht. */
export function formatMailText(m: MailMessageText): string {
  const lines = [
    `Betreff: ${m.subject || '(kein Betreff)'}`,
    `Von: ${m.from}`,
    m.to.length > 0 ? `An: ${m.to.join(', ')}` : null,
    m.cc.length > 0 ? `Cc: ${m.cc.join(', ')}` : null,
    m.date ? `Datum: ${shortDate(m.date)}` : null,
  ].filter((l): l is string => l !== null);
  return `${lines.join('\n')}\n\n${m.body.trim()}`;
}

export async function readMailAsText(
  provider: MailProvider,
  accessToken: string,
  messageId: string
): Promise<string> {
  const message =
    provider === 'google-mail'
      ? await gmailClient.getMessageText(accessToken, messageId)
      : await outlookMailClient.getMessageText(accessToken, messageId);
  return formatMailText(message);
}
