/**
 * Die nuudel-Umfragen einer Person: anlegen, ändern und löschen (jeweils nach
 * der Freigabe des Werkzeugs im Chat), auflisten, Ergebnis lesen, aus der
 * Liste entfernen.
 *
 * Absender bei nuudel ist die Person selbst, mit Name und Adresse ihres Kontos:
 * nuudel schickt ihr Teilnahme- und Admin-Link. Eine Adresse aus dem Chat
 * nimmt der Weg nie entgegen.
 */
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { deliverableContactOf } from '../user/accountContact.js';
import { FormStepError, OrderRefused } from '../webForms/formClient.js';

import {
  NUUDEL_DEFAULT_URL,
  adminUrl,
  createNuudelPoll,
  deleteNuudelPoll,
  editNuudelPoll,
  nuudelBaseUrl,
  pollUrl,
  readNuudelAdmin,
  readNuudelResults,
  sameSlot,
  type AdminState,
  type PollDay,
  type PollEdit,
  type PollResults,
  type PollSlot,
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

async function adminIdOf(userId: string, poll: OwnPoll): Promise<string> {
  const rows = (await getPostgresInstance().query(
    `SELECT admin_id FROM nuudel_polls WHERE user_id = $1 AND id = $2`,
    [userId, poll.id]
  )) as { admin_id: string }[];
  if (!rows[0]) throw new OrderRefused('Diese Umfrage gehört nicht zu deinem Konto.');
  return rows[0].admin_id;
}

export async function readOwnPollResults(userId: string, poll: OwnPoll): Promise<PollResults> {
  const base = requireBase();
  return readNuudelResults(await adminIdOf(userId, poll), base);
}

const slotLabel = (s: PollSlot) => `${s.day}${s.time ? ` ${s.time}` : ''}`;

/**
 * Die Stimmen je zu entfernendem Termin. Spalten im CSV und auf der
 * Admin-Seite stehen in derselben Reihenfolge; passt die Zahl nicht, zählt
 * jede abgegebene Stimme der Umfrage, damit nichts ungefragt verschwindet.
 */
export function votesOnSlots(
  state: AdminState,
  results: PollResults,
  remove: PollSlot[]
): { slot: PollSlot; votes: number }[] {
  const aligned = results.options.length === state.slots.length;
  return remove.map((slot) => {
    const i = state.slots.findIndex((s) => sameSlot(s, slot));
    const votes = aligned
      ? results.participants.filter((p) => p.answers[i] != null).length
      : results.participants.filter((p) => p.answers.some((a) => a != null)).length;
    return { slot, votes };
  });
}

/**
 * Prüft Entfernen und Hinzufügen gegen die Termine der Seite, bevor nuudel
 * etwas löscht. Gezählt wird, was danach wirklich dasteht: `editNuudelPoll`
 * überspringt einen schon vorhandenen Termin beim Hinzufügen, entfernt ihn aber,
 * wenn er auch in `removeSlots` steht — ohne diese Prüfung ging so der letzte
 * Termin verloren.
 */
export function assertSlotEdit(
  slots: PollSlot[],
  removeSlots: PollSlot[],
  addSlots: PollSlot[]
): void {
  const unknown = removeSlots.filter((r) => !slots.some((s) => sameSlot(s, r)));
  if (unknown.length > 0) {
    throw new OrderRefused(
      `Diese Termine gibt es in der Umfrage nicht: ${unknown.map(slotLabel).join(', ')}. Vorhanden: ${slots.map(slotLabel).join(', ')}.`
    );
  }
  const both = addSlots.filter((a) => removeSlots.some((r) => sameSlot(a, r)));
  if (both.length > 0) {
    throw new OrderRefused(
      `Diese Termine sollen zugleich hinzukommen und wegfallen: ${both.map(slotLabel).join(', ')}. Nichts wurde geändert.`
    );
  }
  const kept = slots.filter((s) => !removeSlots.some((r) => sameSlot(s, r)));
  const added = addSlots.filter(
    (a, i) => !slots.some((s) => sameSlot(s, a)) && addSlots.findIndex((b) => sameSlot(a, b)) === i
  );
  if (kept.length + added.length < 1) {
    throw new OrderRefused('Eine Umfrage braucht mindestens einen Termin.');
  }
}

/**
 * Ändert eine eigene Umfrage. Termine gibt es nur bei Terminumfragen (die
 * Spalten einer Auswahl sind nicht gemessen). Einen Termin, auf den schon
 * jemand geantwortet hat, entfernt der Weg nur mit `discardVotes`: nuudel
 * löscht die Stimmen mit der Spalte, ohne Weg zurück.
 */
export async function editOwnPoll(
  userId: string,
  poll: OwnPoll,
  edit: PollEdit,
  opts: { discardVotes: boolean }
): Promise<AdminState> {
  const base = requireBase();
  const adminId = await adminIdOf(userId, poll);
  const touchesSlots = Boolean(edit.addSlots?.length || edit.removeSlots?.length);
  if (touchesSlots && poll.kind !== 'date') {
    throw new OrderRefused(
      'Bei einer Auswahl-Umfrage kann der Grünerator die Optionen nicht ändern; das geht über den Admin-Link.'
    );
  }
  if (edit.removeSlots?.length) {
    const state = await readNuudelAdmin(adminId, base);
    assertSlotEdit(state.slots, edit.removeSlots, edit.addSlots ?? []);
    if (!opts.discardVotes) {
      const results = await readNuudelResults(adminId, base);
      const atStake = votesOnSlots(state, results, edit.removeSlots).filter((v) => v.votes > 0);
      if (atStake.length > 0) {
        throw new OrderRefused(
          `Auf diese Termine wurde schon abgestimmt: ${atStake.map((v) => `${slotLabel(v.slot)} (${v.votes} ${v.votes === 1 ? 'Antwort' : 'Antworten'})`).join(', ')}. Beim Entfernen löscht nuudel diese Antworten endgültig. Nichts wurde geändert.`
        );
      }
    }
  }
  const after = await editNuudelPoll(adminId, edit, base);
  if (after.title !== poll.title) {
    await getPostgresInstance().query(
      `UPDATE nuudel_polls SET title = $3 WHERE user_id = $1 AND id = $2`,
      [userId, poll.id, after.title]
    );
  }
  return after;
}

/**
 * Löscht eine eigene Umfrage bei nuudel und nimmt sie aus der Liste. Ist sie
 * bei nuudel schon weg (abgelaufen), verschwindet nur der Eintrag.
 */
export async function deleteOwnPoll(userId: string, poll: OwnPoll): Promise<'deleted' | 'gone'> {
  const base = requireBase();
  const adminId = await adminIdOf(userId, poll);
  let outcome: 'deleted' | 'gone' = 'deleted';
  try {
    await deleteNuudelPoll(adminId, base);
  } catch (err) {
    if (!(err instanceof FormStepError && err.step === 'gone')) throw err;
    outcome = 'gone';
  }
  await forgetPoll(userId, poll.id);
  return outcome;
}
