/**
 * Eine Umfrage auf nuudel.digitalcourage.de anlegen und ihr Ergebnis lesen.
 *
 * nuudel ist eine Framadate-Instanz von Digitalcourage e.V. und hat keine API,
 * nur einen Assistenten aus drei Formularen in einer PHP-Session (kein Login,
 * kein CSRF, kein Captcha; gemessen am 19.11.2026):
 *
 * 1. `create_poll.php?type=date|autre` — Titel, Beschreibung, Name und E-Mail
 *    (Pflicht: nuudel schickt Teilnahme- und Admin-Link dorthin),
 *    weiter nach `create_date_poll.php` bzw. `create_classic_poll.php`;
 * 2. dort die Termine (`days[]`, `horaires<i>[]`) bzw. Optionen (`choices[]`);
 * 3. auf derselben Seite Ablaufdatum und Bestätigung — die Antwort leitet auf
 *    `/<admin-id>/admin` weiter. Die Admin-ID (24 Zeichen) beginnt mit der
 *    öffentlichen ID (16 Zeichen), dem Teilnahme-Link `/<poll-id>`.
 *
 * Das Ergebnis liegt als CSV unter `exportcsv.php?admin=<admin-id>`. Eine
 * gelöschte oder abgelaufene Umfrage antwortet NICHT mit 404, sondern mit 200
 * und einer HTML-Seite „… existiert nicht!".
 *
 * Felder und Marken stammen aus den gemessenen Seiten; sie sind kein Vertrag:
 * jede Stufe prüft ihr Ergebnis und bricht mit dem Namen der Stufe ab.
 */
import * as cheerio from 'cheerio';

import { env } from '../../config/env.js';
import { berlinDay } from '../briefing/time.js';
import { FormClient, FormStepError, alertsOf } from '../webForms/formClient.js';

export const NUUDEL_DEFAULT_URL = 'https://nuudel.digitalcourage.de';

/** `null` = abgeschaltet (leerer `NUUDEL_URL`). */
export function nuudelBaseUrl(): string | null {
  const raw = env.NUUDEL_URL;
  if (raw === undefined) return NUUDEL_DEFAULT_URL;
  const trimmed = raw.trim().replace(/\/+$/, '');
  return trimmed || null;
}

export interface PollDay {
  /** `YYYY-MM-DD` */
  day: string;
  /** Freie Uhrzeiten („18:00", „vormittags"); leer = ganzer Tag. */
  times: string[];
}

export type PollRequest = {
  title: string;
  description: string | null;
  creator: { name: string; email: string };
  /** `YYYY-MM-DD`; ohne Angabe gilt nuudels Vorgabe. */
  endDate: string | null;
} & ({ kind: 'date'; days: PollDay[] } | { kind: 'classic'; options: string[] });

export interface CreatedPoll {
  pollId: string;
  adminId: string;
}

export const pollUrl = (base: string, pollId: string) => `${base}/${pollId}`;
export const adminUrl = (base: string, adminId: string) => `${base}/${adminId}/admin`;

/** Framadate kürzt den Namen auf 32 Zeichen (`maxlength`). */
const NAME_MAX = 32;

function fail(step: string, html: string, fallback: string): never {
  const alerts = alertsOf(html).filter((a) => !/javascript|cookies/i.test(a));
  throw new FormStepError(alerts.join(' ') || fallback, step);
}

