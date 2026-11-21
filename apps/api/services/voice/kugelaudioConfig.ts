import { env } from '../../config/env.js';

/**
 * The vendor default host `api.kugelaudio.com` is geo-routed and may serve a
 * request from outside the EU. The EU host is therefore the default here, so
 * that leaving the EU takes a deliberate `KUGELAUDIO_BASE_URL` override rather
 * than a forgotten one.
 */
const EU_BASE_URL = 'https://api.eu.kugelaudio.com';

export function kugelaudioBaseUrl(): string {
  return env.KUGELAUDIO_BASE_URL || EU_BASE_URL;
}

export function kugelaudioApiKey(purpose: string): string {
  const key = env.KUGELAUDIO_API_KEY;
  if (!key) {
    throw new Error(`${purpose} ist nicht konfiguriert (KUGELAUDIO_API_KEY fehlt).`);
  }
  return key;
}
