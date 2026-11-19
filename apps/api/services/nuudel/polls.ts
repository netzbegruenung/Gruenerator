/**
 * Die nuudel-Umfragen einer Person: anlegen (nach der Freigabe des Werkzeugs
 * im Chat), auflisten, Ergebnis lesen, aus der Liste entfernen.
 *
 * Absender bei nuudel ist die Person selbst, mit Name und Adresse ihres Kontos:
 * nuudel schickt ihr Teilnahme- und Admin-Link. Eine Adresse aus dem Chat
 * nimmt der Weg nie entgegen.
 */
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { deliverableContactOf } from '../user/accountContact.js';
import { OrderRefused } from '../webForms/formClient.js';

import {
  NUUDEL_DEFAULT_URL,
  adminUrl,
  createNuudelPoll,
  nuudelBaseUrl,
  pollUrl,
  readNuudelResults,
  type PollDay,
  type PollResults,
} from './client.js';

import type { NuudelPollRow } from '../../database/schema/nuudelPolls.js';

/** Jede Umfrage ist echt und öffentlich erreichbar; die Grenze hält Versehen und Schleifen klein. */
export const MAX_POLLS_PER_DAY = 10;

export type PollOrder = {
  title: string;
  description: string | null;
  endDate: string | null;
} & ({ kind: 'date'; days: PollDay[] } | { kind: 'classic'; options: string[] });

export interface OwnPoll {
  id: string;
  kind: 'date' | 'classic';
  title: string;
  pollUrl: string;
  adminUrl: string;
  createdAt: Date;
}

type Row = Pick<NuudelPollRow, 'id' | 'kind' | 'title' | 'poll_id' | 'admin_id' | 'created_at'>;

function toOwnPoll(row: Row, base: string): OwnPoll {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    pollUrl: pollUrl(base, row.poll_id),
    adminUrl: adminUrl(base, row.admin_id),
    createdAt: new Date(row.created_at),
  };
}

function requireBase(): string {
  const base = nuudelBaseUrl();
  if (!base) throw new OrderRefused('nuudel-Umfragen sind hier gerade abgeschaltet.');
  return base;
}

export async function pollsCreatedToday(userId: string): Promise<number> {
  const rows = (await getPostgresInstance().query(
    `SELECT COUNT(*)::int AS n FROM nuudel_polls
     WHERE user_id = $1 AND created_at > NOW() - INTERVAL '24 hours'`,
    [userId]
  )) as { n: number }[];
  return rows[0]?.n ?? 0;
}

export async function orderNuudelPoll(userId: string, order: PollOrder): Promise<OwnPoll> {
  const base = requireBase();
  if ((await pollsCreatedToday(userId)) >= MAX_POLLS_PER_DAY) {
    throw new OrderRefused(
      `Du hast in den letzten 24 Stunden schon ${MAX_POLLS_PER_DAY} Umfragen über den Grünerator angelegt.`
    );
  }
  const contact = await deliverableContactOf(userId);
  if (!contact) {
    throw new OrderRefused(
      'Dein Konto hat keine gültige E-Mail-Adresse; nuudel braucht sie für den Admin-Link.'
    );
  }
  const name = `${contact.nameGiven} ${contact.nameFamily}`.trim();
  const created = await createNuudelPoll(
    { ...order, creator: { name, email: contact.email } },
    base
  );
  const rows = (await getPostgresInstance().query(
    `INSERT INTO nuudel_polls (user_id, kind, title, poll_id, admin_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, kind, title, poll_id, admin_id, created_at`,
    [userId, order.kind, order.title, created.pollId, created.adminId]
  )) as Row[];
  return toOwnPoll(rows[0], base);
}

export async function pollsOf(userId: string): Promise<OwnPoll[]> {
  // Abgeschaltet heisst nur „keine neuen": die Links der bestehenden bleiben gültig.
  const base = nuudelBaseUrl() ?? NUUDEL_DEFAULT_URL;
  const rows = (await getPostgresInstance().query(
    `SELECT id, kind, title, poll_id, admin_id, created_at FROM nuudel_polls
     WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  )) as Row[];
  return rows.map((r) => toOwnPoll(r, base));
}

/** Nur aus der Liste — bei nuudel bleibt die Umfrage, bis sie abläuft oder die Person sie löscht. */
export async function forgetPoll(userId: string, id: string): Promise<boolean> {
  const rows = (await getPostgresInstance().query(
    `DELETE FROM nuudel_polls WHERE user_id = $1 AND id = $2 RETURNING id`,
    [userId, id]
  )) as { id: string }[];
  return rows.length > 0;
}

/**
 * Eine eigene Umfrage nach Titel (Teilstück reicht) oder Link; ohne Angabe die
 * jüngste. `null`, wenn nichts passt; mehrere Treffer → die jüngste.
 */
export function pickPoll(polls: OwnPoll[], ref: string | null): OwnPoll | null {
  if (!ref?.trim()) return polls[0] ?? null;
  const needle = ref.trim().toLowerCase();
  return (
    polls.find((p) => p.pollUrl.toLowerCase() === needle || p.id === needle) ??
    polls.find((p) => needle.includes(p.pollUrl.toLowerCase().split('/').pop() ?? '\u0000')) ??
    polls.find((p) => p.title.toLowerCase().includes(needle)) ??
    null
  );
}

export async function readOwnPollResults(userId: string, poll: OwnPoll): Promise<PollResults> {
  const base = requireBase();
  const rows = (await getPostgresInstance().query(
    `SELECT admin_id FROM nuudel_polls WHERE user_id = $1 AND id = $2`,
    [userId, poll.id]
  )) as { admin_id: string }[];
  if (!rows[0]) throw new OrderRefused('Diese Umfrage gehört nicht zu deinem Konto.');
  return readNuudelResults(rows[0].admin_id, base);
}