export async function createNuudelPoll(
  req: PollRequest,
  base: string,
  client = new FormClient()
): Promise<CreatedPoll> {
  const type = req.kind === 'date' ? 'date' : 'autre';
  const step2Path = req.kind === 'date' ? 'create_date_poll.php' : 'create_classic_poll.php';
  const start = `${base}/create_poll.php?type=${type}`;

  await client.request(start);

  const s1 = new URLSearchParams();
  s1.set('name', (req.creator.name || req.creator.email).slice(0, NAME_MAX));
  s1.set('mail', req.creator.email);
  s1.set('title', req.title);
  s1.set('description', req.description ?? '');
  s1.set('editable', '1'); // alle Teilnehmenden können ihre Stimme ändern (Vorgabe)
  s1.set('type', type);
  s1.set('gotostep2', req.kind === 'date' ? 'date' : 'classic');
  const r1 = await client.request(start, { method: 'POST', form: s1 });
  if (!r1.url.endsWith(`/${step2Path}`)) fail('details', r1.html, 'Schritt 1 nicht angenommen');

  const s2 = new URLSearchParams();
  if (req.kind === 'date') {
    req.days.forEach((d, i) => {
      s2.append('days[]', d.day);
      const times = d.times.length ? d.times : [''];
      for (const t of times) s2.append(`horaires${i}[]`, t);
    });
    s2.set('choixheures', 'Weiter');
  } else {
    for (const o of req.options) s2.append('choices[]', o);
    s2.set('fin_sondage_autre', 'Weiter');
  }
  const step2 = `${base}/${step2Path}`;
  const r2 = await client.request(step2, { method: 'POST', form: s2 });
  const $ = cheerio.load(r2.html);
  const endDateField = $('input[name="enddate"]');
  if (endDateField.length === 0 || $('button[name="confirmation"]').length === 0) {
    fail('choices', r2.html, 'Termine bzw. Optionen nicht angenommen');
  }

  const s3 = new URLSearchParams();
  s3.set('enddate', req.endDate ?? endDateField.attr('value') ?? '');
  s3.set('confirmation', 'confirmation');
  const r3 = await client.request(step2, { method: 'POST', form: s3 });
  const m = new URL(r3.url).pathname.match(/^\/([A-Za-z0-9]{24})\/admin$/);
  if (!m) fail('confirm', r3.html, 'Umfrage nicht bestätigt');
  const adminId = m[1];
  const pollId = adminId.slice(0, 16);
  // Die Admin-Seite verlinkt die Teilnahme-Seite; fehlt der Link, stimmt die
  // Annahme „öffentliche ID = Anfang der Admin-ID" nicht mehr.
  if (!r3.html.includes(pollUrl(base, pollId))) {
    throw new FormStepError(
      'Teilnahme-Link nicht auf der Admin-Seite',
      'poll-link',
      adminUrl(base, adminId)
    );
  }
  return { pollId, adminId };
}

/**
 * Die Admin-Seite (`/<admin-id>/admin`), gemessen am 19.11.2026:
 *
 * - Titel, Beschreibung, Ablaufdatum: POST an die Seite mit dem Feld
 *   (`title`, `description`, `expiration_date`) und `update_poll_info=<feld>`.
 *   Ein leerer Wert ändert nichts; geleert wird mit einem Leerzeichen.
 *   Das Ablaufdatum begrenzt nuudel STILL auf morgen bis zur Vorgabe beim
 *   Anlegen (2035 → 2028-11-08, 2020 → morgen); was gilt, steht danach im Feld.
 * - Termin hinzufügen: POST `newdate` (`YYYY-MM-DD`), `newmoment` (frei),
 *   `confirm_add_column`. Ein unmögliches Datum rollt nuudel still weiter
 *   (2026-13-45 → 2027-02-14), deshalb prüft das Eingabeschema.
 * - Termin entfernen: GET `…/admin/action/delete_column/<id>`; die Rückfrage
 *   macht nur das JavaScript der Seite. `<id>` ist base64 von
 *   `<Mitternacht Europe/Berlin als Unix-Zeit>@<Uhrzeit>`. Mit der Spalte
 *   verschwinden alle Stimmen darauf.
 * - Löschen: POST `delete_poll` zeigt eine Rückfrage, erst POST
 *   `confirm_delete_poll` löscht.
 *
 * Ob eine Änderung angekommen ist, prüft der Ablauf am Zustand der danach
 * geladenen Seite, nicht an der Meldung.
 */
export interface PollSlot {
  /** `YYYY-MM-DD` */
  day: string;
  /** Wie bei nuudel eingetragen; leer = ganzer Tag. */
  time: string;
}

export interface AdminState {
  title: string;
  description: string;
  endDate: string;
  /** In der Reihenfolge der Seite, dieselbe wie die Spalten im CSV. */
  slots: (PollSlot & { removePath: string })[];
}

