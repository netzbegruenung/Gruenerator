/**
 * Das Grünerator-Konto bei antragsgruen.de: Zugangsdaten aus der Env und der
 * Login per Formular, auf den jeder weitere Schritt aufsetzt.
 */
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
 * Ist das Grünerator-Konto auf der Seite noch Admin? Die Personenverwaltung
 * sehen nur Admins; sonst leitet Antragsgrün um. Die Person kann das Konto dort
 * austragen — danach darf der Grünerator auf der Seite nichts mehr tun.
 */
export async function isSiteAdmin(
  client: FormClient,
  origin: string,
  consultation: string
): Promise<boolean> {
  const res = await client.request(`${origin}/${consultation}/admin/users`);
  return !res.redirected && res.status === 200 && res.html.includes('data-users');
}
