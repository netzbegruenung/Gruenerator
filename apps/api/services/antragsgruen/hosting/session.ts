/**
 * Das Grünerator-Konto bei antragsgruen.de: Zugangsdaten aus der Env und der
 * Login per Formular, auf den jeder weitere Schritt aufsetzt.
 */
import * as cheerio from 'cheerio';

import { env } from '../../../config/env.js';
import { createLogger } from '../../../utils/logger.js';
import { redisClient } from '../../../utils/redis/client.js';
import { FormStepError, FormClient, alertsOf, csrfOf } from '../../webForms/formClient.js';

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
const LOGIN_BLOCKED_TEXT =
  'Antragsgrün verlangt beim Login des Grünerator-Kontos gerade ein Captcha (zu viele Fehlversuche). Das hebt sich nach spätestens einer Stunde auf; versuch es dann noch einmal.';

const LOGIN_PAUSED_TEXT =
  'Das Grünerator-Konto kann sich gerade nicht bei Antragsgrün anmelden. Das Team ist informiert; versuch es später noch einmal.';

/** Der Satz für die Person, wenn der Login selbst das Problem ist; sonst `null`. */
export function loginRefusalText(err: unknown): string | null {
  if (!(err instanceof FormStepError)) return null;
  if (err.step === 'captcha') return LOGIN_BLOCKED_TEXT;
  if (err.step === 'login' || err.step === 'login-paused') return LOGIN_PAUSED_TEXT;
  return null;
}

/**
 * Eine Sitzung gilt so lange als angemeldet. PHP räumt Sitzungen ohne eigene
 * Einstellung nach 24 Minuten ab; wie lange antragsgruen.de sie hält, ist nicht
 * gemessen — deshalb deutlich darunter.
 */
const SESSION_TTL_MS = 5 * 60_000;

/**
 * Nach einem gescheiterten Login ruht jeder weitere so lange. Antragsgrün sperrt
 * ab drei Fehlversuchen in 60 Minuten; mit 35 Minuten Pause passen höchstens
 * zwei hinein — ein falsches Passwort in der Konfiguration sperrt das Konto
 * dann nicht mehr selbst. Die Pause liegt in Redis, damit sie für alle Worker
 * gilt; fällt Redis aus, hält sie wenigstens der eigene Prozess.
 */
const LOGIN_PAUSE_SECONDS = 35 * 60;
const LOGIN_PAUSE_KEY = 'antragsgruen:bot-login-paused';
let pausedUntil = 0;

async function loginPaused(): Promise<boolean> {
  if (Date.now() < pausedUntil) return true;
  if (!redisClient.isReady) return false;
  try {
    return (await redisClient.exists(LOGIN_PAUSE_KEY)) === 1;
  } catch {
    return false;
  }
}

async function pauseLogins(): Promise<void> {
  pausedUntil = Date.now() + LOGIN_PAUSE_SECONDS * 1000;
  if (!redisClient.isReady) return;
  try {
    await redisClient.set(LOGIN_PAUSE_KEY, '1', { EX: LOGIN_PAUSE_SECONDS });
  } catch {
    // Die Pause im Prozess bleibt.
  }
}

const loggedInAt = new WeakMap<FormClient, number>();
let shared: FormClient | null = null;

/**
 * Die gemeinsame Sitzung des Grünerator-Kontos. Wer sie nimmt, statt je Aufruf
 * eine neue anzulegen, meldet sich höchstens alle {@link SESSION_TTL_MS} an.
 */
export function botClient(): FormClient {
  return (shared ??= new FormClient());
}

/** Nur für Tests: Sitzung und Pause zurücksetzen. */
export function resetBotSessionForTests(): void {
  shared = null;
  pausedUntil = 0;
}

function fail(step: string, message: string, html?: string): never {
  const alerts = html ? alertsOf(html) : [];
  throw new FormStepError(alerts.length ? `${message}: ${alerts.join(' · ')}` : message, step);
}

/**
 * `/login` ist die Route, die Antragsgrün selbst verlinkt (`$userPaths` in
 * `config/urls.php`). `/user/login` geht auf antragsgruen.de auch, auf einer
 * frischen Multisite-Installation 4.18.1 aber nicht (404 „Veranstaltung nicht
 * gefunden", gemessen am 18.11.2026).
 */
export async function login(client: FormClient, config: HostingConfig): Promise<void> {
  const at = loggedInAt.get(client);
  if (at !== undefined && Date.now() - at < SESSION_TTL_MS) return;
  if (await loginPaused()) {
    throw new FormStepError('Login des Grünerator-Kontos pausiert', 'login-paused');
  }
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
  if (res.redirected) {
    loggedInAt.set(client, Date.now());
    return;
  }
  await pauseLogins();
  if (res.html.includes('name="captcha"')) {
    log.error(
      `Antragsgrün verlangt ein Captcha für ${config.botEmail}; Logins ruhen ${LOGIN_PAUSE_SECONDS / 60} min`
    );
    fail('captcha', 'Login des Grünerator-Kontos verlangt ein Captcha', res.html);
  }
  log.error(
    `Login von ${config.botEmail} bei Antragsgrün fehlgeschlagen (${alertsOf(res.html).join(' · ') || 'ohne Meldung'}); Logins ruhen ${LOGIN_PAUSE_SECONDS / 60} min. Zugangsdaten prüfen.`
  );
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
    throw new FormStepError(
      'Das Grünerator-Konto ist auf dieser Seite nicht mehr Admin',
      'revoked'
    );
  }
  if (!adminEmailsOf(page).includes(personEmail.trim().toLowerCase())) {
    throw new FormStepError(`${personEmail} ist auf dieser Seite nicht Admin`, 'not-admin');
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