/** `MTc5NjA3OTYwMEAxOTowMA` → `{ day: '2026-12-01', time: '19:00' }`. */
export function decodeSlotId(id: string): PollSlot | null {
  const raw = Buffer.from(id, 'base64').toString('utf8');
  const m = raw.match(/^(\d{9,11})@(.*)$/s);
  if (!m) return null;
  return { day: berlinDay(new Date(Number(m[1]) * 1000)), time: m[2].trim() };
}

export function adminStateOf(html: string): AdminState | null {
  const $ = cheerio.load(html);
  const title = $('input#newtitle').attr('value');
  if (title === undefined) return null;
  const slots: AdminState['slots'] = [];
  $('a.remove-column').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    const m = href.match(/\/action\/delete_column\/([^/?#]+)$/);
    const slot = m ? decodeSlotId(decodeURIComponent(m[1])) : null;
    if (slot) slots.push({ ...slot, removePath: new URL(href).pathname });
  });
  return {
    title,
    description: $('textarea#newdescription').text(),
    endDate: $('input#newexpirationdate').attr('value') ?? '',
    slots,
  };
}

export const sameSlot = (a: PollSlot, b: PollSlot) =>
  a.day === b.day && a.time.trim().toLowerCase() === b.time.trim().toLowerCase();

export interface PollEdit {
  title?: string;
  description?: string;
  endDate?: string;
  addSlots?: PollSlot[];
  removeSlots?: PollSlot[];
}

async function loadAdmin(adminId: string, base: string, client: FormClient): Promise<AdminState> {
  const res = await client.request(adminUrl(base, adminId));
  const state = adminStateOf(res.html);
  if (!state) throw new FormStepError('Umfrage gibt es bei nuudel nicht mehr', 'gone');
  return state;
}

/** Der Zustand der Admin-Seite, ohne etwas zu ändern. */
export function readNuudelAdmin(
  adminId: string,
  base: string,
  client = new FormClient()
): Promise<AdminState> {
  return loadAdmin(adminId, base, client);
}

const slotText = (slots: PollSlot[]) => slots.map((s) => `${s.day} ${s.time}`.trim()).join(', ');

/**
 * Ändert eine Umfrage über ihre Admin-Seite und gibt den Zustand danach
 * zurück. Termine, die es schon gibt, werden nicht noch einmal angelegt;
 * ob entfernte Termine Stimmen tragen, prüft der Aufrufer vorher.
 */
export async function editNuudelPoll(
  adminId: string,
  edit: PollEdit,
  base: string,
  client = new FormClient()
): Promise<AdminState> {
  const page = adminUrl(base, adminId);
  const before = await loadAdmin(adminId, base, client);

  const fields = [
    ['title', 'title'],
    ['description', 'description'],
    ['endDate', 'expiration_date'],
  ] as const;
  for (const [key, field] of fields) {
    const value = edit[key];
    if (value === undefined) continue;
    const form = new URLSearchParams();
    // Ein leerer Wert lässt nuudel das alte Feld stehen (gemessen); ein
    // Leerzeichen leert es sichtbar.
    form.set(field, value === '' ? ' ' : value);
    form.set('update_poll_info', field);
    await client.request(page, { method: 'POST', form });
  }

  for (const slot of edit.addSlots ?? []) {
    if (before.slots.some((s) => sameSlot(s, slot))) continue;
    const form = new URLSearchParams();
    form.set('newdate', slot.day);
    form.set('newmoment', slot.time);
    form.set('confirm_add_column', '');
    await client.request(page, { method: 'POST', form });
  }

  for (const slot of edit.removeSlots ?? []) {
    const hit = before.slots.find((s) => sameSlot(s, slot));
    if (hit) await client.request(new URL(hit.removePath, base).toString());
  }

  const after = await loadAdmin(adminId, base, client);
  if (edit.title !== undefined && after.title !== edit.title) {
    throw new FormStepError('Titel nicht übernommen', 'title');
  }
  if (edit.description !== undefined && after.description.trim() !== edit.description.trim()) {
    throw new FormStepError('Beschreibung nicht übernommen', 'description');
  }
  const missing = (edit.addSlots ?? []).filter((s) => !after.slots.some((a) => sameSlot(a, s)));
  if (missing.length > 0) {
    throw new FormStepError(`Termine nicht übernommen: ${slotText(missing)}`, 'add-slot');
  }
  const stuck = (edit.removeSlots ?? []).filter((s) => after.slots.some((a) => sameSlot(a, s)));
  if (stuck.length > 0) {
    throw new FormStepError(`Termine nicht entfernt: ${slotText(stuck)}`, 'remove-slot');
  }
  return after;
}

/** Löscht eine Umfrage bei nuudel endgültig, samt der Rückfrage der Seite. */
export async function deleteNuudelPoll(
  adminId: string,
  base: string,
  client = new FormClient()
): Promise<void> {
  const page = adminUrl(base, adminId);
  await loadAdmin(adminId, base, client);
  const ask = new URLSearchParams();
  ask.set('delete_poll', '');
  const r1 = await client.request(page, { method: 'POST', form: ask });
  if (cheerio.load(r1.html)('button[name="confirm_delete_poll"]').length === 0) {
    fail('delete-ask', r1.html, 'Rückfrage zum Löschen nicht erhalten');
  }
  const confirm = new URLSearchParams();
  confirm.set('confirm_delete_poll', '');
  await client.request(page, { method: 'POST', form: confirm });
  const check = await client.request(page);
  if (adminStateOf(check.html)) throw new FormStepError('Umfrage steht noch', 'delete-confirm');
}

export type Answer = 'yes' | 'maybe' | 'no' | null;

export interface PollResults {
  options: { label: string; yes: number; maybe: number; no: number }[];
  participants: { name: string; answers: Answer[] }[];
}

const ANSWERS: Record<string, Answer> = {
  ja: 'yes',
  yes: 'yes',
  'unter vorbehalt': 'maybe',
  'under reserve': 'maybe',
  'if need be': 'maybe',
  nein: 'no',
  no: 'no',
};

/** RFC-4180-CSV, wie Framadate sie schreibt (jede Zeile mit Komma am Ende). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/**
 * Kopfzeilen sind die Zeilen mit leerer erster Zelle (bei Terminumfragen eine
 * für die Tage, eine für die Uhrzeiten); ihre Zellen ergeben je Spalte die
 * Bezeichnung. Danach eine Zeile je Person. Das Komma am Zeilenende ergibt
 * eine leere letzte Spalte, die wegfällt.
 */
export function resultsFromCsv(csv: string): PollResults {
  const rows = parseCsv(csv.trim()).map((r) => (r.at(-1) === '' ? r.slice(0, -1) : r));
  const header: string[][] = [];
  let i = 0;
  while (i < rows.length && rows[i][0] === '') header.push(rows[i++]);
  const width = Math.max(0, ...header.map((h) => h.length)) - 1;
  const labels = Array.from({ length: width }, (_, c) => {
    // Eine Tageszelle steht nur über der ersten Uhrzeit des Tages: nach rechts übernehmen.
    const parts = header.map((h, r) => {
      let v = h[c + 1]?.trim() ?? '';
      if (!v && r < header.length - 1) {
        for (let k = c; k >= 0 && !v; k--) v = h[k + 1]?.trim() ?? '';
      }
      return v;
    });
    return parts.filter(Boolean).join(' ');
  });
  const participants = rows.slice(i).map((r) => ({
    name: r[0] ?? '',
    answers: labels.map((_, c) => ANSWERS[(r[c + 1] ?? '').trim().toLowerCase()] ?? null),
  }));
  const options = labels.map((label, c) => {
    const count = (a: Answer) => participants.filter((p) => p.answers[c] === a).length;
    return { label, yes: count('yes'), maybe: count('maybe'), no: count('no') };
  });
  return { options, participants };
}

export async function readNuudelResults(
  adminId: string,
  base: string,
  client = new FormClient()
): Promise<PollResults> {
  const res = await client.request(`${base}/exportcsv.php?admin=${encodeURIComponent(adminId)}`);
  if (res.html.trimStart().startsWith('<')) {
    throw new FormStepError('Umfrage gibt es bei nuudel nicht mehr', 'gone');
  }
  return resultsFromCsv(res.html);
}
