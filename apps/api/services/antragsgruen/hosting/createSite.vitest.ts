/**
 * Der Ablauf gegen einen nachgebauten antragsgruen.de. Die HTML-Schnipsel sind
 * auf das gekürzt, was der Ablauf liest; Feldnamen und Klassen stammen aus den
 * Antragsgrün-Views (siehe Kopf von `createSite.ts`). Ein Lauf gegen das echte
 * antragsgruen.de steht aus.
 */
import { describe, expect, it } from 'vitest';

import { createAntragsgruenSite, type HostingConfig, type SiteRequest } from './createSite.js';
import { FormClient, type FetchLike } from './formClient.js';

const CONFIG: HostingConfig = {
  baseUrl: 'https://antragsgruen.de',
  botEmail: 'bot@gruenerator.eu',
  botPassword: 'geheim',
};

const REQ: SiteRequest = {
  title: 'KMV Köln 2027',
  organization: 'GRÜNE KV Köln',
  subdomain: 'kv-koeln',
  invitee: { email: 'Anna@Example.org', nameGiven: 'Anna', nameFamily: 'Muster' },
};

interface Call {
  method: string;
  url: string;
  cookie: string;
  form: URLSearchParams | null;
}

interface FakeOptions {
  loginOk?: boolean;
  available?: boolean;
  adminGroupLabel?: string;
  adminEmailSaves?: boolean;
}

function fakeSite(opts: FakeOptions = {}) {
  const {
    loginOk = true,
    available = true,
    adminGroupLabel = 'Seiten-Admin',
    adminEmailSaves = true,
  } = opts;
  const calls: Call[] = [];
  const settingsPosts: URLSearchParams[] = [];
  let invited: string | null = null;
  let adminEmail = 'bot@gruenerator.eu';
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
    const method = init.method ?? 'GET';
    const headers = new Headers(init.headers);
    const form = typeof init.body === 'string' ? new URLSearchParams(init.body) : null;
    calls.push({ method, url, cookie: headers.get('cookie') ?? '', form });
    const loggedIn = (headers.get('cookie') ?? '').includes('PHPSESSID=s1');
    const key = `${method} ${u.host}${u.pathname}`;

    switch (key) {
      case 'GET antragsgruen.de/user/login':
        return html('<form><input name="_csrf" value="c-login"></form>', [
          '_csrf=main; path=/; HttpOnly',
        ]);
      case 'POST antragsgruen.de/user/login':
        if (!loginOk || form?.get('password') !== 'geheim') {
          return html('<div class="alert alert-danger">Falsches Passwort</div>');
        }
        return redirect('/', ['PHPSESSID=s1; path=/; domain=.antragsgruen.de; HttpOnly']);
      case 'GET antragsgruen.de/':
        return html('<h1>Antragsgrün</h1>');
      case 'GET antragsgruen.de/check-subdomain':
        return new Response(JSON.stringify({ available, subdomain: u.searchParams.get('test') }));
      case 'GET antragsgruen.de/createsite':
        if (!loggedIn) return redirect('/');
        return html('<form class="siteCreate"><input name="_csrf" value="c-create"></form>');
      case 'POST antragsgruen.de/createsite':
        return html(
          '<div class="alert alert-success">Angelegt</div>' +
            `<form class="createdForm" action="https://${form?.get('SiteCreateForm[subdomain]')}.antragsgruen.de/${form?.get('SiteCreateForm[subdomain]')}" method="get"></form>`
        );
      case 'GET kv-koeln.antragsgruen.de/kv-koeln/admin/users':
      case 'GET kv-koeln.antragsgruen.de/kv-koeln/admin/users/index': {
        if (!loggedIn) return redirect('https://antragsgruen.de/user/login');
        const users = [{ email: 'bot@gruenerator.eu' }, ...(invited ? [{ email: invited }] : [])];
        return html(
          `<meta name="csrf-token" content="c-users">` +
            `<div class="userAdmin" data-users="${JSON.stringify(users).replace(/"/g, '&quot;')}"></div>` +
            `<form class="addUsersByLogin"><input name="_csrf" value="c-users">` +
            `<label><input type="checkbox" name="userGroups[]" value="11"> ${adminGroupLabel}</label><br>` +
            `<label><input type="checkbox" name="userGroups[]" value="12"> Veranstaltungs-Admin</label><br>` +
            `<label><input type="checkbox" name="userGroups[]" value="14" checked> Teilnehmer*in</label></form>`,
          ['_csrf=sub; path=/; HttpOnly']
        );
      }
      case 'GET kv-koeln.antragsgruen.de/kv-koeln/admin/consultation':
        if (!loggedIn) return redirect('https://antragsgruen.de/user/login');
        return html(
          `<form method="post"><input type="hidden" name="_csrf" value="c-con">` +
            `<input type="text" name="consultation[title]" value="KMV Köln 2027">` +
            `<input type="text" name="consultation[adminEmail]" value="${adminEmail}">` +
            `<input type="hidden" name="settingsFields[]" value="maintenanceMode">` +
            `<input type="checkbox" name="settings[maintenanceMode]" value="1" checked>` +
            `<input type="checkbox" name="settings[screeningMotions]" value="1">` +
            `<select name="consultation[wordingBase]"><option value="de-parteitag">a</option><option value="de-bdk" selected>b</option></select>` +
            `<button type="submit" name="save">Speichern</button></form>`
        );
      case 'POST kv-koeln.antragsgruen.de/kv-koeln/admin/consultation':
        settingsPosts.push(form!);
        if (adminEmailSaves) adminEmail = form!.get('consultation[adminEmail]') ?? adminEmail;
        return redirect('/kv-koeln/admin/consultation');
      case 'POST kv-koeln.antragsgruen.de/kv-koeln/admin/users/add-single':
        if (form?.get('_csrf') === 'c-users' && form.getAll('userGroups[]').join() === '11') {
          invited = form.get('authUsername');
        }
        return redirect('/kv-koeln/admin/users/index');
      default:
        return html(`unbekannt: ${key}`, [], 404);
    }
  };
  return { fetchImpl, calls, settingsPosts };
}

