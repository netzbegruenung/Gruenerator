/**
 * Direct APNs sender (HTTP/2, token auth). No Expo, no third library: one
 * lazily opened `node:http2` session per environment, an ES256 provider JWT
 * from `jose`, refreshed every 40 minutes (APNs rejects tokens older than an
 * hour and refreshes more often than every 20 minutes).
 *
 * The visible alert is a constant; the content travels encrypted in `gp` and
 * is opened by the app's Notification Service Extension.
 */
import http2 from 'node:http2';

import { type ApnsEnvironment, type PushPriority } from '@gruenerator/contracts';
import { importPKCS8, SignJWT, type CryptoKey } from 'jose';

import { env } from '../../config/env.js';

const HOSTS: Record<ApnsEnvironment, string> = {
  production: 'https://api.push.apple.com',
  sandbox: 'https://api.sandbox.push.apple.com',
};
const TOPIC = 'de.gruenerator.app';
const JWT_TTL_MS = 40 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;
const IDLE_CLOSE_MS = 15 * 60 * 1000;

/** What Apple shows when the extension could not decrypt in time. */
export const APNS_FALLBACK_ALERT = { title: 'Grünerator', body: 'Neue Benachrichtigung' };

export interface ApnsMessage {
  token: string;
  environment: ApnsEnvironment;
  priority: PushPriority;
  collapseId: string | null;
  sealed: string;
  /** Unix seconds after which APNs drops the message. */
  expiresAt: number;
}

export type SendResult =
  { ok: true } | { ok: false; status: number; reason: string; unregistered: boolean };

interface ApnsConfig {
  keyP8: string;
  keyId: string;
  teamId: string;
}

function configFromEnv(): ApnsConfig | null {
  if (!env.APNS_KEY_P8_BASE64 || !env.APNS_KEY_ID || !env.APNS_TEAM_ID) return null;
  return {
    keyP8: Buffer.from(env.APNS_KEY_P8_BASE64, 'base64').toString('utf8'),
    keyId: env.APNS_KEY_ID,
    teamId: env.APNS_TEAM_ID,
  };
}

const config = configFromEnv();

export function apnsConfigured(): boolean {
  return config !== null;
}

let signingKey: Promise<CryptoKey> | null = null;
let jwtCache: { token: string; at: number } | null = null;

async function providerToken(cfg: ApnsConfig): Promise<string> {
  if (jwtCache && Date.now() - jwtCache.at < JWT_TTL_MS) return jwtCache.token;
  signingKey ??= importPKCS8(cfg.keyP8, 'ES256');
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: cfg.keyId })
    .setIssuer(cfg.teamId)
    .setIssuedAt()
    .sign(await signingKey);
  jwtCache = { token, at: Date.now() };
  return token;
}

const sessions = new Map<ApnsEnvironment, http2.ClientHttp2Session>();

function session(environment: ApnsEnvironment): http2.ClientHttp2Session {
  const existing = sessions.get(environment);
  if (existing && !existing.closed && !existing.destroyed) return existing;
  const fresh = http2.connect(HOSTS[environment]);
  const forget = () => {
    if (sessions.get(environment) === fresh) sessions.delete(environment);
  };
  fresh.on('error', forget);
  fresh.on('close', forget);
  fresh.on('goaway', forget);
  fresh.setTimeout(IDLE_CLOSE_MS, () => fresh.close());
  sessions.set(environment, fresh);
  return fresh;
}

/** 410 or a token Apple will never accept again: the device row can go. */
function isUnregistered(status: number, reason: string): boolean {
  return (
    status === 410 ||
    (status === 400 && (reason === 'BadDeviceToken' || reason === 'DeviceTokenNotForTopic'))
  );
}

export async function sendApns(message: ApnsMessage): Promise<SendResult> {
  if (!config) return { ok: false, status: 0, reason: 'not_configured', unregistered: false };
  const jwt = await providerToken(config);
  const body = JSON.stringify({
    aps: {
      alert: APNS_FALLBACK_ALERT,
      'mutable-content': 1,
      sound: 'default',
      ...(message.collapseId ? { 'thread-id': message.collapseId } : {}),
    },
    gp: message.sealed,
  });

  return new Promise<SendResult>((resolve) => {
    const req = session(message.environment).request({
      ':method': 'POST',
      ':path': `/3/device/${message.token}`,
      authorization: `bearer ${jwt}`,
      'apns-push-type': 'alert',
      'apns-topic': TOPIC,
      'apns-priority': message.priority === 'high' ? '10' : '5',
      'apns-expiration': String(message.expiresAt),
      ...(message.collapseId ? { 'apns-collapse-id': message.collapseId } : {}),
    });
    let status = 0;
    let data = '';
    req.setEncoding('utf8');
    req.on('response', (headers) => {
      status = Number(headers[':status']);
    });
    req.on('data', (chunk: string) => {
      data += chunk;
    });
    req.on('end', () => {
      if (status === 200) return resolve({ ok: true });
      let reason = 'unknown';
      try {
        reason = (JSON.parse(data) as { reason?: string }).reason ?? reason;
      } catch {
        // empty or non-JSON body — keep 'unknown'
      }
      // A rejected provider token is ours to fix; drop the cache so the next
      // send signs a fresh one instead of failing for the next 40 minutes.
      if (status === 403) jwtCache = null;
      resolve({ ok: false, status, reason, unregistered: isUnregistered(status, reason) });
    });
    req.on('error', (err: Error) =>
      resolve({ ok: false, status: 0, reason: err.message, unregistered: false })
    );
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.close(http2.constants.NGHTTP2_CANCEL);
      resolve({ ok: false, status: 0, reason: 'timeout', unregistered: false });
    });
    req.end(body);
  });
}
