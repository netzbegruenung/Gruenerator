/**
 * Registration store for app push devices. A token is unique: registering it
 * again (token refresh, account switch on the same phone) moves the row to the
 * new user, session and key.
 */
import { type ApnsEnvironment, type PushPlatform } from '@gruenerator/contracts';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import { pushDevices } from '../../database/schema/index.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';

/** Bounds the fan-out per user; the least recently seen devices go first. */
export const MAX_DEVICES_PER_USER = 10;

export interface RegisterPushDeviceInput {
  userId: string;
  /** Better Auth session id; null only for the dev auth bypass. */
  sessionId: string | null;
  platform: PushPlatform;
  token: string;
  key: Buffer;
  apnsEnvironment: ApnsEnvironment | null;
}

export async function registerPushDevice(input: RegisterPushDeviceInput): Promise<string> {
  const db = getDrizzleInstance();
  const values = {
    user_id: input.userId,
    session_id: input.sessionId,
    platform: input.platform,
    token: input.token,
    key: input.key,
    apns_environment: input.apnsEnvironment,
  };
  const [row] = await db
    .insert(pushDevices)
    .values(values)
    .onConflictDoUpdate({
      target: pushDevices.token,
      set: { ...values, last_seen_at: sql`now()` },
    })
    .returning({ id: pushDevices.id });

  const surplus = await db
    .select({ id: pushDevices.id })
    .from(pushDevices)
    .where(eq(pushDevices.user_id, input.userId))
    .orderBy(desc(pushDevices.last_seen_at))
    .offset(MAX_DEVICES_PER_USER);
  if (surplus.length > 0) {
    await db.delete(pushDevices).where(
      inArray(
        pushDevices.id,
        surplus.map((r) => r.id)
      )
    );
  }
  return row.id;
}

export async function unregisterPushDevice(userId: string, deviceId: string): Promise<void> {
  const db = getDrizzleInstance();
  await db
    .delete(pushDevices)
    .where(and(eq(pushDevices.id, deviceId), eq(pushDevices.user_id, userId)));
}

export async function removePushDevices(deviceIds: string[]): Promise<void> {
  if (deviceIds.length === 0) return;
  const db = getDrizzleInstance();
  await db.delete(pushDevices).where(inArray(pushDevices.id, deviceIds));
}
