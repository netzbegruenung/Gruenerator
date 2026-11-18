/**
 * Eine eigene Antragsgrün-Seite verbinden (#5690), gegen einen nachgebauten
 * antragsgruen.de. Die Form von `data-users`/`data-groups` stammt aus
 * Antragsgrün (`User::getUserAdminApiObject`, `ConsultationUserGroup::getUserAdminApiObject`,
 * `UserGroupPermissions::toApi`); ein Lauf gegen das echte antragsgruen.de steht aus.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  taken: null as { user_id: string | null } | null,
  connected: 0,
  email: 'Anna@Example.org' as string | null,
  inserted: [] as unknown[][],
}));

vi.mock('../../../config/env.js', () => ({
  env: { ANTRAGSGRUEN_BOT_EMAIL: 'bot@gruenerator.eu', ANTRAGSGRUEN_BOT_PASSWORD: 'geheim' },
}));

vi.mock('../../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({
    query: async (sql: string, params: unknown[]) => {
      if (sql.includes('SELECT user_id')) return db.taken ? [db.taken] : [];
      if (sql.includes('COUNT(*)')) return [{ n: db.connected }];
      if (sql.includes('FROM profiles'))
        return [{ email: db.email, first_name: 'Anna', last_name: 'Muster', display_name: null }];
      if (sql.includes('INSERT')) {
        db.inserted.push(params);
        return [
          {
            id: 'id-1',
            subdomain: params[1],
            title: params[2],
            url: params[3],
            kind: 'connected',
            created_at: new Date(0),
          },
        ];
      }
      throw new Error(`unexpected SQL: ${sql}`);
    },
  }),
}));

import { FormClient, type FetchLike } from './formClient.js';
import { createMotionOnHostedSite } from './motions.js';
import { adminEmailsOf, login, requireAdmins } from './session.js';
import { SiteOrderRefused, connectAntragsgruenSite, parseSiteAddress } from './sites.js';

const attr = (value: unknown) => JSON.stringify(value).replace(/"/g, '&quot;');

const GROUPS = [
  { id: 11, title: 'Seiten-Admin', default_permissions: ['admin-all'] },
  { id: 12, title: 'Veranstaltungs-Admin', default_permissions: ['admin-all'] },
  { id: 14, title: 'Teilnehmer*in', default_permissions: null },
];

function usersPage(users: { email: string; groups: number[] }[]) {
  return `<div class="userAdmin" data-users="${attr(users)}" data-groups="${attr(GROUPS)}"></div>`;
}

function fakeSite(opts: { botAdmin?: boolean; users?: { email: string; groups: number[] }[] }) {
  const {
    botAdmin = true,
    users = [
      { email: 'bot@gruenerator.eu', groups: [11] },
      { email: 'anna@example.org', groups: [11] },
    ],
  } = opts;
  const html = (body: string, cookies: string[] = [], status = 200) => {
    const headers = new Headers({ 'content-type': 'text/html' });
    for (const c of cookies) headers.append('set-cookie', c);
    return new Response(body, { status, headers });
  };
  const redirect = (location: string, cookies: string[] = []) => {
    const headers = new Headers({ location });
    for (const c of cookies) headers.append('set-cookie', c);
    return new Response(null, { status: 302, headers });
  };
  const fetchImpl: FetchLike = async (url, init) => {
    const u = new URL(url);
    const key = `${init.method ?? 'GET'} ${u.host}${u.pathname}`;
    switch (key) {
      case 'GET antragsgruen.de/login':
        return html('<form><input name="_csrf" value="c-login"></form>');
      case 'POST antragsgruen.de/login':
        return redirect('/', ['PHPSESSID=s1; path=/; domain=.antragsgruen.de; HttpOnly']);
      case 'GET antragsgruen.de/':
        return html('<h1>Antragsgrün</h1>');
      // Wie Antragsgrün 4.18.1 (gemessen 18.11.2026): die Veranstaltung des
      // Assistenten heisst wie die Subdomain, eine zweite liegt unter eigenem Pfad,
      // ein unbekannter Pfad gibt 404 „Veranstaltung nicht gefunden".
      case 'GET kv-bonn.antragsgruen.de/kv-bonn':
        return html('<h1>  KMV Bonn\n 2027 </h1>');
      case 'GET kv-bonn.antragsgruen.de/kmv27':
        return html('<h1>Klausur 2027</h1>');
      case 'GET kv-bonn.antragsgruen.de/kv-bonn/admin/users':
      case 'GET kv-bonn.antragsgruen.de/kmv27/admin/users':
        return botAdmin ? html(usersPage(users)) : html('<h1>Error</h1>', [], 404);
      default:
        if (key.startsWith('GET kv-bonn.antragsgruen.de/')) return html('<h1></h1>', [], 404);
        throw new Error(`unexpected request: ${key}`);
    }
  };
  return new FormClient(fetchImpl);
}

beforeEach(() => {
  db.taken = null;
  db.connected = 0;
  db.email = 'Anna@Example.org';
  db.inserted = [];
});

describe('parseSiteAddress', () => {
  const base = 'https://antragsgruen.de';

  it('takes subdomain and consultation, with or without scheme', () => {
    expect(parseSiteAddress('https://kv-bonn.antragsgruen.de/kmv27/motion/1', base)).toEqual({
      subdomain: 'kv-bonn',
      origin: 'https://kv-bonn.antragsgruen.de',
      consultation: 'kmv27',
    });
    expect(parseSiteAddress('kv-bonn.antragsgruen.de', base)?.consultation).toBeNull();
  });

  it('refuses other hosts, the bare host and other schemes', () => {
    for (const bad of [
      'https://kv-bonn.antragsgruen.de.evil.org/kmv',
      'https://evil-antragsgruen.de/kmv',
      'https://antragsgruen.de/kmv',
      'http://kv-bonn.antragsgruen.de/kmv',
      'https://a.b.antragsgruen.de/kmv',
      'https://user:pw@kv-bonn.antragsgruen.de/kmv',
      'kein url',
    ]) {
      expect(parseSiteAddress(bad, base), bad).toBeNull();
    }
  });
});

describe('adminEmailsOf', () => {
  it('lists only members of groups with admin-all', () => {
    const html = usersPage([
      { email: 'Admin@X.de', groups: [14, 12] },
      { email: 'teilnehmer@x.de', groups: [14] },
    ]);
    expect(adminEmailsOf(html)).toEqual(['admin@x.de']);
  });

  it('is empty when the widget is missing or broken', () => {
    expect(adminEmailsOf('<div></div>')).toEqual([]);
    expect(adminEmailsOf('<div data-users="{kaputt" data-groups="[]"></div>')).toEqual([]);
  });
});

describe('connectAntragsgruenSite', () => {
  it('connects a bare host as the consultation named like the subdomain', async () => {
    const site = await connectAntragsgruenSite('u1', 'kv-bonn.antragsgruen.de', fakeSite({}));
    expect(site.title).toBe('KMV Bonn 2027');
    expect(db.inserted).toEqual([
      ['u1', 'kv-bonn', 'KMV Bonn 2027', 'https://kv-bonn.antragsgruen.de/kv-bonn'],
    ]);
  });

  it('keeps the consultation from the pasted path', async () => {
    await connectAntragsgruenSite(
      'u1',
      'https://kv-bonn.antragsgruen.de/kmv27/motion/3',
      fakeSite({})
    );
    expect(db.inserted[0]?.[3]).toBe('https://kv-bonn.antragsgruen.de/kmv27');
  });

  it('refuses a path that is no consultation, with a hint', async () => {
    await expect(
      connectAntragsgruenSite('u1', 'https://kv-bonn.antragsgruen.de/falsch', fakeSite({}))
    ).rejects.toThrow(/gibt es keine Veranstaltung/);
    expect(db.inserted).toEqual([]);
  });

  it('refuses when the Grünerator account is not admin, naming the account', async () => {
    await expect(
      connectAntragsgruenSite(
        'u1',
        'https://kv-bonn.antragsgruen.de/kmv27',
        fakeSite({ botAdmin: false })
      )
    ).rejects.toThrow(/bot@gruenerator\.eu ist auf dieser Seite nicht Admin/);
    expect(db.inserted).toEqual([]);
  });

  it('refuses when the person is no admin there — the Grünerator being admin is not enough', async () => {
    const client = fakeSite({
      users: [
        { email: 'bot@gruenerator.eu', groups: [11] },
        { email: 'anna@example.org', groups: [14] },
      ],
    });
    await expect(
      connectAntragsgruenSite('u1', 'https://kv-bonn.antragsgruen.de/kmv27', client)
    ).rejects.toThrow(
      /Dein Grünerator-Konto \(Anna@Example\.org\) ist auf dieser Seite nicht Admin/
    );
    expect(db.inserted).toEqual([]);
  });

  it('refuses a site someone else already connected, before contacting antragsgruen.de', async () => {
    db.taken = { user_id: 'u2' };
    await expect(
      connectAntragsgruenSite('u1', 'https://kv-bonn.antragsgruen.de/kmv27', fakeSite({}))
    ).rejects.toThrow(/anderen Grünerator-Konto/);
  });

  it('refuses addresses off the Antragsgrün host', async () => {
    await expect(
      connectAntragsgruenSite('u1', 'https://example.org/kmv', fakeSite({}))
    ).rejects.toBeInstanceOf(SiteOrderRefused);
  });
});

describe('requireAdmins before every write', () => {
  const MOTION = {
    siteUrl: 'https://kv-bonn.antragsgruen.de/kv-bonn',
    title: 'Radwege',
    text: 'Mehr Radwege.',
    reason: null,
    initiator: { name: 'Anna Muster', email: 'Anna@Example.org', organization: null },
    agendaItem: null,
  };
  const CONFIG = { baseUrl: 'https://antragsgruen.de', botEmail: 'b', botPassword: 'p' };

  it('refuses to file a motion once the person is no admin, before asking for a token', async () => {
    const client = fakeSite({
      users: [
        { email: 'bot@gruenerator.eu', groups: [11] },
        { email: 'anna@example.org', groups: [14] },
      ],
    });
    // Der Fake kennt `/token` nicht: käme der Ablauf so weit, schlüge der Test anders fehl.
    await expect(createMotionOnHostedSite(MOTION, CONFIG, client)).rejects.toMatchObject({
      step: 'not-admin',
    });
  });

  it('refuses with `revoked` once the Grünerator account was removed', async () => {
    await expect(
      createMotionOnHostedSite(MOTION, CONFIG, fakeSite({ botAdmin: false }))
    ).rejects.toMatchObject({ step: 'revoked' });
  });

  it('passes when both are admins', async () => {
    const client = fakeSite({});
    await login(client, CONFIG);
    await expect(
      requireAdmins(client, 'https://kv-bonn.antragsgruen.de', 'kv-bonn', ' anna@EXAMPLE.org ')
    ).resolves.toBeUndefined();
  });
});
