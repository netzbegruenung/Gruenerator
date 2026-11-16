/**
 * Eine Antragsgrün-Seite auf antragsgruen.de für eine Person anlegen und sie
 * dort als Seiten-Admin eintragen.
 *
 * Der Weg ist der des Browsers, weil Antragsgrün dafür keine API hat:
 *
 * 1. Login des Grünerator-Kontos (`/user/login`),
 * 2. Seite anlegen (`/createsite`, Plugin `antragsgruen_sites`; das Konto wird
 *    Admin der neuen Seite),
 * 3. auf der neuen Seite die Person per E-Mail in die Gruppe „Seiten-Admin"
 *    eintragen (`<konsultation>/admin/users/add-single`). Antragsgrün legt für
 *    eine unbekannte Adresse ein bestätigtes Konto an und schickt selbst die
 *    Willkommensmail mit Passwort — die Einladung kommt nicht von uns.
 *
 * Die Felder und Marken stammen aus dem Antragsgrün-Quelltext
 * (`views/createsiteWizard/*`, `views/admin/users/_users_add_accounts.php`,
 * `plugins/antragsgruen_sites/views/manager/created.php`). Sie sind kein
 * Vertrag: jede Stufe prüft ihr Ergebnis und bricht mit dem Namen der Stufe ab.
 */
import * as cheerio from 'cheerio';

import { env } from '../../../config/env.js';

import { AntragsgruenFormError, FormClient, alertsOf, csrfOf, formValuesOf } from './formClient.js';

export interface HostingConfig {
  /** z. B. `https://antragsgruen.de` — Seiten liegen unter `https://<sub>.<host>/`. */
  baseUrl: string;
  botEmail: string;
  botPassword: string;
}

export interface SiteRequest {
  title: string;
  organization: string;
  subdomain: string;
  invitee: { email: string; nameGiven: string; nameFamily: string };
}

export interface CreatedSite {
  subdomain: string;
  /** Startseite der Konsultation, z. B. `https://kv-koeln.antragsgruen.de/kv-koeln`. */
  url: string;
  /** `false`: die Admin-Adresse der Veranstaltung steht noch auf dem Grünerator-Konto. */
  adminEmailHandedOver: boolean;
}

/** Was Antragsgrün als Subdomain annimmt (`[\w_-]+`), enger: klein, 3–40 Zeichen. */
export const SUBDOMAIN_RE = /^[a-z0-9][a-z0-9-]{2,39}$/;

/** Ohne Zugangsdaten des Grünerator-Kontos gibt es das Werkzeug nicht. */
export function hostingConfigFromEnv(): HostingConfig | null {
  const botEmail = env.ANTRAGSGRUEN_BOT_EMAIL?.trim();
  const botPassword = env.ANTRAGSGRUEN_BOT_PASSWORD;
  if (!botEmail || !botPassword) return null;
  return {
    baseUrl: (env.ANTRAGSGRUEN_HOSTING_URL?.trim() || 'https://antragsgruen.de').replace(
      /\/+$/,
      ''
    ),
    botEmail,
    botPassword,
  };
}

const WELCOME_TEXT = [
  'Hallo %NAME_GIVEN%,',
  '',
  'der Grünerator hat für dich eine Antragsgrün-Seite angelegt und dich als Seiten-Admin eingetragen:',
  '%LINK%',
  '',
  // Antragsgrün setzt hier Login und erzeugtes Passwort ein — nur bei einem
  // neuen Konto; ein bestehendes Konto bekommt eine leere Zeile.
  '%ACCOUNT%',
  '',
  'Die Seite ist noch nicht öffentlich. Unter „Einstellungen" legst du Antragsschluss, Impressum und Zugang fest und schaltest sie frei.',
].join('\n');

