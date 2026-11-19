/**
 * Ändern und Löschen über die Admin-Seite, gegen ein nachgebautes nuudel mit
 * Zustand. Markup, Pfade und Spalten-IDs sind am 19.11.2026 an
 * nuudel.digitalcourage.de gemessen (Kopf von `client.ts`), gekürzt auf das,
 * was der Ablauf liest.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../config/env.js', () => ({ env: {} }));

import { FormClient, FormStepError, type FetchLike } from '../webForms/formClient.js';

import {
  adminStateOf,
  decodeSlotId,
  deleteNuudelPoll,
  editNuudelPoll,
  type AdminState,
  type PollResults,
  type PollSlot,
} from './client.js';
import { votesOnSlots } from './polls.js';

const BASE = 'https://nuudel.example';
const ADMIN = 'DDhkf3tLgrGJw61zEygfXFYk';

/** Mitternacht Europe/Berlin im Dezember (UTC+1). */
const slotId = (s: PollSlot) => {
  const [y, m, d] = s.day.split('-').map(Number);
  const epoch = Date.UTC(y, m - 1, d) / 1000 - 3600;
  return Buffer.from(`${epoch}@${s.time}`).toString('base64').replace(/=+$/, '');
};

function fakeAdmin(opts: { ignoreTitle?: boolean } = {}) {
  const poll = {
    title: 'OV-Treffen Dezember',
    description: '',
    endDate: '2028-11-08',
    slots: [
      { day: '2026-12-01', time: '19:00' },
      { day: '2026-12-03', time: '19:00' },
    ] as PollSlot[],
    deleted: false,
    askedDelete: false,
  };
  const calls: string[] = [];
  const page = () =>
    poll.deleted
      ? '<p>Die Umfrage existiert nicht!</p>'
      : `<form><h3>${poll.title}</h3><input type="text" id="newtitle" name="title" value="${poll.title}" />
<textarea id="newdescription" name="description">${poll.description}</textarea>
<input type="text" id="newexpirationdate" name="expiration_date" value="${poll.endDate}" /></form>
<table><tr>${poll.slots
          .map(
            (s) =>
              `<td><a href="${BASE}/${ADMIN}/admin/action/delete&lowbar;column/${slotId(s)}" class="btn btn-link btn-sm remove-column">x</a></td>`
          )
          .join('')}</tr></table>`;
  const html = (body: string) =>
    new Response(body, { status: 200, headers: { 'content-type': 'text/html' } });
  const fetchImpl: FetchLike = async (url, init) => {
    const u = new URL(url);
    const form = init.body ? new URLSearchParams(String(init.body)) : null;
    calls.push(`${String(init.method)} ${u.pathname}${form ? ` ${form.toString()}` : ''}`);
    if (u.pathname === `/${ADMIN}/admin` && init.method === 'POST' && form) {
      const field = form.get('update_poll_info');
      if (field === 'title' && !opts.ignoreTitle) poll.title = form.get('title') ?? poll.title;
      if (field === 'description') poll.description = form.get('description') ?? '';
      // nuudel begrenzt still auf die Vorgabe beim Anlegen.
      if (field === 'expiration_date') {
        const v = form.get('expiration_date') ?? '';
        poll.endDate = v > '2028-11-08' ? '2028-11-08' : v;
      }
      if (form.has('confirm_add_column')) {
        poll.slots.push({ day: form.get('newdate') ?? '', time: form.get('newmoment') ?? '' });
      }
      if (form.has('delete_poll')) {
        poll.askedDelete = true;
        return html('<button type="submit" name="confirm_delete_poll">Umfrage löschen</button>');
      }
      if (form.has('confirm_delete_poll') && poll.askedDelete) poll.deleted = true;
      return html(page());
    }
    const del = u.pathname.match(/\/action\/delete_column\/(.+)$/);
    if (del) {
      poll.slots = poll.slots.filter((s) => slotId(s) !== del[1]);
      return html(page());
    }
    if (u.pathname === `/${ADMIN}/admin`) return html(page());
    return new Response('not found', { status: 404 });
  };
  return { poll, calls, client: new FormClient(fetchImpl) };
}

describe('decodeSlotId / adminStateOf', () => {
  it('liest Tag und Uhrzeit aus der gemessenen Spalten-ID', () => {
    expect(decodeSlotId('MTc5NjA3OTYwMEAxOTowMA')).toEqual({ day: '2026-12-01', time: '19:00' });
  });

  it('erkennt die Admin-Seite, nicht die Rückfrage zum Löschen', () => {
    expect(adminStateOf('<button name="confirm_delete_poll">Umfrage löschen</button>')).toBeNull();
  });
});

