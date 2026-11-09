/**
 * Opt-in, registration and upkeep of app push on this device.
 *
 * Nothing here runs before the person flips the switch: no permission prompt,
 * no token, no request to Apple, Google or us. The token goes to OUR server
 * only — never `getExpoPushTokenAsync`, which would hand it to Expo (USA).
 * Push belongs to a session: when the login goes away, so does the local state;
 * the server row goes with the session by itself.
 */
import { getContractsClient } from '@gruenerator/shared/api';
import { useAuthStore } from '@gruenerator/shared/stores';
import { type EventSubscription } from 'expo';
import * as Application from 'expo-application';
import { AESEncryptionKey, AESKeySize } from 'expo-crypto';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import {
  clearPushState,
  readPushKey,
  readRegistration,
  writePushKey,
  writeRegistration,
} from './pushKeyStore';
import { ANDROID_PUSH_CHANNEL } from './pushTask';

/** Keeps `last_seen_at` fresh without a request on every start. */
const HEARTBEAT_MS = 7 * 24 * 60 * 60 * 1000;

export type EnablePushResult = 'enabled' | 'denied' | 'unavailable' | 'failed';

async function apnsEnvironment(): Promise<'production' | 'sandbox' | null> {
  if (Platform.OS !== 'ios') return null;
  const env = await Application.getIosPushNotificationServiceEnvironmentAsync();
  return env === 'development' ? 'sandbox' : 'production';
}

async function deviceKey(): Promise<string> {
  const existing = await readPushKey();
  if (existing) return existing;
  const generated = await (await AESEncryptionKey.generate(AESKeySize.AES256)).encoded('base64');
  await writePushKey(generated);
  return generated;
}

async function register(userId: string, token: string): Promise<void> {
  const res = await getContractsClient().push.register({
    body: {
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
      token,
      key: await deviceKey(),
      apnsEnvironment: await apnsEnvironment(),
    },
  });
  if (res.status !== 200) throw new Error(`Push registration failed (HTTP ${res.status})`);
  await writeRegistration({ deviceId: res.body.id, userId, token, syncedAt: Date.now() });
}

async function nativeToken(): Promise<string> {
  // Old builds left Expo's auto-registration on; its token listener would
  // forward the fresh token to exp.host. Off before we ask for one.
  await Notifications.setAutoServerRegistrationEnabledAsync(false).catch(() => {});
  const token = await Notifications.getDevicePushTokenAsync();
  // `data` is typed `any` (web returns a subscription object); native is a string.
  const data: unknown = token.data;
  if (typeof data !== 'string') throw new Error('No native push token');
  return data;
}

export async function isPushEnabled(): Promise<boolean> {
  return (await readRegistration()) !== null;
}

export async function enablePush(): Promise<EnablePushResult> {
  const userId = useAuthStore.getState().user?.id;
  if (!userId) return 'failed';
  if (Platform.OS === 'android') {
    // Android 13 only shows the permission prompt once a channel exists.
    await Notifications.setNotificationChannelAsync(ANDROID_PUSH_CHANNEL, {
      name: 'Benachrichtigungen',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) return 'denied';
  let token: string;
  try {
    token = await nativeToken();
  } catch {
    // e.g. a local Android build without google-services.json
    return 'unavailable';
  }
  try {
    await register(userId, token);
    return 'enabled';
  } catch {
    return 'failed';
  }
}

/** Local cleanup only; also drops the FCM token so Google stops routing to it. */
async function forgetDevice(): Promise<void> {
  await clearPushState();
  if (Platform.OS === 'android') {
    await Notifications.unregisterForNotificationsAsync().catch(() => {});
  }
}

export async function disablePush(): Promise<void> {
  const registration = await readRegistration();
  if (registration) {
    await getContractsClient()
      .push.unregister({ params: { id: registration.deviceId } })
      .catch(() => {});
  }
  await forgetDevice();
}

/**
 * Called once a user is signed in. Re-registers only when the token changed or
 * the heartbeat is due; a registration of another account is dropped (push is
 * opt-in per account, not per phone).
 */
export async function syncPushRegistration(userId: string): Promise<void> {
  const registration = await readRegistration();
  if (!registration) return;
  if (registration.userId !== userId) {
    await forgetDevice();
    return;
  }
  try {
    const token = await nativeToken();
    if (token !== registration.token || Date.now() - registration.syncedAt > HEARTBEAT_MS) {
      await register(userId, token);
    }
  } catch {
    // Offline or token unavailable — the next start tries again.
  }
}

let tokenSubscription: EventSubscription | null = null;

/** Follow token rotations while push is on. Idempotent. */
export function watchPushToken(userId: string): void {
  tokenSubscription ??= Notifications.addPushTokenListener(({ data }) => {
    void readRegistration().then((registration) => {
      if (registration?.userId === userId && registration.token !== String(data)) {
        return register(userId, String(data)).catch(() => {});
      }
    });
  });
}

// Every path that ends a login (logout, a 401, account deletion) clears the
// user; the device must stop being "on" with it.
useAuthStore.subscribe((state, prev) => {
  if (prev.user && !state.user) {
    tokenSubscription?.remove();
    tokenSubscription = null;
    void forgetDevice();
  }
});
