/**
 * Push payload sealing. Every push is AES-256-GCM-encrypted with the key the
 * device generated itself, so APNs and FCM carry nothing readable.
 *
 * Output format: base64(nonce 12 ‖ ciphertext ‖ tag 16) — the "combined" form
 * that CryptoKit's `AES.GCM.SealedBox(combined:)` (iOS extension) and
 * expo-crypto's `AESSealedData.fromCombined` (Android task) both open.
 * The plaintext shape is F0 once an app ships: add fields, never rename.
 */
import { createCipheriv, createHmac, randomBytes } from 'node:crypto';

export interface PushPlaintext {
  v: 1;
  /** notifications.id — lets the app mark the entry read on tap. */
  id: string;
  title: string;
  body: string | null;
  /** Web path (action_url); the app maps it with `actionUrlToRoute`. */
  url: string | null;
  /** Per-device collapse id; same value replaces the shown notification. */
  collapse: string | null;
}

const TITLE_MAX = 100;
const BODY_MAX = 200;

/** Cut to `max` code points (never inside a surrogate pair), with an ellipsis. */
function clip(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length <= max ? text : `${chars.slice(0, max - 1).join('')}…`;
}

/**
 * Collapse/thread id for one device. Keyed with the device key so the same
 * project yields a different id on every member's phone — Apple cannot link
 * members of one project through a shared `apns-collapse-id`.
 */
export function collapseIdFor(deviceKey: Buffer, groupKey: string): string {
  return createHmac('sha256', deviceKey).update(groupKey).digest('hex').slice(0, 32);
}

export function buildPlaintext(
  notification: {
    id: string;
    title: string;
    body: string | null;
    action_url: string | null;
  },
  collapse: string | null
): PushPlaintext {
  return {
    v: 1,
    id: notification.id,
    title: clip(notification.title, TITLE_MAX),
    body: notification.body ? clip(notification.body, BODY_MAX) : null,
    url: notification.action_url,
    collapse,
  };
}

export function sealForDevice(deviceKey: Buffer, plaintext: PushPlaintext): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deviceKey, nonce);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(plaintext), 'utf8'),
    cipher.final(),
  ]);
  return Buffer.concat([nonce, ciphertext, cipher.getAuthTag()]).toString('base64');
}