describe('editNuudelPoll', () => {
  it('ändert Felder, legt nur fehlende Termine an und entfernt über den Spalten-Link', async () => {
    const site = fakeAdmin();
    const after = await editNuudelPoll(
      ADMIN,
      {
        title: 'OV-Treffen',
        description: 'Ort: Grünes Büro',
        addSlots: [
          { day: '2026-12-01', time: '19:00' },
          { day: '2026-12-10', time: '' },
        ],
        removeSlots: [{ day: '2026-12-03', time: '19:00' }],
      },
      BASE,
      site.client
    );
    expect(after.title).toBe('OV-Treffen');
    expect(after.description).toBe('Ort: Grünes Büro');
    expect(after.slots.map((s) => `${s.day} ${s.time}`.trim())).toEqual([
      '2026-12-01 19:00',
      '2026-12-10',
    ]);
    // Die schon vorhandene Spalte wurde nicht noch einmal geschickt.
    expect(site.calls.filter((c) => c.includes('confirm_add_column'))).toHaveLength(1);
  });

  it('leert die Beschreibung mit einem Leerzeichen, weil nuudel Leeres ignoriert', async () => {
    const site = fakeAdmin();
    site.poll.description = 'alt';
    await editNuudelPoll(ADMIN, { description: '' }, BASE, site.client);
    expect(site.calls.some((c) => c.includes('description=+&update_poll_info=description'))).toBe(
      true
    );
  });

  it('meldet das begrenzte Ablaufdatum, statt es zu verschweigen', async () => {
    const site = fakeAdmin();
    const after = await editNuudelPoll(ADMIN, { endDate: '2035-01-01' }, BASE, site.client);
    expect(after.endDate).toBe('2028-11-08');
  });

  it('bricht ab, wenn die Seite die Änderung nicht übernommen hat', async () => {
    const site = fakeAdmin({ ignoreTitle: true });
    await expect(editNuudelPoll(ADMIN, { title: 'Neu' }, BASE, site.client)).rejects.toMatchObject({
      step: 'title',
    });
  });

  it('erkennt eine gelöschte Umfrage', async () => {
    const site = fakeAdmin();
    site.poll.deleted = true;
    const err = await editNuudelPoll(ADMIN, { title: 'Neu' }, BASE, site.client).catch((e) => e);
    expect(err).toBeInstanceOf(FormStepError);
    expect(err.step).toBe('gone');
  });
});

describe('deleteNuudelPoll', () => {
  it('bestätigt die Rückfrage der Seite und prüft, dass die Umfrage weg ist', async () => {
    const site = fakeAdmin();
    await deleteNuudelPoll(ADMIN, BASE, site.client);
    expect(site.poll.deleted).toBe(true);
    expect(site.calls.filter((c) => c.startsWith('POST'))).toEqual([
      `POST /${ADMIN}/admin delete_poll=`,
      `POST /${ADMIN}/admin confirm_delete_poll=`,
    ]);
  });
});

describe('votesOnSlots', () => {
  const state: AdminState = {
    title: 't',
    description: '',
    endDate: '2028-11-08',
    slots: [
      { day: '2026-12-01', time: '19:00', removePath: '/a' },
      { day: '2026-12-03', time: '19:00', removePath: '/b' },
    ],
  };
  const results: PollResults = {
    options: [
      { label: 'Di 1 19:00', yes: 1, maybe: 0, no: 0 },
      { label: 'Do 3 19:00', yes: 0, maybe: 0, no: 0 },
    ],
    participants: [{ name: 'Anna', answers: ['yes', null] }],
  };

  it('zählt Antworten je Spalte in der Reihenfolge der Seite', () => {
    expect(
      votesOnSlots(state, results, [
        { day: '2026-12-01', time: '19:00' },
        { day: '2026-12-03', time: '19:00' },
      ]).map((v) => v.votes)
    ).toEqual([1, 0]);
  });

  it('zählt jede Antwort, wenn Seite und CSV nicht zusammenpassen', () => {
    const odd = { ...results, options: results.options.slice(0, 1) };
    expect(votesOnSlots(state, odd, [{ day: '2026-12-03', time: '19:00' }])[0].votes).toBe(1);
  });
});
