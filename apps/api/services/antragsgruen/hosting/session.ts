/**
 * Das Grünerator-Konto bei antragsgruen.de: Zugangsdaten aus der Env und der
 * Login per Formular, auf den jeder weitere Schritt aufsetzt.
 */
import * as cheerio from 'cheerio';

import { env } from '../../../config/env.js';
import { createLogger } from '../../../utils/logger.js';

import { AntragsgruenFormError, alertsOf, csrfOf, type FormClient } from './formClient.js';

export interface HostingConfig {
  /** z. B. `https://antragsgruen.de` — Seiten liegen unter `https://<sub>.<host>/`. */
  baseUrl: string;
  botEmail: string;
  botPassword: string;
}

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

const log = createLogger('antragsgruenSession');

/**
 * Antragsgrün verlangt nach drei Fehlversuchen für einen Benutzernamen (egal
 * von wo) eine Stunde lang ein Captcha (`FailedLoginAttempt`, gemessen am
 * 18.11.2026). Das Grünerator-Konto kann keins lösen — so lange ruht alles.
 */
export const LOGIN_BLOCKED_TEXT =
  'Antragsgrün verlangt beim Login des Grünerator-Kontos gerade ein Captcha (zu viele Fehlversuche). Das hebt sich nach spätestens einer Stunde auf; versuch es dann noch einmal.';

function fail(step: string, message: string, html?: string): never {
  const alerts = html ? alertsOf(html) : [];
  throw new AntragsgruenFormError(
    alerts.length ? `${message}: ${alerts.join(' · ')}` : message,
    step
  );
}

/**
 * `/login` ist die Route, die Antragsgrün selbst verlinkt (`$userPaths` in
 * `config/urls.php`). `/user/login` geht auf antragsgruen.de auch, auf einer
 * frischen Multisite-Installation 4.18.1 aber nicht (404 „Veranstaltung nicht
 * gefunden", gemessen am 18.11.2026).
 */
export async function login(client: FormClient, config: HostingConfig): Promise<void> {
  const page = await client.request(`${config.baseUrl}/login`);
  const csrf = csrfOf(page.html);
  if (!csrf) fail('login', 'Kein CSRF-Token auf der Login-Seite');
  const form = new URLSearchParams({
    _csrf: csrf,
    username: config.botEmail,
    password: config.botPassword,
    loginusernamepassword: '',
  });
  const res = await client.request(`${config.baseUrl}/login`, { method: 'POST', form });
  // Erfolg ist eine Weiterleitung; ein Fehler zeigt das Formular erneut.
  if (res.redirected) return;
  if (res.html.includes('name="captcha"')) {
    log.error(`Antragsgrün verlangt ein Captcha für ${config.botEmail} — Login gesperrt`);
    fail('captcha', 'Login des Grünerator-Kontos verlangt ein Captcha', res.html);
  }
  fail('login', 'Login des Grünerator-Kontos fehlgeschlagen', res.html);
}

/**
 * Die Adressen aller Konten in einer Admin-Gruppe der Seite (Gruppenrecht
 * `admin-all`: „Seiten-Admin" und „Veranstaltungs-Admin"), gelesen aus dem
 * Widget der Personenverwaltung (`data-users`, `data-groups`).
 */
export function adminEmailsOf(html: string): string[] {
  const $ = cheerio.load(html);
  const parse = <T>(attr: string): T[] => {
    try {
      const raw = $(`[${attr}]`).attr(attr);
      const value: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(value) ? (value as T[]) : [];
    } catch {
      return [];
    }
  };
  const adminGroups = new Set(
    parse<{ id?: number; default_permissions?: string[] | string | null }>('data-groups')
      .filter((g) => [g.default_permissions ?? []].flat().includes('admin-all'))
      .map((g) => g.id)
  );
  return parse<{ email?: string | null; groups?: number[] }>('data-users')
    .filter((u) => u.groups?.some((id) => adminGroups.has(id)))
    .map((u) => (u.email ?? '').trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Die Personenverwaltung der Seite, wenn das Grünerator-Konto sie sehen darf —
 * das dürfen nur Admins; sonst leitet Antragsgrün um, und es kommt `null`.
 */
export async function siteAdminPage(
  client: FormClient,
  origin: string,
  consultation: string
): Promise<string | null> {
  const res = await client.request(`${origin}/${consultation}/admin/users`);
  return !res.redirected && res.status === 200 && res.html.includes('data-users') ? res.html : null;
}

/**
 * Vor jedem Schreiben: das Grünerator-Konto UND die Person (mit der Adresse
 * ihres Grünerator-Kontos) sind Admin der Seite. Das Konto ist geteilt — ohne
 * die zweite Prüfung handelte es für jemanden, der auf der Seite nichts mehr
 * zu sagen hat. `revoked`: das Konto wurde ausgetragen; `not-admin`: die Person.
 */
export async function requireAdmins(
  client: FormClient,
  origin: string,
  consultation: string,
  personEmail: string
): Promise<void> {
  const page = await siteAdminPage(client, origin, consultation);
  if (!page) {
    throw new AntragsgruenFormError(
      'Das Grünerator-Konto ist auf dieser Seite nicht mehr Admin',
      'revoked'
    );
  }
  if (!adminEmailsOf(page).includes(personEmail.trim().toLowerCase())) {
    throw new AntragsgruenFormError(`${personEmail} ist auf dieser Seite nicht Admin`, 'not-admin');
  }
}

/**
 * Ist das Grünerator-Konto auf der Seite noch Admin? Die Person kann das Konto
 * in der Personenverwaltung austragen — danach darf der Grünerator auf der
 * Seite nichts mehr tun.
 */
export async function isSiteAdmin(
  client: FormClient,
  origin: string,
  consultation: string
): Promise<boolean> {
  return (await siteAdminPage(client, origin, consultation)) !== null;
}
