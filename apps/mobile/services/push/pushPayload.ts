/**
 * The decrypted push content and where a tapped notification leads. Pure, so
 * it runs in the node test lane; decryption itself sits in `pushTask.ts`
 * (Android) and `targets/notification-service/` (iOS).
 *
 * The shape is what `apps/api/services/push/pushCrypto.ts` seals (`v: 1`).
 */
export interface PushPayload {
  id: string;
  title: string;
  body: string | null;
  url: string | null;
  collapse: string | null;
}

/** Shown when a push cannot be opened (no key, foreign key, newer format). */
export const PUSH_FALLBACK = { title: 'Grünerator', body: 'Neue Benachrichtigung' } as const;

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

export function parsePushPayload(text: string): PushPayload | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const id = str(r.id);
  const title = str(r.title);
  if (r.v !== 1 || !id || !title) return null;
  return { id, title, body: str(r.body), url: str(r.url), collapse: str(r.collapse) };
}

/** UTF-8 bytes → string without TextDecoder (not guaranteed on Hermes). */
export function utf8Decode(bytes: Uint8Array): string {
  let encoded = '';
  for (const b of bytes) encoded += `%${b.toString(16).padStart(2, '0')}`;
  return decodeURIComponent(encoded);
}

/**
 * `content.data` of a tapped push: Android gets it from the local notification
 * the task raised, iOS from `userInfo.body` that the extension wrote. Local
 * notifications without a `url` (the subtitle export) are not ours to route.
 */
export function pushTargetOf(data: unknown): { url: string; id: string | null } | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Record<string, unknown>;
  const url = str(d.url);
  return url ? { url, id: str(d.id) } : null;
}
