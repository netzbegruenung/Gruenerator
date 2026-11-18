/**
 * Das Grünerator-Konto bei antragsgruen.de: Zugangsdaten aus der Env und der
 * Login per Formular, auf den jeder weitere Schritt aufsetzt.
 */
import * as cheerio from 'cheerio';

import { env } from '../../../config/env.js';

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

function fail(step: string, message: string, html?: string): never {
  const alerts = html ? alertsOf(html) : [];
  throw new AntragsgruenFormError(
    alerts.length ? `${message}: ${alerts.join(' · ')}` : message,
    step
  );
}

export async function login(client: FormClient, config: HostingConfig): Promise<void> {
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