/** Die Antworten des Assistenten, wie sie der Assistent selbst als Vorgabe setzt (`SiteCreateForm`). */
function wizardForm(req: SiteRequest, csrf: string): URLSearchParams {
  const f = new URLSearchParams();
  f.set('_csrf', csrf);
  f.set('language', 'de');
  const set = (k: string, v: string) => f.set(`SiteCreateForm[${k}]`, v);
  f.append('SiteCreateForm[functionality][]', '1'); // Anträge
  set('singleMotion', '0');
  set('hasAmendments', '1');
  set('amendSinglePara', '0');
  set('motionScreening', '1');
  set('amendScreening', '1');
  set('motionsInitiatedBy', '2'); // eingeloggte Personen
  set('amendInitiatedBy', '2');
  set('applicationType', '1');
  set('motionsDeadlineExists', '0');
  set('amendDeadlineExists', '0');
  set('needsSupporters', '0');
  set('minSupporters', '3');
  set('hasComments', '0');
  set('speechQuotas', '0');
  set('speechLogin', '0');
  // Nicht sofort öffnen: die Person stellt die Seite erst ein und schaltet sie dann frei.
  set('openNow', '0');
  set('title', req.title);
  set('organization', req.organization);
  // Pflichtfeld „Kontakt" fürs Impressum. Bewusst ohne E-Mail-Adresse: die
  // Seite ist öffentlich, die Adresse trägt die Person selbst ein, wenn sie will.
  set('contact', `${req.organization}\n${req.invitee.nameGiven} ${req.invitee.nameFamily}`.trim());
  set('subdomain', req.subdomain);
  f.set('create', '');
  return f;
}

function fail(step: string, message: string, html?: string): never {
  const alerts = html ? alertsOf(html) : [];
  throw new AntragsgruenFormError(
    alerts.length ? `${message}: ${alerts.join(' · ')}` : message,
    step
  );
}

async function login(client: FormClient, config: HostingConfig): Promise<void> {
  const page = await client.request(`${config.baseUrl}/user/login`);
  const csrf = csrfOf(page.html);
  if (!csrf) fail('login', 'Kein CSRF-Token auf der Login-Seite');
  const form = new URLSearchParams({
    _csrf: csrf,
    username: config.botEmail,
    password: config.botPassword,
    loginusernamepassword: '',
  });
  const res = await client.request(`${config.baseUrl}/user/login`, { method: 'POST', form });
  // Erfolg ist eine Weiterleitung; ein Fehler zeigt das Formular erneut.
  if (!res.redirected) fail('login', 'Login des Grünerator-Kontos fehlgeschlagen', res.html);
}

export async function isSubdomainAvailable(
  client: FormClient,
  config: HostingConfig,
  subdomain: string
): Promise<boolean> {
  const res = await client.request(
    `${config.baseUrl}/check-subdomain?test=${encodeURIComponent(subdomain)}`
  );
  try {
    return (JSON.parse(res.html) as { available?: unknown }).available === true;
  } catch {
    fail('check-subdomain', `Unerwartete Antwort (HTTP ${res.status})`);
  }
}

async function createSiteForm(
  client: FormClient,
  config: HostingConfig,
  req: SiteRequest
): Promise<string> {
  const page = await client.request(`${config.baseUrl}/createsite?language=de`);
  if (page.redirected) fail('createsite', 'Das Grünerator-Konto darf keine Seite anlegen');
  const csrf = csrfOf(page.html);
  if (!csrf) fail('createsite', 'Kein CSRF-Token im Assistenten');
  const res = await client.request(`${config.baseUrl}/createsite`, {
    method: 'POST',
    form: wizardForm(req, csrf),
  });
  // Erfolg: die Seite „created" mit einem Formular, das zur neuen Konsultation führt.
  const action = cheerio.load(res.html)('form.createdForm').attr('action');
  if (!action) fail('createsite', 'Die Seite wurde nicht angelegt', res.html);
  return new URL(action, config.baseUrl).toString().replace(/\/+$/, '');
}

/** Die Gruppe „Seiten-Admin" im Formular „Person hinzufügen" (Titel nach Sprache der Seite). */
function siteAdminGroupId(html: string): string | null {
  const $ = cheerio.load(html);
  let id: string | null = null;
  $('input[name="userGroups[]"]').each((_, el) => {
    const label = $(el).parent('label').text().replace(/\s+/g, ' ').trim().toLowerCase();
    if (label === 'seiten-admin' || label === 'site admin') id = $(el).attr('value') ?? null;
  });
  return id;
}

/** Die Konten, die die Personenverwaltung kennt (`data-users` des Widgets). */
function listedEmails(html: string): string[] {
  const raw = cheerio.load(html)('[data-users]').attr('data-users');
  if (!raw) return [];
  try {
    const users = JSON.parse(raw) as { email?: string | null }[];
    return users.map((u) => (u.email ?? '').toLowerCase()).filter(Boolean);
  } catch {
    return [];
  }
}