describe('createAntragsgruenSite', () => {
  it('logs in, creates the site and adds the person to the site-admin group', async () => {
    const site = fakeSite();
    const created = await createAntragsgruenSite(REQ, CONFIG, new FormClient(site.fetchImpl));

    expect(created).toEqual({
      subdomain: 'kv-koeln',
      url: 'https://kv-koeln.antragsgruen.de/kv-koeln',
      adminEmailHandedOver: true,
    });

    // Die Einstellungen gehen als ganzes Formular zurück — nur die Admin-Adresse ist neu.
    const [settings] = site.settingsPosts;
    expect(settings.get('consultation[adminEmail]')).toBe('anna@example.org');
    expect(settings.get('consultation[title]')).toBe('KMV Köln 2027');
    expect(settings.get('settings[maintenanceMode]')).toBe('1');
    expect(settings.has('settings[screeningMotions]')).toBe(false);
    expect(settings.get('consultation[wordingBase]')).toBe('de-bdk');
    expect(settings.get('_csrf')).toBe('c-con');

    const create = site.calls.find((c) => c.method === 'POST' && c.url.endsWith('/createsite'))!;
    expect(create.form?.get('_csrf')).toBe('c-create');
    expect(create.form?.get('SiteCreateForm[title]')).toBe('KMV Köln 2027');
    expect(create.form?.get('SiteCreateForm[openNow]')).toBe('0');
    expect(create.form?.get('SiteCreateForm[contact]')).not.toContain('@');

    const invite = site.calls.find((c) => c.url.endsWith('/add-single'))!;
    // Das Session-Cookie gilt für `.antragsgruen.de` und reist mit auf die Subdomain,
    // das `_csrf`-Cookie der Hauptdomain nicht.
    expect(invite.cookie).toContain('PHPSESSID=s1');
    expect(invite.cookie).toContain('_csrf=sub');
    expect(invite.cookie).not.toContain('_csrf=main');
    expect(invite.form?.get('authType')).toBe('email');
    expect(invite.form?.get('authUsername')).toBe('anna@example.org');
    expect(invite.form?.getAll('userGroups[]')).toEqual(['11']);
    expect(invite.form?.get('emailText')).toContain('%LINK%');
    // Ohne %ACCOUNT% schickt Antragsgrün die Mail ohne Zugangsdaten (lokal gemessen).
    expect(invite.form?.get('emailText')).toContain('%ACCOUNT%');
  });

  it('still reports the site when only the admin address could not be handed over', async () => {
    const site = fakeSite({ adminEmailSaves: false });
    const created = await createAntragsgruenSite(REQ, CONFIG, new FormClient(site.fetchImpl));
    expect(created.adminEmailHandedOver).toBe(false);
  });

  it('names the login step when the bot account is rejected', async () => {
    const site = fakeSite({ loginOk: false });
    await expect(
      createAntragsgruenSite(REQ, CONFIG, new FormClient(site.fetchImpl))
    ).rejects.toMatchObject({
      step: 'login',
      message: expect.stringContaining('Falsches Passwort'),
    });
  });

  it('stops before creating anything when the subdomain is taken', async () => {
    const site = fakeSite({ available: false });
    await expect(
      createAntragsgruenSite(REQ, CONFIG, new FormClient(site.fetchImpl))
    ).rejects.toMatchObject({ step: 'check-subdomain' });
    expect(site.calls.some((c) => c.method === 'POST' && c.url.endsWith('/createsite'))).toBe(
      false
    );
  });

  it('refuses to guess the admin group when its label is unknown', async () => {
    const site = fakeSite({ adminGroupLabel: 'Administration' });
    await expect(
      createAntragsgruenSite(REQ, CONFIG, new FormClient(site.fetchImpl))
    ).rejects.toMatchObject({
      step: 'invite',
      siteUrl: 'https://kv-koeln.antragsgruen.de/kv-koeln',
    });
    expect(site.calls.some((c) => c.url.endsWith('/add-single'))).toBe(false);
  });

  it('rejects a subdomain Antragsgrün would not take before any request', async () => {
    const site = fakeSite();
    await expect(
      createAntragsgruenSite(
        { ...REQ, subdomain: 'KV Köln' },
        CONFIG,
        new FormClient(site.fetchImpl)
      )
    ).rejects.toMatchObject({ step: 'validate' });
    expect(site.calls).toHaveLength(0);
  });
});
