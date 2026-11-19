/**
 * Der Ablauf gegen ein nachgebautes nuudel. Pfade, Feldnamen, Weiterleitungen
 * und die CSV-Form sind am 19.11.2026 an nuudel.digitalcourage.de gemessen
 * (Kopf von `client.ts`); die HTML-Schnipsel sind auf das gekürzt, was der
 * Ablauf liest.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../config/env.js', () => ({ env: {} }));

import { FormClient, FormStepError, type FetchLike } from '../webForms/formClient.js';

import { createNuudelPoll, readNuudelResults, resultsFromCsv, type PollRequest } from './client.js';

const BASE = 'https://nuudel.example';
const ADMIN = 'DDhkf3tLgrGJw61zEygfXFYk';
const POLL = 'DDhkf3tLgrGJw61z';

interface Call {
  method: string;
  url: string;
  form: URLSearchParams | null;
  cookie: string;
}

function fakeNuudel(opts: { rejectStep1?: boolean; noPublicLink?: boolean } = {}) {
  const calls: Call[] = [];
  const html = (body: string) =>
    new Response(body, {
      status: 200,
      headers: { 'content-type': 'text/html', 'set-cookie': 'PHPSESSID=s1; path=/' },
    });
  const redirect = (location: string) => new Response(null, { status: 302, headers: { location } });
  const fetchImpl: FetchLike = async (url, init) => {
    const headers = init.headers as Record<string, string>;
    const form = init.body ? new URLSearchParams(String(init.body)) : null;
    calls.push({ method: String(init.method), url, form, cookie: headers.cookie ?? '' });
    const path = new URL(url).pathname;
    if (path === '/create_poll.php' && init.method === 'GET') return html('<form id="formulaire">');
    if (path === '/create_poll.php') {
      if (opts.rejectStep1) {
        return html('<div class="alert alert-danger">Geben Sie eine E-Mail Adresse ein</div>');
      }
      return redirect(
        form?.get('type') === 'date' ? 'create_date_poll.php' : 'create_classic_poll.php'
      );
    }
    if (path === '/create_classic_poll.php' || path === '/create_date_poll.php') {
      if (form?.get('confirmation') === 'confirmation') return redirect(`${BASE}/${ADMIN}/admin`);
      return html(
        '<form name="formulaire"><input name="enddate" value="2028-11-08"/><button name="confirmation" value="confirmation">Umfrage erstellen</button></form>'
      );
    }
    if (path === `/${ADMIN}/admin`) {
      return html(
        opts.noPublicLink ? '<h1>Admin</h1>' : `<a href="${BASE}/${POLL}">${BASE}/${POLL}</a>`
      );
    }
    if (path === '/exportcsv.php') {
      return new URL(url).searchParams.get('admin') === ADMIN
        ? new Response(',Pizza,Pasta,\n"Anna","Ja","Unter Vorbehalt",\n"Ben","Nein","Ja",\n', {
            headers: { 'content-type': 'text/csv; charset=utf-8' },
          })
        : html('<p>Die Umfrage existiert nicht!</p>');
    }
    return new Response('not found', { status: 404 });
  };
  return { calls, fetchImpl };
}

const CREATOR = { name: 'Anna Muster', email: 'anna@example.org' };

describe('createNuudelPoll', () => {
  it('legt eine Auswahl in drei Schritten in einer Sitzung an', async () => {
    const site = fakeNuudel();
    const req: PollRequest = {
      kind: 'classic',
      title: 'Essen beim Sommerfest',
      description: 'Bitte bis Freitag',
      creator: CREATOR,
      endDate: null,
      options: ['Pizza', 'Pasta'],
    };
    const created = await createNuudelPoll(req, BASE, new FormClient(site.fetchImpl));
    expect(created).toEqual({ pollId: POLL, adminId: ADMIN });

    const posts = site.calls.filter((c) => c.method === 'POST');
    expect(posts.map((c) => new URL(c.url).pathname)).toEqual([
      '/create_poll.php',
      '/create_classic_poll.php',
      '/create_classic_poll.php',
    ]);
    expect(Object.fromEntries(posts[0].form!)).toMatchObject({
      name: 'Anna Muster',
      mail: 'anna@example.org',
      title: 'Essen beim Sommerfest',
      type: 'autre',
      gotostep2: 'classic',
    });
    expect(posts[1].form!.getAll('choices[]')).toEqual(['Pizza', 'Pasta']);
    // Ohne eigenes Ablaufdatum gilt nuudels Vorgabe aus dem Formular.
    expect(posts[2].form!.get('enddate')).toBe('2028-11-08');
    // Die Sitzung trägt über alle Schritte.
    expect(posts.every((c) => c.cookie.includes('PHPSESSID=s1'))).toBe(true);
  });

  it('schickt Tage und Uhrzeiten je Tag in eigenen Feldern', async () => {
    const site = fakeNuudel();
    await createNuudelPoll(
      {
        kind: 'date',
        title: 'OV-Treffen',
        description: null,
        creator: CREATOR,
        endDate: '2027-01-31',
        days: [
          { day: '2026-12-01', times: ['18:00', '19:30'] },
          { day: '2026-12-03', times: [] },
        ],
      },
      BASE,
      new FormClient(site.fetchImpl)
    );
    const [s1, s2, s3] = site.calls.filter((c) => c.method === 'POST');
    expect(s1.form!.get('type')).toBe('date');
    expect(s2.form!.getAll('days[]')).toEqual(['2026-12-01', '2026-12-03']);
    expect(s2.form!.getAll('horaires0[]')).toEqual(['18:00', '19:30']);
    expect(s2.form!.getAll('horaires1[]')).toEqual(['']);
    expect(s3.form!.get('enddate')).toBe('2027-01-31');
  });

  it('bricht mit dem Namen der Stufe und nuudels Meldung ab', async () => {
    const site = fakeNuudel({ rejectStep1: true });
    const run = createNuudelPoll(
      {
        kind: 'classic',
        title: 'x',
        description: null,
        creator: CREATOR,
        endDate: null,
        options: ['a', 'b'],
      },
      BASE,
      new FormClient(site.fetchImpl)
    );
    await expect(run).rejects.toBeInstanceOf(FormStepError);
    await expect(run).rejects.toMatchObject({
      step: 'details',
      message: 'Geben Sie eine E-Mail Adresse ein',
    });
  });

  it('meldet den Admin-Link, wenn der Teilnahme-Link nicht zur Annahme passt', async () => {
    const site = fakeNuudel({ noPublicLink: true });
    await expect(
      createNuudelPoll(
        {
          kind: 'classic',
          title: 'x',
          description: null,
          creator: CREATOR,
          endDate: null,
          options: ['a', 'b'],
        },
        BASE,
        new FormClient(site.fetchImpl)
      )
    ).rejects.toMatchObject({ step: 'poll-link', createdUrl: `${BASE}/${ADMIN}/admin` });
  });
});

describe('readNuudelResults', () => {
  it('zählt je Option und hält die Stimmen je Person', async () => {
    const site = fakeNuudel();
    const results = await readNuudelResults(ADMIN, BASE, new FormClient(site.fetchImpl));
    expect(results.options).toEqual([
      { label: 'Pizza', yes: 1, maybe: 0, no: 1 },
      { label: 'Pasta', yes: 1, maybe: 1, no: 0 },
    ]);
    expect(results.participants[0]).toEqual({ name: 'Anna', answers: ['yes', 'maybe'] });
  });

  it('erkennt eine gelöschte Umfrage an der HTML-Seite statt am Status', async () => {
    const site = fakeNuudel();
    await expect(
      readNuudelResults('xxxxxxxxxxxxxxxxxxxxxxxx', BASE, new FormClient(site.fetchImpl))
    ).rejects.toMatchObject({ step: 'gone' });
  });
});

describe('resultsFromCsv', () => {
  it('setzt mehrere Kopfzeilen (Tag, Uhrzeit) je Spalte zusammen', () => {
    const csv = [
      ',"Dienstag 01/12/2026","","Donnerstag 03/12/2026",',
      ',"18:00","19:30","",',
      '"Anna","Ja","Nein","Unter Vorbehalt",',
      '"Ben, der Zweite","Ja","Ja","",',
    ].join('\n');
    const r = resultsFromCsv(csv);
    expect(r.options.map((o) => o.label)).toEqual([
      'Dienstag 01/12/2026 18:00',
      'Dienstag 01/12/2026 19:30',
      'Donnerstag 03/12/2026',
    ]);
    expect(r.options[0]).toMatchObject({ yes: 2, no: 0 });
    expect(r.participants[1]).toEqual({ name: 'Ben, der Zweite', answers: ['yes', 'yes', null] });
  });
});
