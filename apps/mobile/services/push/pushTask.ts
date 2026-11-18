/**
 * Android: FCM delivers data-only messages (`{ gp }`), which nothing displays on
 * its own. This task opens `gp` with the device key and raises the local
 * notification. It runs in foreground, background and from a killed app —
 * hence module scope, imported first by `index.ts` (headless starts load only
 * the entry).
 *
 * iOS never reaches this: there the Notification Service Extension decrypts.
 */
import { AESEncryptionKey, AESSealedData, aesDecryptAsync } from 'expo-crypto';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import { readPushKey } from './pushKeyStore';
import { parsePushPayload, PUSH_FALLBACK, utf8Decode, type PushPayload } from './pushPayload';

export const PUSH_TASK = 'gruenerator-push';
export const ANDROID_PUSH_CHANNEL = 'benachrichtigungen';

async function openSealed(sealed: string): Promise<PushPayload | null> {
  const keyBase64 = await readPushKey();
  if (!keyBase64) return null;
  try {
    const key = await AESEncryptionKey.import(keyBase64, 'base64');
    const bytes = await aesDecryptAsync(AESSealedData.fromCombined(sealed), key);
    return parsePushPayload(utf8Decode(bytes));
  } catch {
    return null;
  }
}

TaskManager.defineTask<Notifications.NotificationTaskPayload>(PUSH_TASK, async ({ data }) => {
  if (!data || 'actionIdentifier' in data) return;
  const sealed = data.data.gp;
  if (typeof sealed !== 'string') return;
  const payload = await openSealed(sealed);
  await Notifications.scheduleNotificationAsync({
    // Same collapse id → replaces the notification already in the tray.
    ...(payload?.collapse ? { identifier: payload.collapse } : {}),
    content: payload
      ? {
          title: payload.title,
          body: payload.body ?? '',
          data: { url: payload.url, id: payload.id },
        }
      : { ...PUSH_FALLBACK, data: {} },
    trigger: { channelId: ANDROID_PUSH_CHANNEL },
  });
});

if (Platform.OS === 'android') {
  Notifications.registerTaskAsync(PUSH_TASK).catch(() => {});
}
