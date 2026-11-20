import { Nango } from '@nangohq/node';

import { env } from './env.js';

let _nango: Nango | null = null;

export function getNango(): Nango {
  if (!_nango) {
    const secretKey = env.NANGO_SECRET_KEY;
    if (!secretKey) {
      throw new Error('NANGO_SECRET_KEY is not configured. Set it in your .env file.');
    }
    _nango = new Nango({
      host: env.NANGO_SERVER_URL,
      secretKey,
    });
  }
  return _nango;
}

export const NANGO_PROVIDERS = {
  // Scope `drive.file`: the app only sees files picked in the Google Picker
  // (`GET /api/connections/google/picker`), so the chat opens the picker
  // instead of a folder listing.
  google: {
    key: 'google',
    label: 'Google Workspace',
    services: ['Google Drive', 'Google Docs', 'Google Sheets'],
  },
  microsoft: {
    key: 'microsoft',
    label: 'Microsoft 365',
    services: ['OneDrive'],
  },
  // Eigene Integration neben `microsoft`, dieselbe Azure-App: Teams gibt es nur
  // für Dienst- und Schulkonten, und mit den Teams-Scopes im Satz scheitert der
  // Zustimmungsdialog privater Konten. Scopes: User.Read Team.ReadBasic.All
  // Channel.ReadBasic.All Files.ReadWrite.All offline_access.
  'microsoft-teams': {
    key: 'microsoft-teams',
    label: 'Microsoft Teams',
    services: ['Kanal-Dateien', 'Ablage in Kanälen'],
  },
  // Bot-Token (channels:read groups:read chat:write): gepostet wird nur in
  // Kanäle, in die jemand den Grünerator eingeladen hat. Gelesen wird nichts —
  // `conversations.history` ist für Apps außerhalb des Marketplace auf eine
  // Anfrage pro Minute gedrosselt.
  slack: {
    key: 'slack',
    label: 'Slack',
    services: ['Nachrichten posten'],
  },
  // Postfächer, nur lesen. Eigene Integrationen neben `google`/`microsoft`,
  // damit Mail eine eigene Zustimmung bleibt und bestehende Drive-/OneDrive-
  // Verbindungen nicht neu zustimmen müssen. Gmail: `gmail.readonly` ist ein
  // „restricted scope“ (bis zur Google-Prüfung nur Testnutzer*innen).
  // Outlook: `User.Read Mail.Read offline_access`, auch private Konten.
  'google-mail': {
    key: 'google-mail',
    label: 'Gmail',
    services: ['Mails lesen'],
  },
  'microsoft-mail': {
    key: 'microsoft-mail',
    label: 'Outlook',
    services: ['Mails lesen'],
  },
  jira: {
    key: 'jira',
    label: 'Jira',
    services: ['Projekte', 'Issues', 'Anhänge'],
  },
  confluence: {
    key: 'confluence',
    label: 'Confluence',
    services: ['Spaces', 'Seiten', 'Inhalte'],
  },
} as const;

export type NangoProviderKey = keyof typeof NANGO_PROVIDERS;

/**
 * Providers hidden from the connector list until their OAuth setup is complete.
 * Empty since 19.11.2026: Google Workspace is open to everyone, labelled
 * experimental like Microsoft 365.
 */
export const HIDDEN_NANGO_PROVIDERS = new Set<NangoProviderKey>();

/**
 * Providers only instance admins may connect, list or use until they are opened
 * to everyone. Enforced in `ConnectionService` — every route and the chat's
 * `@connect` retrieval go through it, so no caller needs its own check.
 *
 * Empty since 16.11.2026: Microsoft 365 is open to everyone, labelled
 * experimental in the connector directory.
 */
export const ADMIN_ONLY_NANGO_PROVIDERS = new Set<NangoProviderKey>([
  // Bis die Integrationen in Nango stehen und einmal echt durchlaufen sind.
  'microsoft-teams',
  'slack',
  'google-mail',
  'microsoft-mail',
]);