async function inviteAsSiteAdmin(
  client: FormClient,
  consultationUrl: string,
  req: SiteRequest
): Promise<void> {
  const usersUrl = `${consultationUrl}/admin/users`;
  const page = await client.request(usersUrl);
  const csrf = csrfOf(page.html);
  const groupId = siteAdminGroupId(page.html);
  if (!csrf || !groupId) fail('invite', 'Gruppe „Seiten-Admin" nicht gefunden', page.html);
  const form = new URLSearchParams({
    _csrf: csrf,
    authType: 'email',
    // `createSingleDetailedUser` übernimmt die Adresse unverändert als Login; der Login vergleicht klein.
    authUsername: req.invitee.email.toLowerCase(),
    nameGiven: req.invitee.nameGiven,
    nameFamily: req.invitee.nameFamily,
    organization: req.organization,
    generatePassword: 'on',
    sendEmail: 'on',
    emailText: WELCOME_TEXT,
    addUsers: '',
  });
  form.append('userGroups[]', groupId);
  const res = await client.request(`${usersUrl}/add-single`, { method: 'POST', form });
  if (!listedEmails(res.html).includes(req.invitee.email.toLowerCase())) {
    fail('invite', 'Die Person steht danach nicht in der Personenverwaltung', res.html);
  }
}

const ADMIN_EMAIL_FIELD = 'consultation[adminEmail]';

/**
 * Antragsgrün trägt beim Anlegen die Adresse des anlegenden Kontos als
 * Admin-Adresse der Veranstaltung ein — das wäre das Grünerator-Konto. Sie ist
 * das Reply-To aller Mails der Seite; Antworten von Teilnehmenden landeten im
 * Postfach des Grünerators. Deshalb wird sie auf die Person umgestellt.
 */
async function handOverAdminEmail(
  client: FormClient,
  consultationUrl: string,
  email: string
): Promise<void> {
  const settingsUrl = `${consultationUrl}/admin/consultation`;
  const page = await client.request(settingsUrl);
  const form = formValuesOf(page.html, `form:has([name="${ADMIN_EMAIL_FIELD}"])`);
  if (!form) fail('admin-email', 'Einstellungsformular nicht gefunden', page.html);
  form.set(ADMIN_EMAIL_FIELD, email.toLowerCase());
  form.set('save', '');
  await client.request(settingsUrl, { method: 'POST', form });
  const after = await client.request(settingsUrl);
  const stored = cheerio.load(after.html)(`[name="${ADMIN_EMAIL_FIELD}"]`).attr('value');
  if (stored?.toLowerCase() !== email.toLowerCase()) {
    fail('admin-email', 'Die Admin-Adresse der Veranstaltung blieb unverändert', after.html);
  }
}

export async function createAntragsgruenSite(
  req: SiteRequest,
  config: HostingConfig,
  client: FormClient = new FormClient()
): Promise<CreatedSite> {
  if (!SUBDOMAIN_RE.test(req.subdomain)) {
    throw new AntragsgruenFormError(`Ungültige Subdomain „${req.subdomain}"`, 'validate');
  }
  await login(client, config);
  if (!(await isSubdomainAvailable(client, config, req.subdomain))) {
    throw new AntragsgruenFormError(
      `Die Subdomain „${req.subdomain}" ist vergeben`,
      'check-subdomain'
    );
  }
  const url = await createSiteForm(client, config, req);
  try {
    await inviteAsSiteAdmin(client, url, req);
  } catch (err) {
    // Die Seite steht schon; ohne die URL wüsste niemand, wo nachzuholen ist.
    if (err instanceof AntragsgruenFormError)
      throw new AntragsgruenFormError(err.message, err.step, url);
    throw err;
  }
  // Die Person ist Admin und hat ihre Zugangsdaten; scheitert nur das Umstellen
  // der Admin-Adresse, kann sie das selbst unter „Einstellungen" nachholen.
  let adminEmailHandedOver = true;
  try {
    await handOverAdminEmail(client, url, req.invitee.email);
  } catch (err) {
    if (!(err instanceof AntragsgruenFormError)) throw err;
    adminEmailHandedOver = false;
  }
  return { subdomain: req.subdomain, url, adminEmailHandedOver };
}
