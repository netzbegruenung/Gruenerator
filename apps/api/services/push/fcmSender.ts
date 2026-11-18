/**
 * Direct FCM HTTP v1 sender. No `firebase-admin`: the OAuth access token comes
 * from a service-account JWT signed with `jose`, the send is a plain `fetch`.
 *
 * Messages are DATA-ONLY on purpose: a `notification` block would be shown by
 * the system without the app ever running, i.e. without decryption. The app's
 * background task opens `gp` and raises the local notification itself.
 */
import { type PushPriority } from '@gruenerator/contracts';
import { importPKCS8, SignJWT } from 'jose';

import { env } from '../../config/env.js';
import { createLogger } from '../../utils/logger.js';

import { type SendResult } from './apnsSender.js';

const log = createLogger('fcmSender');

const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token';
const REQUEST_TIMEOUT_MS = 10_000;
/** Refresh this long before Google's expiry to never send a stale token. */
const TOKEN_MARGIN_MS = 5 * 60 * 1000;

export interface FcmMessage {
  token: string;
  priority: PushPriority;
  sealed: string;
  ttlSeconds: number;
}

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
}

/** A broken secret switches Android push off; it must not take the API down. */
function configFromEnv(): ServiceAccount | null {
  if (!env.FCM_SERVICE_ACCOUNT_JSON_BASE64) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(env.FCM_SERVICE_ACCOUNT_JSON_BASE64, 'base64').toString('utf8')
    ) as Partial<ServiceAccount>;
    if (parsed.project_id && parsed.client_email && parsed.private_key) {
      return parsed as ServiceAccount;
    }
    log.error('FCM_SERVICE_ACCOUNT_JSON_BASE64 lacks project_id/client_email/private_key');
  } catch (err) {
    log.error('FCM_SERVICE_ACCOUNT_JSON_BASE64 is not base64 JSON', err);
  }
  return null;
}

const account = configFromEnv();

export function fcmConfigured(): boolean {
  return account !== null;
}

let accessToken: { value: string; expiresAt: number } | null = null;
let pending: Promise<string> | null = null;

async function fetchAccessToken(sa: ServiceAccount): Promise<string> {
  const tokenUri = sa.token_uri ?? DEFAULT_TOKEN_URI;
  const assertion = await new SignJWT({ scope: SCOPE })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(sa.client_email)
    .setAudience(tokenUri)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(await importPKCS8(sa.private_key, 'RS256'));
  const res = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`FCM OAuth token request failed: ${res.status}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  accessToken = {
    value: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000 - TOKEN_MARGIN_MS,
  };
  return json.access_token;
}

async function oauthToken(sa: ServiceAccount): Promise<string> {
  if (accessToken && Date.now() < accessToken.expiresAt) return accessToken.value;
  // One refresh at a time: a bulk send must not mint 200 tokens in parallel.
  pending ??= fetchAccessToken(sa).finally(() => {
    pending = null;
  });
  return pending;
}

interface FcmErrorBody {
  error?: { status?: string; message?: string; details?: Array<{ errorCode?: string }> };
}

export async function sendFcm(message: FcmMessage): Promise<SendResult> {
  if (!account) return { ok: false, status: 0, reason: 'not_configured', unregistered: false };
  try {
    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${await oauthToken(account)}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            token: message.token,
            data: { gp: message.sealed },
            android: {
              priority: message.priority === 'high' ? 'HIGH' : 'NORMAL',
              ttl: `${message.ttlSeconds}s`,
            },
          },
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }
    );
    if (res.ok) return { ok: true };
    const json = (await res.json().catch(() => ({}))) as FcmErrorBody;
    const code =
      json.error?.details?.find((d) => d.errorCode)?.errorCode ?? json.error?.status ?? 'unknown';
    if (res.status === 401) accessToken = null;
    return {
      ok: false,
      status: res.status,
      reason: code,
      unregistered: code === 'UNREGISTERED',
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      reason: err instanceof Error ? err.message : String(err),
      unregistered: false,
    };
  }
}
