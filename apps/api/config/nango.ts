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
