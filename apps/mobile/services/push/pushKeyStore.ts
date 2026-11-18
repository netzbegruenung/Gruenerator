/**
 * Where the device key and the registration live.
 *
 * The key sits in its own keychain service inside the group the iOS
 * Notification Service Extension can read — and nothing else does: the login
 * token stays in the app's own group. Item layout must match
 * `targets/notification-service/NotificationService.swift`.
 */
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const KEY_NAME = 'push_device_key';
const KEY_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainService: 'gruenerator-push',
  ...(Platform.OS === 'ios' && {
    accessGroup: 'P74W7SGX8R.de.gruenerator.app.push',
    // The extension runs while the phone is locked.
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
  }),
};

const REGISTRATION_NAME = 'push_registration';

export interface PushRegistration {
  deviceId: string;
  userId: string;
  token: string;
  syncedAt: number;
}

export function readPushKey(): Promise<string | null> {
  return SecureStore.getItemAsync(KEY_NAME, KEY_OPTIONS);
}

export function writePushKey(base64: string): Promise<void> {
  return SecureStore.setItemAsync(KEY_NAME, base64, KEY_OPTIONS);
}

export async function readRegistration(): Promise<PushRegistration | null> {
  const raw = await SecureStore.getItemAsync(REGISTRATION_NAME);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PushRegistration;
  } catch {
    return null;
  }
}

export function writeRegistration(registration: PushRegistration): Promise<void> {
  return SecureStore.setItemAsync(REGISTRATION_NAME, JSON.stringify(registration));
}

export async function clearPushState(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(KEY_NAME, KEY_OPTIONS),
    SecureStore.deleteItemAsync(REGISTRATION_NAME),
  ]);
}
