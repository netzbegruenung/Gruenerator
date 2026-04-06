import { Nango } from '@nangohq/node';

let _nango: Nango | null = null;

export function getNango(): Nango {
  if (!_nango) {
    const secretKey = process.env.NANGO_SECRET_KEY;
    if (!secretKey) {
      throw new Error('NANGO_SECRET_KEY is not configured. Set it in your .env file.');
    }
    _nango = new Nango({
      host: process.env.NANGO_SERVER_URL || 'http://nango:3003',
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
