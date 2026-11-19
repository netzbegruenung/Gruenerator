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
