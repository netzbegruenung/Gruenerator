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
  // NOTE: `google` is temporarily hidden via HIDDEN_NANGO_PROVIDERS below — the
  // Google OAuth app / Nango integration isn't wired up yet. Kept in the type so
  // connectRetrieval's `case 'google'` still compiles; re-enable by removing it
  // from HIDDEN_NANGO_PROVIDERS.
  google: {
    key: 'google',
    label: 'Google Workspace',
    services: ['Google Drive', 'Google Docs', 'Google Sheets'],
  },
  microsoft: {
    key: 'microsoft',
    label: 'Microsoft 365',
    services: ['OneDrive', 'SharePoint', 'Teams (Dateien)'],
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

/** Providers hidden from the connector list until their OAuth setup is complete. */
export const HIDDEN_NANGO_PROVIDERS = new Set<NangoProviderKey>(['google']);
